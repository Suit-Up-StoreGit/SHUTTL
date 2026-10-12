import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { Database } from "../server/database.ts";
async function fixture() {
  const db = new Database(":memory:"),
    app = await buildApp({
      database: db,
      worker: false,
      origin: "http://localhost:5173",
    });
  const request = async (
    actor: any,
    method: string,
    url: string,
    payload?: any,
  ) => {
    const res = await app.inject({
      method: method as any,
      url,
      headers: {
        origin: "http://localhost:5173",
        ...(actor ? { cookie: actor.cookie, "x-csrf-token": actor.csrf } : {}),
        "idempotency-key": randomUUID(),
      },
      ...(payload === undefined ? {} : { payload }),
    });
    return { status: res.statusCode, data: res.json(), headers: res.headers };
  };
  const players = [];
  for (let i = 0; i < 4; i++) {
    const res = await request(null, "POST", "/api/auth/register", {
      username: `activity_${i}`,
      name: `Activity player ${i}`,
      password: "Activity-fixture-2026!",
      adult: true,
    });
    assert.equal(res.status, 200);
    players.push({
      id: res.data.user.id,
      csrf: res.data.csrf,
      cookie: String(res.headers["set-cookie"]).split(";")[0],
    });
  }
  let index = 0;
  const match = async (
    author: any,
    roster: any[],
    win = true,
    publish = true,
  ) => {
    const res = await request(author, "POST", "/api/results", {
      unitId: randomUUID(),
      category: roster.length === 4 ? "Doubles" : "Singles",
      format: "ONE_21",
      roster: roster.map((p) => p.id),
      games: [win ? [21, 17] : [17, 21]],
      playedAt: new Date(Date.now() - 3600000 + index++ * 60000).toISOString(),
      scopeId: null,
      agree: true,
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const result = await request(author, "GET", `/api/results/${res.data.id}`);
    for (const p of roster.filter((p) => p.id !== author.id))
      assert.equal(
        (
          await request(p, "POST", `/api/results/${res.data.id}/approve`, {
            revisionId: result.data.revisionId,
            agree: true,
          })
        ).status,
        200,
      );
    if (publish) app.service.work();
    return res.data.id;
  };
  const connect = async (a: any, b: any) => {
    assert.equal(
      (await request(a, "POST", "/api/friends", { playerId: b.id })).status,
      200,
    );
    assert.equal(
      (await request(b, "POST", `/api/friends/${a.id}/accept`, {})).status,
      200,
    );
  };
  return { app, db, request, players, match, connect };
}
test("friend activity pages whole matches, retains every accepted friend in a shared unit and excludes blocked or foreign details", async () => {
  const f = await fixture();
  try {
    const [a, b, c, d] = f.players;
    await f.connect(a, b);
    await f.connect(a, c);
    const first = await f.match(a, [a, b, c, d]);
    for (let i = 0; i < 22; i++) await f.match(a, [a, b], i % 2 === 0);
    const page = (await f.request(a, "GET", "/api/activity")).data;
    assert.equal(new Set(page.feed.map((entry: any) => entry.unitId)).size, 20);
    assert.ok(page.next);
    const older = (
      await f.request(a, "GET", `/api/activity?before=${page.next}`)
    ).data;
    assert.equal(new Set(older.feed.map((entry: any) => entry.unitId)).size, 3);
    assert.equal(older.next, null);
    assert.deepEqual(
      new Set(
        older.feed
          .filter((entry: any) => entry.unitId === first)
          .map((entry: any) => entry.player.id),
      ),
      new Set([b.id, c.id]),
    );
    for (const entry of [...page.feed, ...older.feed]) {
      assert.equal(entry.games, undefined);
      assert.equal(entry.roster, undefined);
      assert.notEqual(entry.player.id, d.id);
    }
    assert.equal(
      (await f.request(d, "GET", `/api/activity?before=${page.next}`)).data.feed
        .length,
      0,
    );
    assert.equal(
      (await f.request(a, "POST", "/api/blocks", { playerId: b.id })).status,
      200,
    );
    assert.ok(
      (await f.request(a, "GET", "/api/activity")).data.feed.every(
        (entry: any) => entry.player.id !== b.id,
      ),
    );
    const dash = (await f.request(a, "GET", "/api/dashboard")).data;
    assert.ok(dash.generatedAt);
    assert.equal(dash.feedNext, null);
  } finally {
    await f.app.close();
  }
});
test("one publication batch can produce a genuine supported lead update and replay cannot duplicate it", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    for (let i = 0; i < 6; i++) await f.match(a, [a, b], i % 2 === 1);
    await f.connect(a, b);
    assert.ok(
      f.app.service.rating(a.id, "Singles").score! >=
        f.app.service.rating(b.id, "Singles").score!,
    );
    await f.match(a, [a, b], false, false);
    await f.match(a, [a, b], false, false);
    f.app.service.work();
    assert.ok(
      f.app.service.rating(a.id, "Singles").score! <
        f.app.service.rating(b.id, "Singles").score!,
    );
    const updates = (await f.request(a, "GET", "/api/dashboard")).data
      .competitionUpdates;
    assert.equal(updates.length, 1);
    assert.equal(updates[0].category, "Singles");
    assert.ok(updates[0].id);
    f.app.service.rebuild("Singles");
    assert.equal(
      (await f.request(a, "GET", "/api/dashboard")).data.competitionUpdates
        .length,
      1,
    );
  } finally {
    await f.app.close();
  }
});
test("an actionable old result remains in the inbox and Home review data beyond one hundred newer history entries", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    const proposed = await f.request(a, "POST", "/api/results", {
      unitId: randomUUID(),
      category: "Singles",
      format: "ONE_21",
      roster: [a.id, b.id],
      games: [[21, 17]],
      playedAt: new Date(Date.now() - 60000).toISOString(),
      scopeId: null,
      agree: true,
    });
    assert.equal(proposed.status, 200);
    const original = f.db.get(
      "SELECT * FROM units WHERE id=?",
      proposed.data.id,
    )!;
    // Non-active history shells isolate the old list-limit bug; they are not
    // represented as played/approved matches or model-calibration evidence.
    for (let i = 0; i < 101; i++) {
      const id = randomUUID();
      f.db.run(
        "INSERT INTO units(id,author,category,current_revision,status,created_at) VALUES(?,?,?,?,?,?)",
        id,
        a.id,
        "Singles",
        original.current_revision,
        "void",
        "2099-01-01T00:00:00Z",
      );
      for (const p of [a, b])
        f.db.run("INSERT INTO unit_players VALUES(?,?)", id, p.id);
    }
    assert.ok(
      !f.app.service.results(b.id).some((r) => r.id === proposed.data.id),
    );
    assert.ok(
      (await f.request(b, "GET", "/api/inbox")).data.pending.some(
        (r: any) => r.id === proposed.data.id,
      ),
    );
    assert.ok(
      (await f.request(b, "GET", "/api/dashboard")).data.reviewResults.some(
        (r: any) => r.id === proposed.data.id,
      ),
    );
  } finally {
    await f.app.close();
  }
});
