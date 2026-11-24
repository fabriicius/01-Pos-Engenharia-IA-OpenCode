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

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString:
        config.get<string>("DATABASE_URL") ?? DEFAULT_DATABASE_URL,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
