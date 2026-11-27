import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ROOT_CONTEXT,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "@prometheus-io/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";

const ROUTES = new Set([
  "/",
  ...[
    "sign-up",
    "sign-in",
    "confirm-account",
    "forgot-password",
    "reset-password",
    "me",
  ].map((x) => `/api/v1/auth/${x}`),
]);
const METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
type RequestScope = { span: Span; requestId: string };
type SafeFields = {
  method?: string;
  route?: string;
  status?: number;
  duration_seconds?: number;
  outcome?: string;
  provider?: string;
  operation?: string;
};

@Injectable()
export class ObservabilityService implements OnModuleDestroy {
  readonly registry = new Registry();
  private readonly scope = new AsyncLocalStorage<RequestScope>();
  private readonly resource;
  private traces: TracerProvider;
  private logs: LoggerProvider;
  private server?: Server;
  private runtimeStarted = false;
  readonly requests = this.counter(
    "api_http_requests_total",
    "Completed application HTTP attempts",
    ["method", "route", "status"],
  );
  readonly duration = this.histogram(
    "api_http_request_duration_seconds",
    "Application HTTP response time",
    ["method", "route"],
  );
  readonly inflight = this.gauge(
    "api_http_in_flight",
    "Application HTTP requests in flight",
  );
  readonly aborted = this.counter(
    "api_http_aborted_total",
    "Requests closed before response completion",
    ["method", "route"],
  );
  readonly dbReady = this.gauge(
    "api_db_ready",
    "Last bounded database probe result; absent until first probe",
    ["check"],
  );
  readonly dbProbe = this.histogram(
    "api_db_probe_duration_seconds",
    "Database readiness probe time",
    ["outcome"],
  );
  private poolCollector?: () => void;
  readonly dbPool = new Gauge({
    name: "api_db_pool_connections",
    help: "Application pool connections, not server-wide connections",
    labelNames: ["state"],
    registers: [this.registry],
    collect: () => this.poolCollector?.(),
  });
  setPoolCollector(collect: () => void): void {
    this.poolCollector = collect;
  }
  readonly transactions = this.counter(
    "api_db_transactions_total",
    "Database transactions, including business rollbacks",
    ["outcome"],
  );
  readonly transactionDuration = this.histogram(
    "api_db_transaction_duration_seconds",
    "Whole transaction duration, not SQL query latency",
    ["outcome"],
  );
  readonly emailProvider = this.gauge(
    "api_email_provider_info",
    "Selected effective email adapter",
    ["provider"],
  );
  readonly emails = this.counter(
    "api_email_dispatch_total",
    "Email adapter outcomes; acceptance is not inbox delivery",
    ["provider", "operation", "outcome"],
  );
  readonly emailDuration = this.histogram(
    "api_email_dispatch_duration_seconds",
    "Email adapter duration",
    ["provider", "operation"],
  );

  constructor(private readonly config: ConfigService) {
    const environment = config.get<string>("NODE_ENV") ?? "development";
    const instance =
      config.get<string>("OTEL_SERVICE_INSTANCE_ID") ?? "local-api";
    this.registry.setDefaultLabels({
      service: "fabricius-api",
      environment,
      instance,
    });
    this.resource = resourceFromAttributes({
      "service.name": "fabricius-api",
      "service.instance.id": instance,
      "deployment.environment.name": environment,
    });
    this.traces = new TracerProvider({ resource: this.resource });
    this.logs = new LoggerProvider({ resource: this.resource });
    this.inflight.set(0);
    for (const outcome of ["committed", "rolled_back"])
      this.transactions.inc({ outcome }, 0);
  }

  private counter(name: string, help: string, labelNames: string[]) {
    return new Counter({ name, help, labelNames, registers: [this.registry] });
  }
  private gauge(name: string, help: string, labelNames: string[] = []) {
    return new Gauge({ name, help, labelNames, registers: [this.registry] });
  }
  private histogram(name: string, help: string, labelNames: string[]) {
    return new Histogram({
      name,
      help,
      labelNames,
      buckets: BUCKETS,
      registers: [this.registry],
    });
  }

  // No auto-instrumentation: raw HTTP/SQL/provider attributes never enter the export pipeline.
  startSpan(name: string, kind = SpanKind.INTERNAL): Span {
    const parent = this.scope.getStore()?.span;
    return this.traces
      .getTracer("fabricius-api")
      .startSpan(
        name,
        { kind },
        parent ? trace.setSpan(ROOT_CONTEXT, parent) : ROOT_CONTEXT,
      );
  }

