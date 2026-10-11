import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { Database } from "./database.ts";
import { Service } from "./service.ts";
import { buildApp } from "./app.ts";
const count = Number(process.argv[2] || 1000);
const readerAccounts = Number(process.argv[3] || 4);
if (!Number.isInteger(count) || count < 50 || count > 5000)
  throw new Error(
    "Choose 50–5000 synthetic units. The benchmark never opens a player database.",
  );
if (
  !Number.isInteger(readerAccounts) ||
  readerAccounts < 1 ||
  readerAccounts > 4
)
  throw new Error("Choose 1–4 distinct synthetic readers.");
const directory = resolve("data/benchmarks", randomUUID()),
  db = new Database(resolve(directory, "synthetic.sqlite")),
  service = new Service(db, false);
db.run("INSERT INTO app_meta VALUES('demo_seeded','true')");
const players = Array.from({ length: 4 }, () => randomUUID());
for (const [i, p] of players.entries())
  db.run(
    "INSERT INTO users(id,username,name,role,created_at) VALUES(?,?,?,?,?)",
    p,
    "benchmark_" + i,
    "Synthetic benchmark " + i,
    i === 0 ? "reviewer" : "player",
    new Date().toISOString(),
  );
const started = performance.now();
for (let n = 0; n < count; n++) {
  const result = service.submit(players[0], {
    unitId: randomUUID(),
    scopeId: null,
    category: "Doubles",
    format: "ONE_21",
    roster: players,
    games: [n % 3 ? [21, 17] : [17, 21]],
    playedAt: new Date(Date.now() - (count - n) * 120000).toISOString(),
    agree: true,
  });
  for (const p of players.slice(1))
    service.approve(
      p,
      result.id,
      db.get("SELECT current_revision FROM units WHERE id=?", result.id)!
        .current_revision,
      true,
    );
}
const setupMs = performance.now() - started,
  sessions = players.slice(0, readerAccounts).map((p) => service.session(p)),
  app = await buildApp({
    database: db,
    validated: false,
    origin: "http://127.0.0.1",
  });
await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (!address || typeof address === "string")
  throw new Error("No local test listener.");
const origin = "http://127.0.0.1:" + address.port,
  readTimes: number[] = [],
  statuses: number[] = [],
  busyTimes: number[] = [];
let observedReplay = false;
try {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const running = db.get("SELECT 1 FROM jobs WHERE status='running'");
    if (running) {
      observedReplay = true;
      break;
    }
    if (db.get("SELECT count(*) AS n FROM jobs WHERE status<>'done'")!.n === 0)
      break;
    await new Promise((r) => setTimeout(r, 10));
  }
  for (let batch = 0; batch < 5; batch++)
    await Promise.all(
      Array.from({ length: 20 }, async (_, index) => {
        const during = !!db.get("SELECT 1 FROM jobs WHERE status='running'"),
          time = performance.now();
        const r = await fetch(origin + "/api/dashboard", {
          headers: {
            cookie:
              "shuttl_session=" +
              sessions[(batch * 20 + index) % sessions.length].token,
          },
        });
        await r.json();
        const elapsed = performance.now() - time;
        readTimes.push(elapsed);
        statuses.push(r.status);
        if (during) busyTimes.push(elapsed);
      }),
    );
  const deadline2 = Date.now() + 60000;
  while (
    db.get("SELECT count(*) AS n FROM jobs WHERE status<>'done'")!.n &&
    Date.now() < deadline2
  )
    await new Promise((r) => setTimeout(r, 25));
  const quantile = (values: number[], p: number) =>
    values.length
      ? [...values].sort((a, b) => a - b)[
          Math.min(values.length - 1, Math.ceil(values.length * p) - 1)
        ]
      : null;
  const report = {
    synthetic: true,
    units: count,
    readerAccounts,
    concurrency: 20,
    requests: statuses.length,
    statuses: Object.fromEntries(
      [...new Set(statuses)].map((code) => [
        code,
        statuses.filter((s) => s === code).length,
      ]),
    ),
    setupMs,
    replayObserved: observedReplay,
    requestsStartedDuringReplay: busyTimes.length,
    latencyMs: {
      p50: quantile(readTimes, 0.5),
      p95: quantile(readTimes, 0.95),
      p99: quantile(readTimes, 0.99),
      duringReplayP95: quantile(busyTimes, 0.95),
    },
    publishedEvents: db.get("SELECT count(*) AS n FROM rating_events")!.n,
    unfinishedJobs: db.get(
      "SELECT count(*) AS n FROM jobs WHERE status<>'done'",
    )!.n,
    integrity: db.get("PRAGMA integrity_check"),
    runtime: process.version,
    architecture:
      "One HTTP process and one background publisher, SQLite WAL on local hardware.",
    scope:
      "Dashboard reads during synthetic replay. Not hosted creator traffic, write/signup concurrency, network/device latency or a capacity certificate.",
    acceptedAt9_5: false,
  };
  mkdirSync("outputs/validation-2026-10-11", { recursive: true });
  writeFileSync(
    "outputs/validation-2026-10-11/local-load.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    report.unfinishedJobs ||
    report.publishedEvents !== count ||
    statuses.some((s) => s !== 200)
  )
    process.exitCode = 1;
} finally {
  await app.close();
}
