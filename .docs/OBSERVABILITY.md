# API observability

## Start and inspect

With the existing local PostgreSQL available, run `npm run dev` and `docker compose up -d`. Open [API Observability](http://localhost:3002/d/fabricius-api-observability) in **Observability**. The initial window is one hour with 30-second refresh. The dashboard has 39 content panels plus eight section rows. Definitions are read-only in Grafana because provisioning is the source of truth.

Alloy scrapes every 15 seconds. Rates need at least two scrapes; no traffic leaves response fractions/percentiles undefined. `GET /` is an application endpoint, so explicit smoke requests count as traffic. The metrics listener and database readiness probe do not count as application traffic. No sample workload runs automatically.

| Port               | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| 3000               | Existing public API contracts                              |
| 3002               | Local Grafana                                              |
| 9464               | Internal API `/metrics`, accessible to Docker host-gateway |
| 127.0.0.1:4318     | Alloy OTLP HTTP ingress                                    |
| 127.0.0.1:12345    | Alloy status/diagnostics                                   |
| 3100 / 3200 / 9009 | Existing Loki / Tempo / Mimir                              |

## Configuration

Use Node 22.15+ on the 22.x line, 24.x or 26+ (verified on 22.22.1), matching the pinned telemetry dependencies. The defaults work without new credentials. `.env.example` documents values. Compose reads root `.env`; the existing API ConfigModule reads `.env` relative to its working directory (normally `apps/api`). Supply custom values to both processes, for example with their environment or the API's local ignored `.env`; the Grafana MCP token is not an API telemetry credential.

| Variable                      | Default                 | Meaning                                                         |
| ----------------------------- | ----------------------- | --------------------------------------------------------------- |
| `OBSERVABILITY_ENABLED`       | `true`                  | `false` disables OTLP export; metrics remain available          |
| `METRICS_PORT`                | `9464`                  | Metrics port; update Alloy target if customized                 |
| `METRICS_HOST`                | `0.0.0.0`               | Allows Docker collector to reach the host listener              |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:4318` | Base collector URL, without `/v1/traces` or `/v1/logs`          |
| `OTEL_SERVICE_INSTANCE_ID`    | `local-api`             | Stable deployment instance; set consistently in API and Compose |
| `NODE_ENV`                    | `development`           | Environment label; set consistently in API and Compose          |

The Alloy scrape address is `host.docker.internal:9464`; Compose supplies `host-gateway` for Linux. Mimir ingestion and datasource queries use `X-Scope-OrgID: fabricius`. This is local development infrastructure, not a production authentication model. Each new deployment needs its own explicit expected-target absence check in the API-unreachable alert.

## What the measurements mean

- `api_http_requests_total{method,route,status}` counts completed attempts once, including validation/guard rejection. Aborted responses are 499 and also increment `api_http_aborted_total`. Unknown paths share `unmatched`, arbitrary methods share `OTHER`; incoming URLs never become labels.
- `api_http_request_duration_seconds` measures time to response completion/abort; in-flight is a whole-process gauge. HTTP 2xx/3xx means response success, not completed business work. Request counts over a time range are scrape-based `increase` estimates.
- `api_db_ready{check="postgres"}` reports the last bounded `SELECT 1` probe and is absent before the first result. Pool states are the API's total/idle/busy/waiting/max. Readiness does not alter `GET /`. Pool connection acquisition and probe queries use a two-second timeout; probes run without overlap about every 15 seconds.
- `api_db_transactions_total{outcome}` and transaction histograms measure entire units of work. A business rollback is not automatically an SQL failure. `database.query` spans measure individual pg calls and include only a bounded operation name, not SQL/parameters.
- `api_email_dispatch_total{provider,operation,outcome}` separates adapter acceptance, failure and console output. Failure can occur behind generic recovery HTTP 202. No mailbox delivery status is available. Effective provider information makes console fallback visible even before a send.
- Standard `process_*` and `nodejs_*` metrics describe process memory/CPU/event-loop behavior. CPU seconds/second approximates cores, not host utilization. Observed process start changes can miss restarts between scrapes.

All metrics include `service`, `environment` and `instance`; IDs are never metric labels. Endpoint filters scope HTTP panels. Pool, readiness, transaction, email and runtime panels explicitly ignore route/method filters. Fixed sign-in rejection panels also explain their scope.

## Logs and traces

Only allowlisted operational fields are exported. No bodies, tokens, authorization/cookies, emails/names, raw SQL, parameters, connection strings, exception messages/stacks or email contents enter the telemetry pipeline. Existing console email links remain local and are not collected.

The Loki exporter wraps the structured event in `body`. Dashboard queries unwrap it before filtering:

```logql
{job="fabricius-api"} | json | line_format "{{.body}}" | json
```

Choose a request UUID or hexadecimal trace ID in the investigation filter (empty means all); the value is encoded before interpolation and searched literally. Route/method filters narrow to HTTP events; selecting All also includes dependency events. Expand a log's **TraceID → View trace** to open Tempo. The reciprocal Tempo link opens the same trace's events in Loki with a five-minute margin. Trace IDs can have leading zeroes; both Tempo's shortened display and the log's full 32-character form identify the same trace.

```traceql
{resource.service.name="fabricius-api" && name="database.query"}
```

No global auto-instrumentation or upstream trace-context adoption is enabled. Manual parent context correlates request → transaction → pg query/email spans without importing unsafe library attributes. SDK queues are bounded to 1024 entries per signal and exports use short timeouts; outages can drop telemetry and do not change successful business responses.

## Alert rules

All seven rules evaluate every minute in Grafana. Thresholds are initial operational defaults, not contractual SLOs. Each rule links to its dashboard panel and gives the first investigation action.

| Rule                    | Condition                                                       | Pending |
| ----------------------- | --------------------------------------------------------------- | ------- |
| API metrics unreachable | Failed scrape or absent expected `development/local-api` target | 2m      |
| Database unavailable    | Failed last probe with API scrape up                            | 2m      |
| Elevated server errors  | 5xx >5%, ≥20 requests / 5m                                      | 5m      |
| Slow API                | p95 >1s, ≥20 requests / 5m                                      | 5m      |
| Database pool pressure  | Waiting connections >0                                          | 5m      |
| Email dispatch failures | At least one real-provider failure / 5m                         | 1m      |
| Event-loop pressure     | Event-loop p99 >200ms                                           | 5m      |

No-data and evaluation errors are explicit states; Grafana may create corresponding `DatasourceNoData`/`DatasourceError` alert instances. Idle traffic does not satisfy rate/latency conditions. Missing collector/backend data is not proof that the API itself is down; inspect the telemetry path. External email/Slack/webhook delivery is unconfigured; rule evaluation and the alert list are available now.

## Verify

```sh
npm run lint
npm run check-types
npm run test
npm run build
npm run observability:test-alerts
npm run observability:verify
```

The live verifier loads optional root `.env`, uses `GRAFANA_SERVICE_ACCOUNT_TOKEN` when provided, otherwise local Grafana admin credentials, and never prints credentials. It checks every panel query, saved provisioning, API scrape and evaluated rule health. It requires the services and API running and enough time for the first scrape/evaluation. The alert fixture command uses pinned `prom/prometheus:v3.7.3` in a temporary Docker container; it derives PromQL/pending windows from the actual provisioned rules. It tests all seven rules, low/idle traffic, missing targets, pending/firing and recovery without writing synthetic metrics or sending notifications.

For manual QA, explicitly request `GET /`, unauthenticated `GET /api/v1/auth/me`, malformed sign-in and an unknown path. Confirm status/route attribution and follow a log to its trace. A sign-in attempt for a nonexistent `.invalid` address exercises a read-only database lookup without creating an account or dispatching email. Inspect real query spans and pool/readiness, then filter by route/method and inspect the dashboard at desktop and narrow widths. Tests cover failed email and console outcomes using controlled adapters, not real recipients.

Existing opt-in database mutation probes remain skipped unless `RUN_DB_PROBE=1` is explicitly supplied. Server-wide PostgreSQL locks, replication, storage and slow-query text require a separately scoped exporter/diagnostics effort.

## Reprovision and roll back

Dashboard files are polled every 15 seconds. Alert/datasource files apply on Grafana startup; an operator with local admin access can call the corresponding `/api/admin/provisioning/{alerting,datasources,dashboards}/reload` endpoint or restart Grafana. Existing datasource UIDs and stable rule/dashboard UIDs prevent duplicates. The dashboard remains after restarting Grafana/Alloy; volumes are preserved.

To roll back, revert this feature's source/config/dependency changes and restart the API/Grafana through the existing workflow. Stop/remove only Alloy if no longer needed; do not delete LGTM/PostgreSQL volumes. Remove this feature's rule/dashboard provisioning if reverting them, leaving unrelated resources intact. Previously ingested data follows backend retention. No schema migration or business-data rollback is needed.
