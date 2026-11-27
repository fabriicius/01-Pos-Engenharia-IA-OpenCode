import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservabilityService } from "../src/observability/observability.service";
import { DatabaseClient } from "../src/auth/infrastructure/database";
import { DrizzleUnitOfWork } from "../src/auth/infrastructure/unit-of-work";

const control = vi.hoisted(() => ({ fail: false, queries: 0 }));
vi.mock("pg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pg")>();
  const { EventEmitter } = await import("node:events");
  class FakePool extends EventEmitter {
    totalCount = 2;
    idleCount = 1;
    waitingCount = 3;
    options = { max: 10 };
    async query() {
      control.queries++;
      if (control.fail) throw new Error("private-database-error");
      return { rows: [] };
    }
    async connect() {
      return { query: this.query.bind(this), release: () => undefined };
    }
    async end() {}
  }
  return { ...actual, Pool: FakePool, default: { ...actual, Pool: FakePool } };
});

describe("database monitoring boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
    control.fail = false;
    control.queries = 0;
  });

  it("reports real probe outcomes and pool state, starts once and stops probing after shutdown", async () => {
    vi.useFakeTimers();
    const telemetry = new ObservabilityService(new ConfigService());
    const database = new DatabaseClient(new ConfigService(), telemetry);
    try {
      expect(await telemetry.registry.metrics()).not.toMatch(
        /^api_db_ready\{/m,
      );
      database.startMonitoring();
      database.startMonitoring();
      await vi.advanceTimersByTimeAsync(0);
      expect(control.queries).toBe(1);
      let metrics = await telemetry.registry.metrics();
      expect(metrics).toMatch(/api_db_ready\{check="postgres"[^}]*\} 1/);
      expect(metrics).toMatch(/api_db_pool_connections\{state="busy"[^}]*\} 1/);
      expect(metrics).toMatch(
        /api_db_pool_connections\{state="waiting"[^}]*\} 3/,
      );
      control.fail = true;
      await vi.advanceTimersByTimeAsync(15000);
      metrics = await telemetry.registry.metrics();
      expect(metrics).toMatch(/api_db_ready\{check="postgres"[^}]*\} 0/);
      expect(metrics).not.toContain("private-database-error");
      await database.onModuleDestroy();
      const stoppedAt = control.queries;
      await vi.advanceTimersByTimeAsync(30000);
      expect(control.queries).toBe(stoppedAt);
    } finally {
      await database.onModuleDestroy();
      await telemetry.onModuleDestroy();
    }
  });

  it("keeps transaction return values and original rollback errors while measuring their distinct outcomes", async () => {
    const telemetry = new ObservabilityService(new ConfigService());
    const database = new DatabaseClient(new ConfigService(), telemetry);
    const unit = new DrizzleUnitOfWork(database, telemetry);
    const original = new Error("business rejected");
    try {
      await expect(unit.run(async () => 42)).resolves.toBe(42);
      await expect(
        unit.run(async () => {
          throw original;
        }),
      ).rejects.toBe(original);
      const metrics = await telemetry.registry.metrics();
      expect(metrics).toMatch(
        /api_db_transactions_total\{outcome="committed"[^}]*\} 1/,
      );
      expect(metrics).toMatch(
        /api_db_transactions_total\{outcome="rolled_back"[^}]*\} 1/,
      );
    } finally {
      await database.onModuleDestroy();
      await telemetry.onModuleDestroy();
    }
  });
});
