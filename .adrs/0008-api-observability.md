# ADR 0008 — API observability boundaries and local LGTM delivery

- **Status:** accepted
- **Date:** 2026-11-27
- **Spec:** `specs/007-api-observability.md`

## Context

The repository had functioning LGTM containers and datasource provisioning but no API telemetry, dashboards or alert rules. Mimir required a tenant header: a direct request returned `401 no org id`, while `X-Scope-OrgID: fabricius` returned success. Authentication has outcomes that cannot be derived from HTTP alone: password recovery can return generic 202 after email failure, and console fallback emits a local link without dispatching an email.

## Decisions

1. Use an isolated `@prometheus-io/client` registry for request, runtime, pool, readiness, transaction and email measurements. Its dedicated metrics listener defaults to port 9464 and is started only by the real bootstrap. Preserve public HTTP response contracts and test isolation. A failed metrics bind is non-fatal and visible through scrape health.
2. Use explicit OpenTelemetry trace/log providers and manual instrumentation, with `AsyncLocalStorage` carrying the current span and server-generated request ID. Pass parent context explicitly; do not register global auto-instrumentation. This avoids unsafe default HTTP URL, SQL, bind-parameter and exception attributes and does not depend on loading third-party modules in a specific order. The installed Drizzle tracing module does not initialize its own global tracing provider.
3. Observe the pg client query boundary through a function proxy that preserves callbacks, promises, synchronous throws and query emitters. Export only the bounded SQL operation name, never SQL text or values. Transaction timing measures the entire unit of work. A bounded readiness probe and pool gauges describe the application's database perspective, not server-wide PostgreSQL health.
4. Decorate the selected email adapter at the infrastructure boundary. Record `accepted`, `failed` and `console` separately; provider acceptance is not inbox delivery. A failed dispatch remains visible when the use case deliberately hides it behind generic 202.
5. Use pinned Grafana Alloy v1.11.3 as the single scrape/OTLP entry point. Persist its remote-write state, preserve LGTM volumes and use tenant `fabricius` for Mimir writes/queries. Keep trace and log export asynchronous, with bounded SDK queues and timeouts. Collect only typed operational events; never stdout or the Docker socket.
6. Version one Grafana dashboard, existing datasource UIDs/correlation and seven Grafana-managed alert rules. Traffic-dependent rules require at least 20 observations in five minutes. Separate absence/no-data from zero and configure evaluation errors explicitly. External contact points are outside this delivery.
7. Verify real queries/ingestion and use promtool fixtures derived from the actual provisioned PromQL/pending windows for firing, pending, recovery, missing-series and low-traffic cases. The fixtures do not inject metrics into Mimir or send alerts. `yaml` is a development dependency for reading provisioning/fixtures, not an API dependency.

## Alternatives rejected

- A dashboard against hypothetical metrics would appear complete without measuring the API.
- Exporting raw stdout or broad automatic instrumentation would ingest local confirmation/reset links, SQL or payloads. Regex redaction alone would be difficult to prove safe.
- Disabling Mimir multitenancy would hide a configuration mismatch instead of fixing ingestion and queries consistently.
- Adding a separate monitoring backend/custom frontend would duplicate infrastructure already present.
- PostgreSQL exporter/server diagnostics require a separate access and scope decision; application pool/transaction data must not be labelled as server-wide measurements.

## Consequences and limitations

No database schema migration or account data backfill is required. Queued telemetry can be dropped if exporters remain unavailable; the application response is preserved. There is no durable application-side OTLP buffer, distributed upstream trace propagation, inbox-delivery tracking, SQL text collection or comprehensive monitoring of the monitoring stack. The expected-target absence alert defaults to `development/local-api` and must be updated when deployments change.

The package resolution initially found deprecated `prom-client` and `sdk-trace-node`; maintained successors were selected with compatible pinned OpenTelemetry 3.1.1/API 1.10.0/exporter 0.301.2 versions. Runtime dependencies require a supported Node version (verified with 22.22.1).

## Verification

Automated HTTP/export tests inspect actual emitted OTLP payloads with privacy sentinels and verify abort accounting, original pg/email errors, console distinction and non-fatal metrics bind failure. Live checks cover actual PromQL/LogQL/TraceQL, real HTTP-to-database trace correlation, provisioned resources and alert evaluation. Detailed commands and results are recorded in `.docs/OBSERVABILITY.md` and the implementation plan.
