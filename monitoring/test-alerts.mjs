import process from "node:process";
import { URL } from "node:url";
import { readFile, writeFile, mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse, stringify } from "yaml";

// Evaluate the actual provisioned PromQL and pending windows without writing
// synthetic series to Mimir or sending a notification from Grafana.
const provision = parse(
  await readFile(
    new URL("../grafana/provisioning/alerting/api.yml", import.meta.url),
    "utf8",
  ),
);
const rules = provision.groups[0].rules;
const source = {
  groups: [
    {
      name: "api",
      interval: "1m",
      rules: rules.map((rule) => ({
        alert: rule.uid,
        expr: `(${rule.data[0].model.expr}) > 0`,
        for: rule.for,
        labels: rule.labels,
      })),
    },
  ],
};
const test = parse(
  await readFile(new URL("./alert-tests.yml", import.meta.url), "utf8"),
);
const directory = await mkdtemp(join(tmpdir(), "fabricius-alerts-"));
try {
  await chmod(directory, 0o755);
  await writeFile(join(directory, "rules.yml"), stringify(source));
  await writeFile(join(directory, "tests.yml"), stringify(test));
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--entrypoint",
      "/bin/promtool",
      "-v",
      `${resolve(directory)}:/tests:ro`,
      "-w",
      "/tests",
      "prom/prometheus:v3.7.3",
      "test",
      "rules",
      "tests.yml",
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
