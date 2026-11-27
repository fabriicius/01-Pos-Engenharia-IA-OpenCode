# Implementation plan — API observability

- **Spec:** `specs/007-api-observability.md`
- **Status:** done
- **Created:** 2026-11-27

## Objective

Make the existing API observable through a reproducible Grafana dashboard backed by real metrics, structured operational logs, correlated traces, and evaluated alert rules. An operator must be able to distinguish successful requests, rejected requests, server failures, unavailable dependencies, and missing telemetry.

## Context loaded

- **AGENTS.md files read:** root `AGENTS.md`, `.docs/AGENTS.md`; no nested application instructions found.
- **Context pack read:** `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/RULES.md`, `.docs/QA.md`, `.docs/BUSINESS.md`, `.docs/DESIGN.md`, `.docs/DESIGN_SYSTEM.md`.
- **Skills loaded:** `create-spec`, `feature-concept`, `implement-me`, `tdd`; `frontend-design` reviewed for layout guidance. This uses native Grafana panels rather than changing React components.
- **Verified in code/config:** `apps/api/src/main.ts`, `setup.ts`, `app.module.ts`, auth controllers/use cases, `DatabaseClient`, `DrizzleUnitOfWork`, email adapters/factory, existing HTTP tests, workspace manifests, Docker Compose, monitoring configs, datasource provisioning, ADR 0001, and spec/plan templates.
- **Live evidence:** Grafana 12.2.0 is reachable at `http://localhost:3002`; the Grafana connector lists Loki, Mimir and Tempo, zero dashboards and no alert rules. Loki lists no log labels. Mimir returns `401 no org id` without a tenant header and successful empty labels with `X-Scope-OrgID: fabricius`. `GET http://localhost:3000/` returns 200. Container uptime alone does not prove backend readiness: direct ingester readiness probes currently report a readiness wait.
- **Target items not yet implemented:** application telemetry, collection/export pipeline, operational dashboard, correlated investigations, and alert rules. No synthetic workload or backend configuration has been changed during discovery.

## Decisions carried from the spec

- Use the existing local LGTM stack and repository provisioning, with stable resource UIDs. The current Grafana MCP connection is read-only; provisioning files provide a reproducible implementation path without changing its permissions.
- Configure the same explicit Mimir tenant for writes, dashboard reads and alert evaluation. Preserve multitenancy rather than disabling it to hide the configuration error.
- Treat HTTP results and business outcomes as different signals. In particular, forgot-password's generic 202 does not prove an email was sent; console fallback does not count as provider acceptance, and provider acceptance does not prove inbox delivery.
- Prefer bounded labels and allowlisted events. Do not ingest raw application console output, which currently includes local confirmation/reset links.
- Use native Grafana layout and controls, US English labels, descriptive legends, units, threshold descriptions and visible missing-data states. Do not alter global user theme preferences or introduce a separate frontend.
- Record telemetry boundaries, privacy, collection and provisioning decisions in `.adrs/0008-api-observability.md` during implementation.

## Approach

Add a cross-cutting API observability module while preserving current HTTP contracts and domain behavior. Expose process/request/dependency metrics on a dedicated internal metrics listener, export allowlisted logs and traces using OpenTelemetry, and use a pinned Grafana Alloy container to collect and forward signals. Bind HTTP, database and email instrumentation at their transport/infrastructure boundaries. Provision the dashboard, datasource correlation and Grafana-managed alert rules from versioned files. Keep reporting asynchronous and bounded so telemetry outages cannot fail authentication requests.

## Work breakdown (vertical slices)

### Slice 1 — A request produces safe operational telemetry

- **Files:** new `apps/api/src/observability/` module; `apps/api/src/main.ts`, `app.module.ts`, `setup.ts`; API manifest and lockfile; focused API tests.
- **Behavior:** normalized method/route/status, request rate/duration/in-flight count and process/runtime measurements; a structured completion event with server-generated request ID and trace correlation; bounded unknown-route/method labels; no request/response payloads, query values, credentials or exception messages exported.
- **Seam / test:** real Supertest requests plus the metrics/export boundary. Exercise 2xx, validation 4xx, guard rejection, unexpected 5xx, unknown paths and aborted responses. Assert exact-once accounting and privacy with recognizable secret sentinels. This catches HTTP attribution and leakage, not backend ingestion.
- **Verification:** focused API tests, type check, build; existing hello-world/auth contract tests remain valid. Verify dedicated metrics listener cleanup and test isolation.

### Slice 2 — Dependency behavior is visible independently of HTTP status

