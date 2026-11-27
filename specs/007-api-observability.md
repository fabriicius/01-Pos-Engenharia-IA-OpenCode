# API Observability in Grafana

- **Spec:** 007-api-observability
- **Status:** ready-for-implementation
- **Created:** 2026-11-27
- **Last updated:** 2026-11-27
- **Implementation:** completed; evidence in `.plans/007-api-observability-plan.md`.
- **Source:** user request to create a Grafana dashboard, with panel/widget selection explicitly delegated to the agent; repository and connected Grafana inspection; explicit implementation approval: `/implement-me faça a implementacao da spec 007`.

## Problem & motivation

The API operator cannot tell whether requests are succeeding, which endpoint is slow, or whether authentication, database work or email dispatch caused a failure. The repository has LGTM containers and datasource provisioning, but no application instrumentation or dashboards. Connected Grafana inspection found no dashboards or Loki labels; the Mimir datasource returned an authentication failure. Direct verification found HTTP 401 `no org id` without a tenant header and a successful empty label response with `X-Scope-OrgID: fabricius`. Success means opening one reproducible dashboard and following real request outcomes through metrics, logs and traces, including failures hidden behind an intentionally generic HTTP response.

## Goals / non-goals

- **Goals:** instrument the implemented API; deliver a provisioned Grafana dashboard, correlated logs/traces and actionable alert rules; make telemetry transport work through the local LGTM stack; document verification and operating limitations.
- **Non-goals:** guarantee that every possible failure is observable, establish a contractual SLO, change authentication behavior, or infer business success solely from HTTP status.
- **Explicitly out of scope:** product analytics for future experts/connectors/tasks/artifacts, a custom React dashboard, external notification credentials, production hosting, PostgreSQL server-wide administration metrics, synthetic user accounts, and business-data backfills.

## Users & jobs to be done

- The API operator checks current health, volume, errors and latency before investigating a specific route or dependency.
- The developer follows a slow or failed request from a structured log to its trace and database/email spans.
- The maintainer recreates the dashboard and alert rules from versioned files after a Grafana restart.

## Domain model & vocabulary

- **Request outcome:** the final HTTP status, including validation, guards and unmatched paths. An HTTP 202 for password recovery means accepted, not proof that an email was sent.
- **Authentication operation:** sign-up, sign-in, confirmation, password-recovery request, password reset or session validation, identified by the implemented route.
- **Dependency outcome:** database transaction completion and email adapter completion, recorded independently of the outer request.
- **Database transaction:** the entire `UnitOfWork.run` boundary; transaction latency is not query latency. Query-level details belong to sanitized database spans unless separately measured.
- **Scrape health:** whether the collector can fetch API metrics. This is not a measured end-to-end availability SLO.
- **Readiness:** a bounded database probe from the API process. No successful probe is inferred from an empty connection pool.
- **Correlation:** trace and span identifiers stored as log fields, never metric labels.

## Scope in code

- **[current]** `apps/api/src/main.ts`, `setup.ts` and `app.module.ts`: Nest bootstrap, prefix and cross-cutting wiring.
- **[current]** `apps/api/src/auth/infrastructure/database.ts`, `unit-of-work.ts` and `email/`: PostgreSQL pool, transaction boundary and Mailtrap/Resend/console selection.
- **[target]** `apps/api/src/observability/`: metrics registry/export endpoint, bounded structured events, trace bootstrap and lifecycle management; focused tests under the same module and `apps/api/test/`.
- **[target]** `monitoring/` and `docker-compose.yml`: pinned Grafana Alloy collector, scrape/remote-write and OTLP pipelines, persistent collector state and explicit Mimir tenant configuration.
- **[target]** `grafana/dashboards/`, `grafana/provisioning/dashboards/`, `grafana/provisioning/alerting/` and existing datasource provisioning: dashboard, alert rules, stable identifiers and logs-to-traces links.
- **[target]** API dependency manifest/lockfile, `.env.example`, `.adrs/0008-api-observability.md`, `.docs/ARCHITECTURE.md`, `.docs/DEVELOPMENT.md`, `.docs/QA.md` and `README.md`.
- **[current, preserved]** application/client routes, HTTP response contracts, database schema, authentication transaction/compensation semantics and existing local data.

## Behavior

### Happy path

