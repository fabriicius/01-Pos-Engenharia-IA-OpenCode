/* eslint turbo/no-undeclared-env-vars: "off" -- Direct, uncached operator CLI; credentials must not become Turbo cache inputs. */
import process from "node:process";
import { Buffer } from "node:buffer";
import { URL, URLSearchParams } from "node:url";
import console from "node:console";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const base = process.env.GRAFANA_URL ?? "http://localhost:3002";
const headers = {
  Authorization: process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN
    ? `Bearer ${process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`
    : `Basic ${Buffer.from(`${process.env.GRAFANA_ADMIN_USER ?? "admin"}:${process.env.GRAFANA_ADMIN_PASSWORD ?? "admin"}`).toString("base64")}`,
};
async function get(path) {
  const response = await globalThis.fetch(new URL(path, base), {
    headers,
    signal: globalThis.AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`${path.split("?")[0]}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.status === "error")
    throw new Error(data.error ?? "Datasource query failed");
  return data;
}
const dashboard = JSON.parse(
  await readFile(
    new URL("../grafana/dashboards/api-observability.json", import.meta.url),
  ),
);
const config = parse(
  await readFile(
    new URL("../grafana/provisioning/alerting/api.yml", import.meta.url),
    "utf8",
  ),
);
let count = 0;
for (const selection of [
  { environment: ".*", instance: ".*", route: ".*", method: ".*" },
  {
    environment: "development",
    instance: "local-api",
    route: "\\/api\\/v1\\/auth\\/me",
    method: "GET",
  },
]) {
  for (const panel of dashboard.panels) {
    for (const target of panel.targets ?? []) {
      let query = target.expr ?? target.query;
      for (const name of ["environment", "instance", "route", "method"])
        query = query.replaceAll(`\${${name}:regex}`, selection[name]);
      query = query
        .replaceAll("${investigation:percentencode}", "")
        .replaceAll("$__rate_interval", "1m")
        .replaceAll("$__range", "1h");
      let path;
      if (target.datasource.type === "prometheus")
        path = `/api/datasources/proxy/uid/${target.datasource.uid}/api/v1/query?${new URLSearchParams({ query })}`;
      else if (target.datasource.type === "loki")
        path = `/api/datasources/proxy/uid/${target.datasource.uid}/loki/api/v1/query_range?${new URLSearchParams({ query, limit: "3" })}`;
      else
        path = `/api/datasources/proxy/uid/${target.datasource.uid}/api/search?${new URLSearchParams({ q: query, limit: "3" })}`;
      try {
        await get(path);
      } catch (error) {
        throw new Error(`${panel.title}: ${error.message}`, { cause: error });
      }
      count++;
    }
  }
}
const saved = await get(`/api/dashboards/uid/${dashboard.uid}`);
if (saved.dashboard.panels.length !== dashboard.panels.length)
  throw new Error("Saved dashboard differs from provisioned source");
const rules = await get("/api/prometheus/grafana/api/v1/rules");
const expected = new Set(
  config.groups.flatMap((group) => group.rules.map((rule) => rule.title)),
);
const evaluated = rules.data.groups
  .flatMap((group) => group.rules)
  .filter((rule) => expected.has(rule.name));
if (
  evaluated.length !== expected.size ||
  evaluated.some((rule) => !["ok", "nodata"].includes(rule.health))
)
  throw new Error(
    "Some provisioned alert rules have not evaluated successfully",
  );
const metric = await get(
  "/api/datasources/proxy/uid/PAE45454D0EDB9216/api/v1/query?query=up%7Bjob%3D%22fabricius-api%22%7D",
);
if (!metric.data.result.some((series) => series.value[1] === "1"))
  throw new Error("No healthy API scrape");
console.log(
  `Verified ${count} panel queries, ${dashboard.panels.length - dashboard.panels.filter((panel) => panel.type === "row").length} content panels, saved provisioning, healthy API scrape and ${evaluated.length} evaluated alert rules (no-data states remain explicit).`,
);