- **Files:** `apps/api/src/auth/infrastructure/database.ts`, `unit-of-work.ts`, email factory/adapter wrapper; observability instruments and tests.
- **Behavior:** bounded database readiness check with timeout; pool totals/idle/waiting/capacity; transaction duration and result; correlated database operation spans without SQL text/parameters; email attempt/duration/outcome by bounded provider/type, including console fallback and caught dispatch errors.
- **Seam / test:** infrastructure public interfaces with controlled dependencies. Verify transaction commit/rollback accounting, pool/readiness behavior, email acceptance/failure/fallback, and unchanged generic forgot-password response after dispatch failure. Distinguish transaction latency from SQL query latency in labels and panel descriptions.
- **Verification:** focused behavior tests and current auth tests; optional local Postgres verification uses read-only probes or clearly marked disposable test data, never an existing user's reset/confirmation token.

### Slice 3 — Signals reach the existing local backends

- **Files:** `docker-compose.yml`, new `monitoring/alloy.alloy`, `grafana/provisioning/datasources/lgtm.yml`; monitoring configs only where required for validated ingestion compatibility; append documented settings to `.env.example` and README without replacing existing edits.
- **Behavior:** Alloy scrapes the host API metrics using Docker's host gateway and remote-writes to Mimir with the explicit tenant; OTLP logs/traces reach Loki/Tempo through Alloy. Persist Alloy's write-ahead log. Keep query URLs, credentials and payloads out of indexed labels and emitted span attributes. Use compatible pinned images/packages, with bounded buffers and retries.
- **Seam / test:** backend query APIs through the real Grafana datasources. A read-only smoke probe produces an HTTP completion event/trace; verify request and runtime metrics, a Loki event and the exact correlated Tempo trace. Check backend readiness, datasource query health and collector export errors, not only container status.
- **Verification:** `docker compose config --quiet`, Alloy configuration validation supported by the selected image, `docker compose up -d` for changed services without deleting volumes, then connector/API queries. A restarted API is required to load new application code; detect and preserve the existing development workflow.

### Slice 4 — The dashboard answers operational questions

- **Files:** new `grafana/dashboards/api-observability.json`, new `grafana/provisioning/dashboards/api.yml`, Compose dashboard mount; datasource log/trace correlations.
- **Behavior:** implement the spec's widget inventory in sections for health, HTTP/endpoints, auth outcomes, database, email, runtime, and investigation. Provide environment/instance/route/method filters and a free-text request/trace investigation filter where supported. Top-level health remains independent of an endpoint filter. Use the selected time range, sensible refresh and documented percentile windows. Include last-seen/stale telemetry, actionable empty states and links from logs to traces.
- **Seam / test:** saved dashboard rendered by real Grafana and independently queried metrics/logs/traces. Check every query against actual emitted metric names, label sets, units and datasource UIDs; exercise zero traffic, unknown paths, filters and time changes. Avoid assertions that merely copy the JSON structure.
- **Verification:** inspect the rendered dashboard in a browser at desktop and narrow viewport, verify panel errors and drilldowns, reload Grafana provisioning and confirm a single stable dashboard remains with the same UID. Do not install or configure a renderer solely to take screenshots.

### Slice 5 — Actionable alerts and a reproducible handoff

- **Files:** new `grafana/provisioning/alerting/api.yml`, `.adrs/0008-api-observability.md`, `.docs/ARCHITECTURE.md`, `.docs/QA.md`, `.docs/DEVELOPMENT.md`, README as needed.
- **Behavior:** provision the spec's seven evaluated alerts for unavailable API/database, sustained server errors/latency, pool pressure, email failures and event-loop pressure. Use explicit evaluation/pending windows, minimum traffic where relevant, scoped labels, dashboard/panel links and investigation instructions. Define missing-data and execution-error behavior rather than treating missing telemetry as healthy. Display alert state in the dashboard.
- **Notification boundary:** evaluate and display rules using existing Grafana facilities. No Slack/email/webhook destination is invented, and no outbound notification is sent as part of QA. External delivery remains unconfigured until a destination is explicitly supplied.
- **Seam / test:** real Grafana alert evaluations. Check healthy evaluation, controlled threshold violation, pending/firing/recovery and missing-series behavior using isolated temporary fixtures or pure evaluation tests; do not stop the user's running database/API just to demonstrate an alert. Remove temporary fixtures after verification.
- **Verification:** complete the checks below; document service ports, settings, metric meanings, thresholds, startup/rollback and exact Grafana dashboard URL. Report any backend, browser or alert-state verification unavailable in the environment honestly.

## Dependencies & additions