1. The maintainer starts the local infrastructure and API using the documented commands. Alloy scrapes a dedicated API metrics listener and receives sanitized OTLP logs/traces.
2. The operator opens **API Observability** in the **Observability** Grafana folder, initially showing the last hour with a 30-second refresh.
3. Filters select environment, instance, normalized route and HTTP method where applicable. An optional request/trace identifier filter narrows investigation panels using validated identifiers and safe query interpolation. Dependency and runtime panels clearly state when a route filter does not apply.
4. The overview exposes scrape health, database readiness, request volume/rate, successful HTTP responses, 5xx fraction and p95 latency. Success, error and latency use the same request population; probes/telemetry endpoints are excluded from application traffic.
5. The operator expands the relevant section to inspect a route, an authentication operation, database activity, email outcomes, runtime pressure or a structured event. A trace identifier opens the matching trace in Tempo.
6. Grafana evaluates provisioned alert rules and displays firing/pending/error/no-data states. External delivery remains unconfigured until an operator supplies a real contact point.

### Dashboard inventory

| Section         | Essential panels                                                                                                                                         | Interpretation                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Overview        | Scrape health; DB readiness; requests in selected range; requests/second; HTTP 2xx/3xx fraction; HTTP 5xx fraction; p95 latency                          | Health and traffic at a glance; ratios are undefined with no requests.                                   |
| HTTP endpoints  | RPS by route; status-class distribution; p50/p95/p99 latency; p95 by route; endpoint table with requests, errors and latency; in-flight/aborted requests | Normalized route and method identify bottlenecks without unbounded URL labels.                           |
| Authentication  | Request outcomes by operation/status; sign-in 401/403 rate; validation 400s; confirmation/reset 410s                                                     | Rejections are distinct from 5xx failures; this is operational visibility, not a user/account funnel.    |
| Database        | Readiness/probe latency; pool total/idle/busy/max/waiting; transaction rate and outcome; transaction p95; sanitized query traces                         | Application-view database health only; business exceptions/rollbacks are not automatically SQL failures. |
| Email           | Selected effective provider; dispatch attempts/outcomes; dispatch latency; failures; console fallback indicator                                          | Adapter acceptance is not delivery to an inbox. Console output is not a real provider delivery.          |
| Node runtime    | RSS/heap; CPU consumption; event-loop lag; uptime/restarts observable from process start                                                                 | Process metrics, not host/container memory limits or server-wide resource utilization.                   |
| Investigation   | Structured request/dependency events; error/warning logs; recent slow/error traces; alert list                                                           | Preserve filters and time window; logs link to Tempo and show explicit operation/result fields.          |
| Operating notes | Metric definitions, alert assumptions, empty-state meaning and Explore links                                                                             | Make operational limits visible in Grafana itself.                                                       |

### Edge cases & failure modes

- **Empty / single / very large data:** no traffic is not 100% success. Histograms need observations; show unavailable percentiles rather than zero latency. Initialize bounded outcome counters where appropriate so a real zero can be distinguished from a missing series. Normalize unmatched paths to one `unmatched` label and arbitrary methods to `OTHER`; never label by raw URL, user or token.
- **Stale / missing / untrusted data:** failed scrapes, stopped exporters and datasource errors must be visible. Do not globally fill absent telemetry with zeros or green health. Filters use known labels, and the selected environment is carried consistently across signals.
- **Duplicate submit / retries / concurrency / idempotency:** each HTTP attempt is a request; every underlying dependency attempt is recorded independently. Count a request once on completion or abort, never twice. Reprovisioning uses stable UIDs, preserves existing unrelated Grafana resources and creates no duplicate dashboard/rules.
- **Recoverable vs operator-only failures:** telemetry transport uses bounded asynchronous queues/retries and does not turn a successful business operation into a failure. Database outages, provider failures and collector/datasource errors have separate signals and documented diagnosis steps.

### Loading, empty & offline states

Use Grafana's native loading/error/no-data presentation, with panel descriptions explaining expected empty states and minimum observation windows. A no-traffic interval leaves request ratios and percentiles unavailable. Scrape failure and datasource failure are operational problems, not absence of traffic. No fake traffic is generated automatically to populate the dashboard.

## UX & accessibility

Use Grafana's native stat, timeseries, table, logs, traces, alert-list and text panels. Place overview first, then named collapsible sections. Keep labels and explanatory text in en-US, units explicit and legends readable; pair color with numeric/text state. Support Grafana's light theme and normal responsive panel layout without changing the user's theme preference. Keep the time picker and variables keyboard accessible through native controls. No application design-system or React component changes are needed.

## Technical approach

