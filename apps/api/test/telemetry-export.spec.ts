import type { Histogram } from "@prometheus-io/client";
import { ConfigService } from "@nestjs/config";
import { createServer, get, Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { ObservabilityService } from "../src/observability/observability.service";
import { ObservedEmailService } from "../src/observability/observed-email";
import { instrumentPgClient } from "../src/observability/instrument-pg";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

describe("actual telemetry export boundary", () => {
  it("exports correlated SQL and failed email spans without sensitive values and preserves adapter errors", async () => {
    const received: Buffer[] = [];
    const paths: string[] = [];
    const receiver = createServer((req, res) => {
      paths.push(req.url!);
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        received.push(Buffer.concat(chunks));
        res.writeHead(200, { "Content-Type": "application/x-protobuf" }).end();
      });
    });
    const port = await listen(receiver);
    const telemetry = new ObservabilityService(
      new ConfigService({
        NODE_ENV: "test",
        METRICS_PORT: "0",
        METRICS_HOST: "127.0.0.1",
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      }),
    );
    const failure = new Error("private-provider-sentinel");
    const email = new ObservedEmailService(
      {
        send: async () => {
          throw failure;
        },
      },
      "resend",
      telemetry,
    );
    const client = {
      query: async () => ({ rows: [{ value: "private-row-sentinel" }] }),
    } as unknown as PoolClient;
    instrumentPgClient(client, telemetry);
    try {
      await telemetry.start();
      await expect(
        telemetry.operation("database.transaction", {}, async () => {
          const result = await client.query("SELECT 'private-sql-sentinel'", [
            "private-bind-sentinel",
          ]);
          expect(result.rows).toEqual([{ value: "private-row-sentinel" }]);
          await email.send({
            to: "private-recipient-sentinel@example.com",
            subject: "Reset your password",
            text: "private-token-sentinel",
          });
        }),
      ).rejects.toBe(failure);
      const metrics = await telemetry.registry.metrics();
      expect(metrics).toMatch(
        /api_email_dispatch_total\{provider="resend",operation="password-reset",outcome="failed"[^}]*\} 1/,
      );
      expect(metrics).not.toContain("private-");
    } finally {
      await telemetry.onModuleDestroy();
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
    expect(paths).toContain("/v1/traces");
    expect(paths).toContain("/v1/logs");
    const payload = Buffer.concat(received).toString("utf8");
    expect(payload).toContain("database.query");
    expect(payload).toContain("db.operation.name");
    expect(payload).toContain("SELECT");
    expect(payload).toContain("email.dispatch");
    expect(payload).toContain('"outcome":"failed"');
    expect(payload).not.toContain("private-");
    const ids = [...payload.matchAll(/"trace_id":"([a-f0-9]{32})"/g)].map(
      (x) => x[1],
    );
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(1);
  });

  it("reports console fallback separately from provider acceptance", async () => {
    const telemetry = new ObservabilityService(
      new ConfigService({ NODE_ENV: "test" }),
    );
    const email = new ObservedEmailService(
      { send: async () => undefined },
      "console",
      telemetry,
    );
    try {
      await email.send({
        to: "ignored",
        subject: "Confirm your account",
        text: "ignored",
      });
      const metrics = await telemetry.registry.metrics();
      expect(metrics).toMatch(
        /api_email_dispatch_total\{provider="console",operation="confirmation",outcome="console"[^}]*\} 1/,
      );
      expect(metrics).not.toContain(
        'provider="console",operation="confirmation",outcome="accepted"',
      );
    } finally {
      await telemetry.onModuleDestroy();
    }
  });

  it("places a deliberately delayed response in the correct latency buckets", async () => {
    const telemetry = new ObservabilityService(new ConfigService());
    const server = createServer((req, res) =>
      telemetry.middleware(req, res, () => {
        setTimeout(() => res.end("ok"), 70);
      }),
    );
    const port = await listen(server);
    try {
      await new Promise<void>((resolve, reject) => {
        get(`http://127.0.0.1:${port}/`, (res) => {
          res.resume();
          res.on("end", resolve);
        }).on("error", reject);
      });
      const metric = await (
        telemetry.registry.getSingleMetric(
          "api_http_request_duration_seconds",
        ) as Histogram<string>
      ).get();
      const shortBucket = metric.values.find(
        (sample) =>
          sample.metricName?.endsWith("_bucket") &&
          Number(sample.labels.le) === 0.05,
      );
      const count = metric.values.find((sample) =>
        sample.metricName?.endsWith("_count"),
      );
      expect(shortBucket?.value).toBe(0);
      expect(count?.value).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await telemetry.onModuleDestroy();
    }
  });

  it("counts a disconnected HTTP response once and releases in-flight accounting", async () => {
    const telemetry = new ObservabilityService(new ConfigService());
    let closed!: () => void;
    const serverClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const server = createServer((req, res) => {
      telemetry.middleware(req, res, () => {
        res.writeHead(200);
        res.flushHeaders();
      });
      res.once("close", closed);
    });
    const port = await listen(server);
    try {
      await new Promise<void>((resolve, reject) => {
        const req = get(`http://127.0.0.1:${port}/private-path`, (res) => {
          res.destroy();
          res.once("close", () => setImmediate(resolve));
        });
        req.on("error", reject);
      });
      await serverClosed;
      const metrics = await telemetry.registry.metrics();
      expect(metrics).toMatch(
        /api_http_requests_total\{method="GET",route="unmatched",status="499"[^}]*\} 1/,
      );
      expect(metrics).toMatch(
        /api_http_aborted_total\{method="GET",route="unmatched"[^}]*\} 1/,
      );
      expect(metrics).toMatch(/api_http_in_flight\{[^}]*\} 0/);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await telemetry.onModuleDestroy();
    }
  });

  it("keeps telemetry startup non-fatal when the metrics port is occupied", async () => {
    const busy = createServer();
    const port = await listen(busy);
    const telemetry = new ObservabilityService(
      new ConfigService({
        METRICS_PORT: String(port),
        METRICS_HOST: "127.0.0.1",
        OBSERVABILITY_ENABLED: "false",
      }),
    );
    try {
      await expect(telemetry.start()).resolves.toBeUndefined();
    } finally {
      await telemetry.onModuleDestroy();
      await new Promise<void>((resolve) => busy.close(() => resolve()));
    }
  });

  it("preserves pg callback completion and synchronous errors", async () => {
    const telemetry = new ObservabilityService(new ConfigService());
    const failure = new Error("original");
    const client = {
      query: (...args: unknown[]) => {
        const cb = args.at(-1);
        if (typeof cb === "function") {
          cb(null, { rows: [1] });
          return;
        }
        throw failure;
      },
    } as unknown as PoolClient;
    instrumentPgClient(client, telemetry);
    try {
      await new Promise<void>((resolve, reject) =>
        client.query("SELECT 1", (error, result) => {
          if (error) reject(error);
          else {
            expect(result.rows).toEqual([1]);
            resolve();
          }
        }),
      );
      expect(() => client.query("SELECT 2")).toThrow(failure);
    } finally {
      await telemetry.onModuleDestroy();
    }
  });
});