- `@prometheus-io/client` for an isolated Prometheus registry and standard Node/process metrics.
- Compatible OpenTelemetry API, Node SDK, resources and OTLP HTTP exporters for logs/traces; narrowly scoped instrumentation only where it can meet the redaction and behavior requirements. Resolve exact supported versions during implementation and lock them in `package-lock.json`.
- A pinned Grafana Alloy image for scraping and signal forwarding. Use its documented component syntax and validate the actual image configuration before rollout.
- Dedicated internal API metrics listener, local OTLP ingress and Alloy status port, with host bindings documented and no changes to the public authentication endpoints. No database schema migration is needed.

## Risks, assumptions & follow-ups

- The installed API is already running: coordinate code reload through its existing dev watcher or documented restart; do not kill unrelated processes.
- Empty traffic histories need several scrapes before rates/percentiles become meaningful. Show that condition explicitly; never manufacture healthy latency/success values.
- Instrumentation can expose SQL, token-bearing URLs and exception content by default. Prefer minimal manual attributes or explicitly sanitized library instrumentation; verify actual exported telemetry using sentinel tests.
- Dependency buffers, health probes and metrics listeners must terminate cleanly, be isolated between tests, and never block normal requests when backends are down.
- Database transaction timing includes the transaction's work and is not advertised as per-query timing. Database operation traces must describe their actual measurement boundary.
- Local development alert thresholds are starting operational thresholds, not a contractual SLO; document and make them easy to tune.
- API collection does not provide full Postgres server monitoring such as locks, replication lag, disk or slow-query statistics. A database exporter/privileged diagnostics is a separate deliberate follow-up if needed.
- Existing `.env.example`, README, untracked skills and Supabase snippets predate this task. Preserve their contents. The proposed review stage does not commit or push them.

## ADR candidates

- ADR 0008: cross-cutting observability boundaries; Prometheus metrics plus OpenTelemetry logs/traces; Alloy collection; explicit local Mimir tenant; versioned dashboards and alert provisioning; privacy and no-data semantics.

## Quality checks (from QA.md)

- [x] `npm run lint`
- [x] `npm run check-types`
- [x] `npm run test`
- [x] `npm run build`
- [x] Targeted Prettier check for changed source/config/docs.
- [x] Focused behavioral tests at the HTTP, metrics/export, transaction and email seams described above, using red/green vertical slices after plan approval.
- [x] Compose and actual Alloy configuration validation.
- [x] Successful live PromQL/LogQL/Tempo correlation, saved dashboard inspection and alert evaluation checks.

Root scripts already exist. If a Turborepo command/config must be changed, first resolve the installed package and read its bundled `docs/README.md` and relevant task pages as root `AGENTS.md` requires. No Turborepo configuration changes are planned.

## Manual QA

1. Start/reload the API and changed Compose services without removing volumes. Open `http://localhost:3002`, locate the provisioned API dashboard, and confirm expected backend/collector readiness.
2. Issue `GET /`, `GET /api/v1/auth/me` without credentials, a malformed sign-in and a random unknown path. Confirm 200/401/400/404 attribution and bounded endpoint labels, with no credentials or raw unknown path in exported telemetry.
3. Inspect endpoint traffic/status/latency and auth outcome panels. Locate an HTTP event in Loki and open its Tempo trace using the dashboard's correlation link.
4. Query the database readiness and pool metrics. Verify transaction traces/metrics with controlled integration data; do not infer SQL performance from a transaction histogram.
5. Force an email failure in an isolated test and confirm it is measured even when HTTP remains generic 202. Verify console fallback is visibly different from provider acceptance and acceptance is not labelled delivered.
6. Use route/method/environment filters, change time ranges and narrow the browser viewport; verify query errors and empty/stale states are legible. Inspect alert evaluation and run the isolated firing/recovery checks.
7. Reload provisioning and verify the dashboard/rules retain stable UIDs without duplicates and existing API/auth behavior stays unchanged.

## Rollback

Revert this feature's source, lockfile and provisioning changes, restart the API through its existing workflow, and remove/stop only the added Alloy service if necessary. Restore previous datasource settings if changed. Preserve all Docker volumes and pre-existing repository edits. Metrics/logs/traces already ingested remain subject to backend retention; no application records or database schema are changed by the feature.

## Approval

- [x] User approved implementation of this plan and the specified test seams on 2026-11-27: `/implement-me faça a implementacao da spec 007`.

Implementation authorized by the user. The prior explicit approval gate is satisfied. Package resolution found deprecations in `prom-client` and `@opentelemetry/sdk-trace-node`; use their maintained successors with compatible pinned OpenTelemetry versions.

## Implementation and verification record — 2026-11-27