- **Architecture and layer ownership:** a cross-cutting observability module owns registries and exporters. HTTP instrumentation covers guards/validation/errors as well as controllers. Database and email infrastructure emit dependency signals; do not couple domain entities to a telemetry SDK. Initialize tracing before loading instrumented HTTP/PG libraries, preserving the TypeScript/decorator-compatible development bootstrap.
- **Public seam / interface:** metrics use a dedicated configurable listener, default port 9464, separate from product endpoints. Exporter startup is explicit in the real bootstrap and does not bind fixed ports in unit tests. A bounded periodic database probe feeds readiness/probe metrics without exposing connection details or changing `GET /`.
- **Data flow, persistence, and source traceability:** Prometheus-compatible API/runtime/dependency metrics → Alloy scrape → Mimir remote write; structured events → OTLP → Alloy → Loki; traces → OTLP → Alloy → Tempo. Dashboard and alert definitions are versioned provisioning artifacts. Use consistent service/environment/instance identifiers across signals and retain collector state in a named volume.
- **External boundaries and adapters:** reuse existing LGTM instances, PostgreSQL and email adapters. Configure matching `X-Scope-OrgID: fabricius` headers for Mimir ingestion and queries; a direct live probe verified this resolves the missing-tenant response. Use stable datasource UIDs while preserving compatibility with already-provisioned local sources. Notification delivery is not assumed to exist. An `Up` container state is not proof that Loki/Tempo ingesters are ready; verify actual readiness and signal ingestion.
- **Security, privacy, and observability:** allowlist structured fields. Do not export bodies, authorization/cookie headers, emails/names, tokens, full URLs/query strings, database connection strings, bind parameters, raw SQL, arbitrary exception messages/stacks or email content. Remove sensitive auto-instrumentation attributes/events before export. Console fallback intentionally prints local email content today; do not scrape stdout or automatically forward console/Nest logs to Loki. Record safe error category, operation, status, duration and trace correlation instead. Metrics labels remain bounded and traces/log identifiers remain fields. Bind collector input ports locally where host access is needed; this is a local development setup, not a production authentication model.
- **Migration, rollout, flag, and rollback:** no SQL migration or business-data backfill. Keep existing volumes. Deploy provisioning/config plus dependencies, restart affected services and start the instrumented API, then execute live probes. A disabled/export-failing telemetry path preserves business responses. Roll back source/config changes and remove only this feature's provisioned resources; do not delete volumes or unrelated dashboards.

### Alert policy

Rules evaluate every minute; annotations include the dashboard/panel link, scope, symptom and a brief first diagnostic action. These are initial operational thresholds, not negotiated SLOs.

| Rule                    | Condition                                                             | Pending period | Severity / missing data                          |
| ----------------------- | --------------------------------------------------------------------- | -------------- | ------------------------------------------------ |
| API metrics unreachable | API scrape `up == 0` or expected target series absent                 | 2 minutes      | Critical; missing series is not healthy.         |
| Database unavailable    | Most recent bounded DB probe failed while API scrape is healthy       | 2 minutes      | Critical; missing probe state is no-data/error.  |
| Elevated server errors  | 5xx fraction above 5% over 5 minutes, with at least 20 requests       | 5 minutes      | Critical; no traffic does not fire a rate alert. |
| Slow API                | HTTP p95 above 1 second over 5 minutes, with at least 20 observations | 5 minutes      | Warning; undefined percentile is no-data.        |
| Database pool pressure  | Waiting connections greater than zero                                 | 5 minutes      | Warning; missing metrics are not zero.           |
| Email dispatch failures | At least one real-provider adapter failure in the last 5 minutes      | 1 minute       | Warning; no dispatch attempts is normal.         |
| Event-loop pressure     | Event-loop lag p99 above 200 ms                                       | 5 minutes      | Warning; missing runtime metrics are no-data.    |

Datasource evaluation errors remain visible as errors. Include Grafana's resulting no-data/evaluation-error rules in operational documentation. Global collector failure cannot be inferred reliably solely by an absent individual application series, so show datasource/pipeline troubleshooting guidance instead of claiming comprehensive monitoring of the monitoring stack.

## Decisions

