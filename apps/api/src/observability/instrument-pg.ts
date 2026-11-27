import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { PoolClient } from "pg";
import { ObservabilityService } from "./observability.service";

const OPERATIONS = new Set([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE",
]);

// Keep pg's promise, callback and event-emitter query interfaces intact.
export function instrumentPgClient(
  client: PoolClient,
  telemetry: ObservabilityService,
): void {
  client.query = new Proxy(client.query, {
    apply(target, receiver, args: unknown[]) {
      const config = args[0];
      if (
        typeof config === "object" &&
        config !== null &&
        "name" in config &&
        config.name === "observability-readiness"
      )
        return Reflect.apply(target, receiver, args);
      const text =
        typeof config === "string"
          ? config
          : (config as { text?: string } | undefined)?.text;
      const keyword =
        text?.trimStart().split(/\s/, 1)[0]?.toUpperCase() ?? "OTHER";
      const operation = OPERATIONS.has(keyword) ? keyword : "OTHER";
      const span = telemetry.startSpan("database.query", SpanKind.CLIENT);
      span.setAttributes({
        "db.system.name": "postgresql",
        "db.operation.name": operation,
      });
      let done = false;
      const finish = (error?: unknown) => {
        if (done) return;
        done = true;
        if (error) span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
      };
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        args[args.length - 1] = function (
          this: unknown,
          error: unknown,
          ...values: unknown[]
        ) {
          finish(error);
          return Reflect.apply(callback, this, [error, ...values]);
        };
      }
      try {
        const result = Reflect.apply(target, receiver, args);
        if (typeof callback === "function") return result;
        if (result && typeof result.then === "function")
          return (result as Promise<unknown>).then(
            (value) => {
              finish();
              return value;
            },
            (error) => {
              finish(error);
              throw error;
            },
          );
        if (result && typeof result.once === "function") {
          result.once("end", () => finish());
          result.once("error", finish);
        } else finish();
        return result;
      } catch (error) {
        finish(error);
        throw error;
      }
    },
  });
}