Delivered the API module and HTTP middleware, typed OTLP events/manual parented spans, sanitized pg query instrumentation, transaction/readiness/pool and email boundaries, Alloy collection, existing UID/tenant/correlation configuration, 39 content panels/eight rows, seven evaluated Grafana-managed rules, ADR 0008 and operator/QA docs. Added seven API telemetry/runtime dependencies and the root development-only `yaml` parser; versions are pinned. The root Node engine range now matches the maintained telemetry dependencies: 22.15+ on the 22.x line, 24.x or 26+ (verified on 22.22.1). No SQL schema migration or production notification destination was introduced.

### Checks and evidence

- Root `npm run lint`, `npm run check-types`, `npm run test` and `npm run build` passed. After the final coverage refinements, API lint/type/test/build passed again: **85 API tests passed**, plus **56 client tests passed** (client results reused by Turbo); six existing opt-in database mutation probes were deliberately skipped without `RUN_DB_PROBE=1`.
- `npx eslint monitoring/*.mjs --max-warnings 0` passed. Prettier checks cover changed source/config/docs, excluding the dotenv example, which has no Prettier parser.
- `docker compose config --quiet` and the actual Alloy v1.11.3 `validate` command passed.
- `npm run observability:test-alerts` passed: 12 isolated scenarios derived from real provisioned PromQL/pending windows cover all seven rules, absence, pending/firing/recovery and traffic guards. They do not inject production series or send notifications.
- `npm run observability:verify` passed **88 queries**: all 44 panel expressions with All filters and with development/local-api/GET/session route selected. It also verified the saved 39-panel/eight-row dashboard, healthy API scrape and seven evaluated rule health/no-data states.
- Live Mimir ingestion and queries work with tenant `fabricius`; Loki returns structured request/dependency events; Tempo returns correlated traces. A read-only rejected sign-in trace contained five spans: HTTP → transaction → BEGIN/SELECT/COMMIT. Its SQL spans contained only database system and operation names. No account was created or email sent by this probe.
- Browser QA at desktop and 390×844: native sections, notes, alert list, logs and trace table load; route/method selections persist; health ignores route/method; mobile panels stack without horizontal page overflow. Opened a real Loki log's View trace action and confirmed the same trace in Tempo. The native optional public-dashboard metadata endpoint returns 404 in this Grafana version; it does not affect datasource/panel queries.
- Browser QA exposed generic regex interpolation escaping slashes in endpoint filters. PromQL/LogQL variable regex values now use raw string literals; both scoped and All query scenarios pass. Investigation input is an encoded literal ID search, and absent values remain valid.
- Grafana and Alloy were restarted; source UIDs, dashboard/rules, query paths and existing data volumes persisted with no duplicates. Fresh live verification passed afterward.
- No-data stats use neutral text; only concrete health values map to Ready/Unavailable. Email initialization includes only valid selected-provider outcomes and the chart draws observed activity, avoiding impossible/idle legend entries. Console-only operation evaluates the real-provider failure predicate to zero while preserving no-data if provider telemetry itself disappears.

### Acceptance coverage

| Criteria | Evidence                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1–2   | Real saved provisioning, browser inspection, tenant-backed datasource queries and preserved volumes                                                                  |
| AC-3–5   | Supertest attribution/unknown method/500 coverage, abort test and delayed-response histogram bucket test                                                             |
| AC-6–7   | No-data UI, idle/low-traffic and missing/up=0 alert fixtures, actual Grafana evaluations                                                                             |
| AC-8–9   | Controlled external pool probe success/failure, pool counts, transaction commit/rollback and shutdown tests; real local readiness                                    |
| AC-10    | Real HTTP/transaction/query trace with sanitized BEGIN/SELECT/COMMIT spans                                                                                           |
| AC-11–13 | Actual OTLP payload privacy/correlation tests, original provider error preservation and console distinction; existing generic recovery/compensation regression tests |
| AC-14–15 | Browser log-to-trace navigation and actual Node runtime metric queries/graphs                                                                                        |
| AC-16–18 | Seven evaluated rules, isolated pending/firing/recovery scenarios, scoped queries, mobile inspection and restart persistence                                         |
| AC-19    | Exporter-free app tests, ephemeral exporter ports, original pg/email outcomes and non-fatal occupied metrics listener test                                           |
| AC-20    | ADR, operating guide, QA commands/results and rollback instructions                                                                                                  |

### Limits and delivery

External notification delivery remains unconfigured. SQL text, stdout email links, server-wide PostgreSQL administration and upstream distributed trace propagation remain outside scope. Full-stack failure scenarios were exercised through isolated rule fixtures rather than stopping the user's API/database. The local Grafana connector remains read-only; implementation used the already-mounted repository provisioning path.

Repository delivery follows `implement-me` / `commit-and-push`: inspect and preserve the complete pre-existing pending set, including local MCP documentation/example changes, two skill files and the Supabase SQL snippet. No generated browser artifacts or local credentials are included.