- **D-1 — One operational dashboard with drill-down sections:** matches the user's delegation and provides a coherent first investigation path. Rejected: many disconnected dashboards or a custom app. ADR: no. Verified by: user prompt; connected Grafana contains no dashboards.
- **D-2 — Instrument before building panels:** repository code contains no telemetry source. Rejected: dashboard queries against invented metrics. ADR: yes. Verified by: `apps/api/src/main.ts`, `setup.ts`, `auth/infrastructure/database.ts` and `docker-compose.yml`.
- **D-3 — Prometheus-compatible metrics plus OTLP logs/traces through Alloy:** keeps metric queries explicit and uses the existing LGTM backends through one collector. Rejected: synchronous per-request backend writes and new competing backends. ADR: yes. Verified by: current `monitoring/` and datasource provisioning.
- **D-4 — Separate metrics and business interfaces:** avoids adding a public product route and supports exporter lifecycle isolation in tests. Rejected: exposing diagnostic payloads through authentication endpoints. ADR: yes. Verified by: API prefix rules in `setup.ts`.
- **D-5 — Measure dependency outcomes independently:** password recovery deliberately hides email failure behind HTTP 202. Rejected: labeling every 2xx as completed business success. ADR: no. Verified by: `forgot-password.use-case.ts`, its controller and existing email factory.
- **D-6 — Application-view database scope:** pool/readiness/transaction data and query traces are available without privileged server access. Rejected: claiming server connections, locks, replication or database size without a PostgreSQL exporter. ADR: no. Verified by: `DatabaseClient` and `DrizzleUnitOfWork`.
- **D-7 — Versioned dashboard and Grafana-managed alert rules:** rules must actually evaluate, survive restart and be linked to the dashboard. Rejected: threshold colors presented as alerting, or an unversioned UI-only dashboard. ADR: yes. Verified by: existing Grafana provisioning mount in `docker-compose.yml`.
- **D-8 — Preserve Mimir multitenancy with tenant `fabricius`:** align ingestion and queries without weakening access semantics. Rejected: disabling multitenancy as the first remedy. ADR: yes. Verified by: `monitoring/mimir-config.yaml`, datasource configuration, connected query failure, and a direct labels probe returning 401 `no org id` without the header and success with `X-Scope-OrgID: fabricius`.
- **D-9 — Typed safe events, no stdout collection:** console fallback contains recipient addresses and token-bearing links. Rejected: collecting all console output or relying only on regex redaction. ADR: yes. Verified by: `email/console.adapter.ts` and its existing tests.
- **D-10 — Operational alert defaults with traffic guards:** reduce false alarms on local/low-volume traffic; keep 4xx visible separately. Rejected: paging on each invalid login or treating no traffic as an outage. ADR: no. Thresholds were selected under the user's delegated design authority and accepted with the explicit instruction to implement spec 007.

## Test strategy & seams

- **HTTP integration seam (Vitest/Supertest):** send known successful, validation, unauthorized and unmatched requests and inspect metrics/events. Catch missing middleware coverage, double counting, in-flight leaks and high-cardinality paths; misses the real collector transport. Source of truth: existing endpoint contracts and explicit request counts.
- **Dependency seam (fake pool/email adapter and real local PostgreSQL probe):** assert outcomes, latency observations, swallowed email failures and effective console provider reporting without credentials. Verify instrumentation preserves the original return value/error and transaction compensation. Source of truth: current use-case/adapter contracts and controlled failures.
- **Privacy seam:** submit unique sentinel secrets in bodies, headers, query strings and provider exceptions; inspect emitted logs/spans/metrics to prove absence. Include SQL/bind values and console fallback content. This checks actual emitted payloads, not just helper functions.
- **Provisioning/query seam:** validate JSON/YAML/Alloy configuration with supported installed tooling, start the real stack, query every panel expression against actual datasource labels, and verify stable resources after restart. This catches protocol/tenant/UID/query mismatches that mocks miss.
- **Alert seam:** use controlled query input or isolated test metrics to exercise normal, pending, firing, missing-data and evaluation-error behavior; prove traffic guards keep idle traffic quiet. Do not trigger real user notifications or modify business data for a test.
- **Regression seam:** run repository lint, type checking, tests and build. Existing authentication HTTP and compensation tests remain the behavioral source of truth. Manual Grafana inspection confirms native layout, filters, log-to-trace links and readable units.

## Acceptance criteria

