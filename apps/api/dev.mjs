import { spawn, spawnSync } from "node:child_process";

const tscArgs = ["-p", "tsconfig.build.json"];
const shell = process.platform === "win32";

// Nest needs emitDecoratorMetadata, which tsx/esbuild does not provide.
// Compile once up front so dist/main.js exists, then keep tsc and the app in watch mode.
const initial = spawnSync("tsc", tscArgs, { stdio: "inherit", shell });
if (initial.status !== 0) {
  process.exit(initial.status ?? 1);
}

const compiler = spawn("tsc", [...tscArgs, "--watch"], {
  stdio: "inherit",
  shell,
});
const server = spawn(process.execPath, ["--watch-path=dist", "dist/main.js"], {
  stdio: "inherit",
});

function shutdown() {
  server.kill();
  compiler.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
compiler.on("exit", (code) => {
  server.kill();
  process.exit(code ?? 0);
});
server.on("exit", (code) => {
  compiler.kill();
  process.exit(code ?? 0);
});
