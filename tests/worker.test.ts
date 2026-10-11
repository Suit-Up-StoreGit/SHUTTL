import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Database } from "../server/database.ts";
import { Service } from "../server/service.ts";
import { buildApp } from "../server/app.ts";
function ready(db: Database) {
  db.run("INSERT OR REPLACE INTO app_meta VALUES('demo_seeded','true')");
  const service = new Service(db),
    players = [randomUUID(), randomUUID()];
  for (const [i, p] of players.entries())
    db.run(
      "INSERT INTO users(id,username,name,created_at) VALUES(?,?,?,?)",
      p,
      "worker_" + i,
      "Synthetic Worker " + i,
      new Date().toISOString(),
    );
  const result = service.submit(players[0], {
    unitId: randomUUID(),
    scopeId: null,
    category: "Singles",
    format: "ONE_21",
    roster: players,
    games: [[21, 17]],
    playedAt: new Date(Date.now() - 60000).toISOString(),
    agree: true,
  });
  service.approve(
    players[1],
    result.id,
    db.get("SELECT current_revision FROM units WHERE id=?", result.id)!
      .current_revision,
    true,
  );
  return { service, players, result };
}
test("replay rejects a changed ledger before publication and can retry the new truth", () => {
  const db = new Database(":memory:");
  try {
    const { service, players, result } = ready(db);
    service.work();
    const before = service.rating(players[0], "Singles"),
      snapshot = db.get(
        "SELECT version FROM snapshots WHERE category=?",
        "Singles",
      )!.version;
    const transaction = db.transaction.bind(db);
    let change = true;
    db.transaction = (action) => {
      if (change) {
        change = false;
        db.run("UPDATE units SET status='void' WHERE id=?", result.id);
      }
      return transaction(action);
    };
    assert.throws(() => service.rebuild("Singles"), /evidence changed/);
    assert.deepEqual(service.rating(players[0], "Singles"), before);
    assert.equal(
      db.get("SELECT version FROM snapshots WHERE category=?", "Singles")!
        .version,
      snapshot,
    );
    db.transaction = transaction;
    service.enqueue("Singles");
    service.work();
    assert.equal(service.rating(players[0], "Singles").count, 0);
    assert.equal(
      db.get("SELECT published_revision FROM units WHERE id=?", result.id)!
        .published_revision,
      null,
    );
  } finally {
    db.close();
  }
});
test(
  "background publisher completes durable jobs and closes without requiring an HTTP-thread rebuild",
  { timeout: 60000 },
  async () => {
    const path = resolve("data/worker-tests", randomUUID(), "fixture.sqlite"),
      db = new Database(path);
    const { players } = ready(db),
      app = await buildApp({ database: db, origin: "http://localhost:5173" });
    try {
      // This checks durable completion, not a ten-second startup SLO on a busy test host.
      const until = Date.now() + 30000;
      while (
        !db.get("SELECT 1 FROM rating_events LIMIT 1") &&
        Date.now() < until
      )
        await new Promise((r) => setTimeout(r, 25));
      assert.equal(app.service.rating(players[0], "Singles").count, 1);
      assert.equal(
        db.get("SELECT count(*) AS n FROM jobs WHERE status<>'done'")!.n,
        0,
      );
      assert.equal((await app.inject("/api/health")).statusCode, 200);
      const session = app.service.session(players[0]),
        headers = { cookie: "shuttl_session=" + session.token };
      assert.equal(
        (await app.inject({ url: "/api/dashboard", headers })).json().me.name,
        "Synthetic Worker 0",
      );
      const external = new Database(path);
      try {
        external.run(
          "UPDATE users SET name='External change' WHERE id=?",
          players[0],
        );
      } finally {
        external.close();
      }
      assert.equal(
        (await app.inject({ url: "/api/dashboard", headers })).json().me.name,
        "External change",
      );
    } finally {
      await app.close();
    }
  },
);