- [x] AC-1 — Given the documented local stack and API are running, when Grafana opens the provisioned dashboard, then all named sections load from real datasource queries and the initial time range/refresh are one hour/30 seconds.
- [x] AC-2 — Given the current Mimir query failure, when telemetry transport is configured, then both ingestion and Grafana queries succeed with the same explicit tenant and the original local data volumes remain present.
- [x] AC-3 — Given a controlled batch of 2xx, 400, 401 and 404 requests, when metrics are scraped, then each attempt is counted once under its actual method, normalized route and status, including guard/validation failures.
- [x] AC-4 — Given arbitrary unmatched URLs, query strings and unsupported methods, when requests are recorded, then their metric label combinations remain bounded and contain no raw URL or request input.
- [x] AC-5 — Given known fast and delayed requests, when HTTP histograms are queried, then p50/p95/p99 and per-route latency use seconds and show the observed distribution.
- [x] AC-6 — Given no application traffic, when the selected interval is displayed, then no successful-request ratio or latency percentile is falsely rendered as healthy/zero and no traffic-dependent error/latency alert fires.
- [x] AC-7 — Given a failed API scrape or stopped API, when the pending period elapses, then the dashboard shows loss of metrics and the API-unreachable rule fires without mapping absence to health.
- [x] AC-8 — Given successful and failed bounded database probes, when the dashboard refreshes, then readiness/probe latency reflects the result independently of `GET /` and empty-pool state.
- [x] AC-9 — Given database activity and pool waiting, when metrics are collected, then total/idle/busy/max/waiting and transaction outcomes/latency are visible with labels that do not claim transaction duration is query duration.
- [x] AC-10 — Given a request that reaches PostgreSQL, when its trace is opened, then sanitized database spans are associated with that request and expose no SQL text, bind values or connection credentials.
- [x] AC-11 — Given real-provider success/failure or console fallback, when the email adapter completes, then the dashboard reports provider, attempt result and duration, distinguishing console output from real dispatch acceptance.
- [x] AC-12 — Given password recovery returns 202 after a dispatch failure, when telemetry is inspected, then the HTTP outcome remains 202 and the independent email failure is visible without revealing the account or token.
- [x] AC-13 — Given an authenticated request with unique secret sentinels in headers/body/query and a provider error, when all exported telemetry is inspected, then none of those values, raw SQL, email content or arbitrary error payloads is present.
- [x] AC-14 — Given structured request/dependency events, when the operator selects a trace identifier in Loki, then Tempo opens the matching trace and retains a relevant time window.
- [x] AC-15 — Given the API process is running, when runtime metrics are scraped, then RSS/heap, CPU, event-loop lag and process uptime are visible with correct units and process-level definitions.
- [x] AC-16 — Given provisioned alert rules, when their controlled conditions persist, then normal/pending/firing states and annotations are observable; missing data/evaluation errors remain visible and external notification delivery is not claimed.
- [x] AC-17 — Given an environment/instance/route/method filter selection, when the dashboard refreshes, then applicable panels use consistent scope and dependency/runtime panels explain filters that do not apply.
- [x] AC-18 — Given Grafana and Alloy restart, when they recover, then this dashboard, alert rules and datasource links remain usable without duplicates or lost existing volumes.
- [x] AC-19 — Given telemetry exporters are disabled or the collector is unavailable, when existing authentication tests and requests run, then their response/transaction/compensation contracts remain unchanged and tests do not contend for fixed exporter ports.
- [x] AC-20 — Given delivery is reviewed, when the maintainer reads the ADR and operating/QA docs, then startup, ports, tenant setup, metric definitions, limitations, alert defaults, verification and rollback are documented with passing applicable checks or explicit unresolved failures.

## Open questions & assumptions

None — the user explicitly approved implementation with `/implement-me faça a implementacao da spec 007` after reviewing the proposed scope and plan. The short feature-concept readiness pass found no material open decisions. External contact points/channels and production rollout remain deliberate exclusions, so missing credentials do not block local dashboard/alert evaluation delivery.

## Handoff to implement-me

The short readiness pass is complete and implementation is explicitly approved. Execute `.plans/007-api-observability-plan.md` without requesting the same approval again. The real API endpoint inventory is `GET /`, `POST /api/v1/auth/sign-up`, `sign-in`, `confirm-account`, `forgot-password`, `reset-password` and `GET /api/v1/auth/me`. Local Grafana is on 3002; Loki/Tempo/Mimir are on 3100/3200/9009, and PostgreSQL is on 54322. Preserve pre-existing edits in `.env.example`, `README.md`, skill directories and `supabase/snippets/`. Resolve dependency versions and installed tooling before implementation; use supported config validation and actual queries rather than marking panels complete from JSON parsing alone. Complete the ADR, focused automated coverage, live-stack verification and applicable repository quality gates before reporting delivery.
