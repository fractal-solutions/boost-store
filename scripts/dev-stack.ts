#!/usr/bin/env bun
/**
 * Cross-platform local dev stack for Boost Store.
 *
 *   bun run dev:stack
 *
 * Starts (if not already running):
 *   uber-delivery-mock-api  (mock Uber)          http://localhost:3000
 *   boost-carrier           (Uber Direct proxy)  http://localhost:5000
 *   boost-store             (this app)           http://localhost:4000
 *
 * Expects the two sibling repos next to this one:
 *   ../uber-delivery-mock-api
 *   ../boost-carrier
 *
 * Works on Windows, macOS and Linux â€” no shell scripts required.
 */

import path from "node:path";

const storeDir = path.resolve(import.meta.dir, "..");
const devDir = path.dirname(storeDir);
const mockDir = path.join(devDir, "uber-delivery-mock-api");
const carrierDir = path.join(devDir, "boost-carrier");

const MOCK_PORT = 3000;
const CARRIER_PORT = 5000;
const STORE_PORT = 4000;
const WEBHOOK_KEY = "dev-webhook-key";

const tty = Boolean(process.stdout.isTTY);
const paint = (code: string) => (text: string) => (tty ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = paint("2");
const red = paint("31");
const green = paint("32");
const cyan = paint("36");
const yellow = paint("33");

const children: Bun.Subprocess[] = [];
let shuttingDown = false;

/**
 * Pick a Python that actually runs. On Windows, `Bun.which("python3")` can
 * resolve to the Microsoft Store alias, which prints "Python was not found"
 * and exits non-zero, so we verify each candidate by running `--version`.
 */
async function resolvePython(): Promise<string> {
  const candidates = process.env.PYTHON
    ? [process.env.PYTHON]
    : process.platform === "win32"
      ? ["python", "py", "python3"]
      : ["python3", "python"];
  for (const candidate of candidates) {
    try {
      const proc = Bun.spawn([candidate, "--version"], { stdout: "pipe", stderr: "pipe" });
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      if ((await proc.exited) === 0 && /Python \d/.test(`${out}${err}`)) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return candidates[0] ?? "python";
}

function prefixStream(stream: ReadableStream<Uint8Array> | undefined | null, label: string, color: (text: string) => string): void {
  if (!stream) return;
  const decoder = new TextDecoder();
  (async () => {
    let buffer = "";
    for await (const chunk of stream) {
      buffer += decoder.decode(chunk, { stream: true });
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.trim()) console.log(`${color(`[${label}]`)} ${line}`);
        index = buffer.indexOf("\n");
      }
    }
    if (buffer.trim()) console.log(`${color(`[${label}]`)} ${buffer}`);
  })().catch(() => {});
}

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, label: string, timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(url)) return true;
    await Bun.sleep(300);
  }
  console.error(red(`Timed out waiting for ${label} (${url}).`));
  return false;
}

function start(label: string, color: (text: string) => string, cmd: string[], cwd: string, env: Record<string, string | undefined>): Bun.Subprocess {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  prefixStream(proc.stdout, label, color);
  prefixStream(proc.stderr, label, color);
  children.push(proc);
  return proc;
}

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${dim("stopping stackâ€¦")}`);
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // already gone
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main(): Promise<void> {
  if (!(await Bun.file(path.join(mockDir, "run.py")).exists())) {
    throw new Error(`uber-delivery-mock-api not found at ${mockDir}. Clone it next to boost-store.`);
  }
  if (!(await Bun.file(path.join(carrierDir, "server.ts")).exists())) {
    throw new Error(`boost-carrier not found at ${carrierDir}. Clone it next to boost-store.`);
  }

  console.log(cyan("\nBoost Store - local dev stack\n"));
  const python = await resolvePython();

  // 1. Mock Uber API
  if (await isUp(`http://localhost:${MOCK_PORT}/`)) {
    console.log(`${green("[ok]")} mock API already running on :${MOCK_PORT}`);
  } else {
    console.log(`starting ${dim("uber-delivery-mock-api")} on :${MOCK_PORT} (${python} run.py)`);
    start("mock", cyan, [python, "run.py"], mockDir, {
      PORT: String(MOCK_PORT),
      WEBHOOK_URL: `http://localhost:${CARRIER_PORT}/webhook/uber`,
      UBER_WEBHOOK_SIGNING_KEY: WEBHOOK_KEY,
    });
    await waitFor(`http://localhost:${MOCK_PORT}/`, "mock API");
  }

  // 2. boost-carrier (Uber Direct proxy)
  if (await isUp(`http://localhost:${CARRIER_PORT}/health`)) {
    console.log(`${green("âœ“")} boost-carrier already running on :${CARRIER_PORT}`);
  } else {
    console.log(`starting ${dim("boost-carrier")} on :${CARRIER_PORT}`);
    start("carrier", yellow, ["bun", "server.ts"], carrierDir, {
      PORT: String(CARRIER_PORT),
      UBER_API_BASE_URL: `http://localhost:${MOCK_PORT}`,
      UBER_TOKEN_URL: `http://localhost:${MOCK_PORT}/oauth/v2/token`,
      UBER_CLIENT_ID: "test-client-id",
      UBER_CLIENT_SECRET: "test-client-secret",
      UBER_CUSTOMER_ID: "PENDING_MERCHANT_ID_PLACEHOLDER",
      ADDRESS_VALIDATION_ENABLED: "false",
      UBER_WEBHOOK_SIGNING_KEY: WEBHOOK_KEY,
      DELIVERY_WEBHOOK_FORWARD_URL: `http://localhost:${STORE_PORT}/api/delivery/webhook`,
    });
    await waitFor(`http://localhost:${CARRIER_PORT}/health`, "boost-carrier");
  }

  // 3. boost-store
  if (await isUp(`http://localhost:${STORE_PORT}/api/health`)) {
    console.log(`${green("âœ“")} boost-store already running on :${STORE_PORT}`);
  } else {
    console.log(`starting ${dim("boost-store")} on :${STORE_PORT}`);
    start("store", green, ["bun", "src/index.ts"], storeDir, {
      PORT: String(STORE_PORT),
      DELIVERY_PROVIDER: "boost-carrier",
      BOOST_CARRIER_URL: `http://localhost:${CARRIER_PORT}`,
      DELIVERY_WEBHOOK_SECRET: WEBHOOK_KEY,
      // Align the demo map with the mock's fixed courier location (San Francisco).
      DEMO_PICKUP_LAT: "37.7749",
      DEMO_PICKUP_LNG: "-122.4194",
      DEMO_DROPOFF_LAT: "37.7849",
      DEMO_DROPOFF_LNG: "-122.4094",
    });
    await waitFor(`http://localhost:${STORE_PORT}/api/health`, "boost-store");
  }

  console.log(`
${green("Stack ready")}
  store    ${cyan(`http://localhost:${STORE_PORT}`)}   ${dim("admin: demo@booststore.app / booststore")}
  carrier  http://localhost:${CARRIER_PORT}
  mock     http://localhost:${MOCK_PORT}

Press ${dim("Ctrl+C")} to stop everything.
`);

  // Keep running until interrupted; if a child dies, report it.
  await Promise.race(children.map((child) => child.exited));
  if (!shuttingDown) {
    console.log(red("\nA service exited â€” shutting down the stack."));
    shutdown();
  }
}

main().catch((error) => {
  console.error(red(error instanceof Error ? error.message : String(error)));
  shutdown();
});
