import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ExtractTablesWithRelations } from "drizzle-orm";
import {
  drizzle,
  NodePgDatabase,
  NodePgQueryResultHKT,
} from "drizzle-orm/node-postgres";
import { PgTransaction } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { ObservabilityService } from "../../observability/observability.service";
import { instrumentPgClient } from "../../observability/instrument-pg";
import * as schema from "./schema";

export const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type Database = NodePgDatabase<typeof schema>;

export type Transaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

@Injectable()
export class DatabaseClient implements OnModuleDestroy {
  readonly db: Database;
  private readonly pool: Pool;

  private monitor?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private monitoringStarted = false;

  constructor(
    config: ConfigService,
    private readonly telemetry: ObservabilityService,
  ) {
    this.pool = new Pool({
      connectionTimeoutMillis: 2000,
      connectionString:
        config.get<string>("DATABASE_URL") ?? DEFAULT_DATABASE_URL,
    });
    this.pool.on("connect", (client) => instrumentPgClient(client, telemetry));
    this.pool.on("error", () =>
      telemetry.event("database.pool", { outcome: "failed" }),
    );
    this.db = drizzle(this.pool, { schema });
  }

  startMonitoring(): void {
    if (this.monitoringStarted) return;
    this.monitoringStarted = true;
    const poll = async () => {
      const start = performance.now();
      let ready = false;
      try {
        const probe = {
          name: "observability-readiness",
          text: "SELECT 1",
          query_timeout: 2000,
        };
        await this.pool.query(probe);
        ready = true;
      } catch {
        /* No database errors/credentials are exported. */
      }
      if (this.stopped) return;
      this.telemetry.dbReady.set({ check: "postgres" }, ready ? 1 : 0);
      this.telemetry.dbProbe.observe(
        { outcome: ready ? "success" : "failed" },
        (performance.now() - start) / 1000,
      );
      this.monitor = setTimeout(() => {
        void poll();
      }, 15000);
      this.monitor.unref();
    };
    this.telemetry.setPoolCollector(() => {
      for (const [state, value] of Object.entries({
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        busy: this.pool.totalCount - this.pool.idleCount,
        waiting: this.pool.waitingCount,
        max: this.pool.options.max ?? 10,
      }))
        this.telemetry.dbPool.set({ state }, value);
    });
    void poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.monitor);
    await this.pool.end();
  }
}