  async operation<T>(
    name: "database.transaction" | "email.dispatch",
    fields: SafeFields,
    work: () => Promise<T>,
  ): Promise<T> {
    const span = this.startSpan(
      name,
      name === "email.dispatch" ? SpanKind.CLIENT : SpanKind.INTERNAL,
    );
    const parent = this.scope.getStore();
    return this.scope.run(
      { span, requestId: parent?.requestId ?? randomUUID() },
      async () => {
        const start = performance.now();
        try {
          const value = await work();
          this.event(
            name,
            {
              ...fields,
              outcome: fields.outcome ?? "success",
              duration_seconds: (performance.now() - start) / 1000,
            },
            span,
          );
          return value;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          this.event(
            name,
            {
              ...fields,
              outcome: "failed",
              duration_seconds: (performance.now() - start) / 1000,
            },
            span,
          );
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  event(
    event: string,
    fields: SafeFields,
    span = this.scope.getStore()?.span,
  ): void {
    const level =
      fields.outcome === "failed" || (fields.status ?? 0) >= 500
        ? "error"
        : (fields.status ?? 0) >= 400 || fields.outcome === "console"
          ? "warn"
          : "info";
    const record = {
      event,
      level,
      ...fields,
      request_id: this.scope.getStore()?.requestId,
      trace_id: span?.spanContext().traceId,
      span_id: span?.spanContext().spanId,
      environment: this.config.get<string>("NODE_ENV") ?? "development",
      instance:
        this.config.get<string>("OTEL_SERVICE_INSTANCE_ID") ?? "local-api",
    };
    this.logs.getLogger("fabricius-api").emit({
      body: JSON.stringify(record),
      severityText: level,
      severityNumber: level === "error" ? 17 : level === "warn" ? 13 : 9,
    });
  }

  middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    const method = METHODS.has(req.method ?? "") ? req.method! : "OTHER";
    const span = this.startSpan("http.request", SpanKind.SERVER);
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    this.scope.run({ span, requestId }, () => {
      const start = performance.now();
      this.inflight.inc();
      let done = false;
      const finish = (aborted: boolean) => {
        if (done) return;
        done = true;
        // Express's matched route template is bounded; incoming URLs are never recorded.
        const template = (
          req as IncomingMessage & { route?: { path?: string } }
        ).route?.path;
        const route = template && ROUTES.has(template) ? template : "unmatched";
        const elapsed = (performance.now() - start) / 1000;
        this.inflight.dec();
        if (aborted) this.aborted.inc({ method, route });
        const status = aborted ? 499 : res.statusCode;
        this.requests.inc({ method, route, status: String(status) });
        this.duration.observe({ method, route }, elapsed);
        span.updateName(`${method} ${route}`);
        span.setAttributes({
          "http.request.method": method,
          "http.route": route,
          "http.response.status_code": status,
          "request.id": requestId,
        });
        if (status >= 500 || aborted)
          span.setStatus({ code: SpanStatusCode.ERROR });
        this.event(
          "http.request",
          {
            method,
            route,
            status,
            duration_seconds: elapsed,
            outcome: aborted
              ? "aborted"
              : status >= 500
                ? "failed"
                : status >= 400
                  ? "rejected"
                  : "success",
          },
          span,
        );
        span.end();
      };
      res.once("finish", () => finish(false));
      res.once("close", () => finish(!res.writableFinished));
      next();
    });
  };

  async start(): Promise<void> {
    if (this.server) return;
    if (!this.runtimeStarted) {
      collectDefaultMetrics({ register: this.registry });
      this.runtimeStarted = true;
    }
    if (this.config.get<string>("OBSERVABILITY_ENABLED") !== "false") {
      const endpoint = (
        this.config.get<string>("OTEL_EXPORTER_OTLP_ENDPOINT") ??
        "http://127.0.0.1:4318"
      ).replace(/\/$/, "");
      await Promise.all([this.traces.shutdown(), this.logs.shutdown()]);
      this.traces = new TracerProvider({
        resource: this.resource,
        spanProcessors: [
          new BatchSpanProcessor({
            exporter: new OTLPTraceExporter({
              url: `${endpoint}/v1/traces`,
              timeoutMillis: 2000,
            }),
            maxQueueSize: 1024,
            maxExportBatchSize: 128,
            scheduledDelayMillis: 1000,
            exportTimeoutMillis: 3000,
          }),
        ],
      });
      this.logs = new LoggerProvider({
        resource: this.resource,
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: `${endpoint}/v1/logs`,
              timeoutMillis: 2000,
            }),
            maxQueueSize: 1024,
            maxExportBatchSize: 128,
            scheduledDelayMillis: 1000,
            exportTimeoutMillis: 3000,
          }),
        ],
      });
    }
    this.server = createServer(async (req, res) => {
      if (req.url !== "/metrics") {
        res.writeHead(404).end();
        return;
      }
      try {
        res.setHeader("Content-Type", this.registry.contentType);
        res.end(await this.registry.metrics());
      } catch {
        res.writeHead(503).end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(
        Number(this.config.get<string>("METRICS_PORT") ?? 9464),
        this.config.get<string>("METRICS_HOST") ?? "0.0.0.0",
        resolve,
      );
    }).catch(() => {
      this.event("metrics.listener", { outcome: "failed" });
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.server?.listening)
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    await Promise.allSettled([this.traces.shutdown(), this.logs.shutdown()]);
    this.registry.clear();
    this.scope.disable();
  }
}
