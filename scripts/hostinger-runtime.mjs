import { spawn } from "node:child_process";

const processes = [
  {
    name: "web",
    command: process.execPath,
    arguments: ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"],
  },
  {
    name: "artifact-worker",
    command: process.execPath,
    arguments: ["--conditions=react-server", "--import", "tsx", "scripts/artifact-worker.ts"],
  },
];

const children = new Map();
const exited = new Set();
let shuttingDown = false;
let finalExitCode = 0;
let forceTimer;

function stop(signal = "SIGTERM", exitCode = finalExitCode) {
  if (!shuttingDown) {
    shuttingDown = true;
    finalExitCode = exitCode;
    for (const child of children.values()) {
      if (!exited.has(child.pid)) child.kill(signal);
    }
    forceTimer = setTimeout(() => {
      for (const child of children.values()) {
        if (!exited.has(child.pid)) child.kill("SIGKILL");
      }
    }, 10_000);
    forceTimer.unref();
  }
}

function finishIfStopped() {
  if (!shuttingDown || exited.size !== children.size) return;
  if (forceTimer) clearTimeout(forceTimer);
  process.exit(finalExitCode);
}

for (const definition of processes) {
  const child = spawn(definition.command, definition.arguments, {
    env: process.env,
    stdio: "inherit",
  });
  children.set(definition.name, child);

  child.once("error", (error) => {
    process.stderr.write(`${definition.name} failed to start: ${error.message}\n`);
    exited.add(child.pid);
    stop("SIGTERM", 1);
    finishIfStopped();
  });

  child.once("exit", (code, signal) => {
    exited.add(child.pid);
    if (!shuttingDown) {
      if (signal === "SIGINT" || signal === "SIGTERM") {
        stop(signal, 0);
      } else {
        process.stderr.write(`${definition.name} exited unexpectedly (${signal ?? `code ${code ?? 1}`}).\n`);
        stop("SIGTERM", code && code > 0 ? code : 1);
      }
    }
    finishIfStopped();
  });
}

process.on("SIGINT", () => stop("SIGINT", 0));
process.on("SIGTERM", () => stop("SIGTERM", 0));

process.stdout.write("Hostinger runtime started: Next.js web and artifact worker are supervised together.\n");
