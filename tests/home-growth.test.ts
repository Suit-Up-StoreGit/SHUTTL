import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { Database } from "../server/database.ts";
import { progressTrace } from "../src/home-growth.ts";
import { characterProgress } from "../server/character.ts";

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
    const r = await app.inject({
      method: method as any,
      url,
      headers: {
        origin: "http://localhost:5173",
        ...(actor ? { cookie: actor.cookie, "x-csrf-token": actor.csrf } : {}),
        "idempotency-key": randomUUID(),
      },
      ...(payload === undefined ? {} : { payload }),
    });
    return { status: r.statusCode, data: r.json(), headers: r.headers };
  };
  const players: any[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await request(null, "POST", "/api/auth/register", {
      username: `growth_${i}`,
      name: `Growth player ${i}`,
      password: "Growth-fixture-2026!",
      adult: true,
    });
    assert.equal(r.status, 200);
    players.push({
      id: r.data.user.id,
      csrf: r.data.csrf,
      cookie: String(r.headers["set-cookie"]).split(";")[0],
    });
  }
  let index = 0;
  const match = async (win = true) => {
    const [a, b] = players;
    const r = await request(a, "POST", "/api/results", {
      unitId: randomUUID(),
      category: "Singles",
      format: "ONE_21",
      roster: [a.id, b.id],
      games: [win ? [21, 17] : [17, 21]],
      playedAt: new Date(Date.now() - 3600000 + index++ * 60000).toISOString(),
      scopeId: null,
      agree: true,
    });
    assert.equal(r.status, 200);
    const unit = (await request(a, "GET", `/api/results/${r.data.id}`)).data;
    assert.equal(
      (
        await request(b, "POST", `/api/results/${unit.id}/approve`, {
          revisionId: unit.revisionId,
          agree: true,
        })
      ).status,
      200,
    );
    app.service.work();
    return (await request(a, "GET", `/api/results/${unit.id}`)).data;
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
  return { db, app, players, request, match, connect };
}

test("characters unlock only from published play, reject forged cosmetics, persist across a loss and fall back after corrections", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    const look = { body: "original", accessory: "visor", dance: "shuffle" };
    assert.equal(
      (await f.request(a, "PUT", "/api/character", look)).status,
      400,
    );
    const units: any[] = [];
    for (let n = 0; n < 5; n++) units.push(await f.match());
    const before = f.app.service.rating(a.id, "Singles");
    let r = await f.request(a, "GET", "/api/character");
    assert.deepEqual(r.data.progress, { matches: 5, wins: 5, streak: 3 });
    assert.equal(
      (await f.request(a, "PUT", "/api/character", look)).status,
      200,
    );
    assert.equal(
      (f.app.service.player(a.id, b.id) as any).character.accessory,
      "visor",
    );
    assert.deepEqual(f.app.service.rating(a.id, "Singles"), before);
    await f.match(false);
    assert.equal(characterProgress(f.app.service, a.id).streak, 3);
    assert.equal(
      (await f.request(b, "GET", "/api/character")).data.look.accessory,
      "none",
    );
    assert.equal(
      (
        await f.request(a, "PUT", "/api/character", {
          ...look,
          accessory: "halo",
        })
      ).status,
      400,
    );
    const corrected = await f.request(
      a,
      "POST",
      `/api/results/${units[2].id}/correct`,
      {
        revisionId: units[2].revisionId,
        format: "ONE_21",
        games: [[17, 21]],
        agree: true,
      },
    );
    assert.equal(corrected.status, 200);
    const current = (await f.request(a, "GET", `/api/results/${units[2].id}`))
      .data;
    assert.equal(
      (
        await f.request(b, "POST", `/api/results/${current.id}/approve`, {
          revisionId: current.revisionId,
          agree: true,
        })
      ).status,
      200,
    );
    f.app.service.work();
    assert.equal(characterProgress(f.app.service, a.id).wins, 4);
    assert.equal(
      (f.app.service.player(a.id, b.id) as any).character.dance,
      "bounce",
    );
    assert.equal(
      (f.app.service.player(a.id, b.id) as any).character.accessory,
      "visor",
    );
    assert.equal(
      (
        await f.request(a, "DELETE", "/api/account", {
          password: "Growth-fixture-2026!",
          confirmation: "DELETE",
        })
      ).status,
      200,
    );
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM characters WHERE owner=?", a.id)?.n,
      0,
    );
  } finally {
    await f.app.close();
  }
});

test("friend podiums use actual shared ratings, handle ties and blocks and geography never awards an unvalidated title", async () => {
  const f = await fixture();
  try {
    const [a, b, c, d] = f.players;
    await f.connect(a, b);
    await f.connect(a, c);
    for (let n = 0; n < 5; n++) await f.match();
    for (let n = 0; n < 5; n++) {
      const created = await f.request(a, "POST", "/api/results", {
        unitId: randomUUID(),
        category: "Singles",
        format: "ONE_21",
        roster: [a.id, c.id],
        games: [[21, 17]],
        playedAt: new Date(Date.now() - 1200000 + n * 60000).toISOString(),
        scopeId: null,
        agree: true,
      });
      const unit = (
        await f.request(a, "GET", `/api/results/${created.data.id}`)
      ).data;
      assert.equal(
        (
          await f.request(c, "POST", `/api/results/${unit.id}/approve`, {
            revisionId: unit.revisionId,
            agree: true,
          })
        ).status,
        200,
      );
      f.app.service.work();
    }
    let r = (await f.request(a, "GET", "/api/podiums?category=Singles")).data;
    assert.equal(r.boards[0].ready, true);
    assert.equal(r.boards[0].position, 1);
    assert.equal(r.boards[0].comparable, 3);
    assert.equal(
      (await f.request(d, "GET", "/api/podiums?category=Singles")).data
        .boards[0].podium,
      false,
    );
    assert.equal(
      (await f.request(a, "GET", "/api/podiums?category=Doubles")).data
        .boards[0].ready,
      false,
    );
    f.db.run("UPDATE ratings SET mu=1500 WHERE category='Singles'");
    r = (await f.request(a, "GET", "/api/podiums?category=Singles")).data;
    assert.equal(r.boards[0].position, 1);
    assert.equal(r.boards[0].shared, true);
    f.db.run("INSERT INTO blocks VALUES(?,?)", a.id, c.id);
    assert.equal(
      (await f.request(a, "GET", "/api/podiums?category=Singles")).data
        .boards[0].ready,
      false,
    );
    assert.equal(
      (
        await f.request(a, "PUT", "/api/arena-place", {
          region: " Baden-Württemberg ",
          neighborhood: "Weststadt",
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.request(d, "GET", "/api/arena-place")).data.region,
      "",
    );
    f.db.run(
      "UPDATE users SET country='DE',city='Karlsruhe',district='West',locality_key='de|karlsruhe|west',local_opt_in=1 WHERE id=?",
      a.id,
    );
    r = (await f.request(a, "GET", "/api/podiums?category=Singles")).data;
    assert.deepEqual(
      r.boards.filter((b: any) => b.geographic).map((b: any) => b.id),
      ["country", "city", "district", "region", "neighborhood"],
    );
    assert.equal(
      r.boards.some((b: any) => b.geographic && b.podium),
      false,
    );
    assert.equal(
      (await f.request(a, "GET", "/api/account/export")).data.competitionArea
        .region,
      "Baden-Württemberg",
    );
  } finally {
    await f.app.close();
  }
});

test("private playbook persists without match history, guards competing edits and journal replay, exports and erases only its owner's notes", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    const path = "/api/playbook?category=Singles";
    assert.equal((await f.request(null, "GET", path)).status, 401);
    assert.equal((await f.request(a, "GET", path)).data.version, 0);
    const body = {
      category: "Singles",
      focus: "closing",
      intention: "Reset before the next point",
      reflection: "My private reminder",
      version: 0,
    };
    let r = await f.request(a, "PUT", "/api/playbook", body);
    assert.equal(r.status, 200);
    assert.equal(r.data.version, 1);
    assert.equal(
      (await f.request(a, "PUT", "/api/playbook", body)).status,
      409,
    );
    assert.equal((await f.request(b, "GET", path)).data.reflection, "");
    assert.equal(
      (await f.request(a, "GET", "/api/playbook?category=Doubles")).data
        .intention,
      "",
    );
    r = await f.request(a, "POST", "/api/playbook/archive", {
      category: "Singles",
      version: 1,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.entries.length, 1);
    assert.equal(r.data.reflection, "");
    assert.equal(r.data.intention, body.intention);
    assert.equal(
      (
        await f.request(a, "POST", "/api/playbook/archive", {
          category: "Singles",
          version: 1,
        })
      ).status,
      409,
    );
    const entry = r.data.entries[0];
    assert.equal(
      (await f.request(b, "DELETE", `/api/playbook/entries/${entry.id}`, {}))
        .status,
      404,
    );
    let exported = await f.request(a, "GET", "/api/account/export");
    assert.equal(exported.data.playbookJournal[0].reflection, body.reflection);
    assert.equal(
      (await f.request(b, "GET", "/api/account/export")).data.playbookJournal
        .length,
      0,
    );
    assert.equal(
      (await f.request(a, "DELETE", `/api/playbook/entries/${entry.id}`, {}))
        .data.entries.length,
      0,
    );
    r = await f.request(a, "DELETE", "/api/playbook", {
      category: "Singles",
      version: 2,
    });
    assert.equal(r.data.version, 3);
    assert.equal(r.data.intention, "");
    assert.equal(
      (
        await f.request(a, "PUT", "/api/playbook", {
          ...body,
          version: 3,
          intention: "x".repeat(501),
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.request(a, "PUT", "/api/playbook", { ...body, version: 3 }))
        .status,
      200,
    );
    assert.equal(
      (
        await f.request(a, "DELETE", "/api/account", {
          password: "Growth-fixture-2026!",
          confirmation: "DELETE",
        })
      ).status,
      200,
    );
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM playbooks WHERE owner=?", a.id)?.n,
      0,
    );
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM playbook_entries WHERE owner=?", a.id)
        ?.n,
      0,
    );
    assert.equal(f.app.service.rating(b.id, "Singles").count, 0);
  } finally {
    await f.app.close();
  }
});

test("score-analysis API uses published revision scores oriented to the owner and excludes another player's results", async () => {
  const f = await fixture();
  try {
    const [a, b, c] = f.players;
    await f.match();
    const first = (
      await f.request(a, "GET", "/api/insights?category=Singles&period=30")
    ).data;
    const second = (
      await f.request(b, "GET", "/api/insights?category=Singles&period=30")
    ).data;
    assert.equal(first.patterns.pointsFor, 21);
    assert.equal(second.patterns.pointsFor, 17);
    assert.equal(first.scoreMatches[0].score, null);
    assert.equal(first.scoreMatches[0].delta, null);
    assert.equal(second.scoreMatches[0].ownSide, 1);
    assert.equal(first.patterns.deciders.count, 0);
    assert.equal(
      (await f.request(c, "GET", "/api/insights?category=Singles&period=30"))
        .data.scoreMatches.length,
      0,
    );
  } finally {
    await f.app.close();
  }
});

test("local home context respects opt-in, country/city, blocks and private names without manufacturing standings", async () => {
  const f = await fixture();
  try {
    const [a, b, c, d] = f.players;
    for (const [p, country] of [
      [a, "DE"],
      [b, "DE"],
      [c, "US"],
      [d, "DE"],
    ] as const) {
      const me: any = f.app.service.profile(p.id);
      assert.equal(
        (
          await f.request(p, "PATCH", "/api/profile", {
            ...Object.fromEntries(
              [
                "name",
                "publicName",
                "publicDistrict",
                "publicHistory",
                "discoverable",
                "breakMode",
                "timezone",
                "goals",
              ].map((k) => [k, me[k]]),
            ),
            country,
            city: "Berlin",
            district: "Mitte",
            localOptIn: true,
          })
        ).status,
        200,
      );
    }
    for (let i = 0; i < 5; i++) await f.match(i % 2 === 0);
    assert.equal(
      (await f.request(a, "POST", "/api/blocks", { playerId: d.id })).status,
      200,
    );
    const local = (await f.request(a, "GET", "/api/dashboard")).data.localCourt;
    assert.equal(local.count, 2);
    assert.equal(local.published.Singles, 2);
    assert.equal(local.published.Doubles, 0);
    assert.equal(local.active, 2);
    assert.equal(local.sampled, false);
    assert.deepEqual(
      local.people.map((p: any) => p.id),
      [b.id],
    );
    assert.equal(local.people[0].name, "growth_1");
    assert.equal(local.people[0].rating, undefined);
    assert.equal(local.people[0].position, undefined);
    const own: any = f.app.service.profile(a.id);
    assert.equal(
      (
        await f.request(a, "PATCH", "/api/profile", {
          ...Object.fromEntries(
            [
              "name",
              "publicName",
              "publicDistrict",
              "publicHistory",
              "discoverable",
              "breakMode",
              "timezone",
              "goals",
              "country",
              "city",
              "district",
            ].map((k) => [k, own[k]]),
          ),
          localOptIn: false,
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.request(a, "GET", "/api/dashboard")).data.localCourt,
      null,
    );
  } finally {
    await f.app.close();
  }
});

test("an accepted friend can privately congratulate a real reveal once without accessing foreign games or changing ratings", async () => {
  const f = await fixture();
  try {
    const [a, b, c, d] = f.players;
    await f.connect(c, b);
    const first = await f.match();
    for (let i = 1; i < 4; i++) await f.match(i % 2 === 0);
    const fifth = await f.match(false);
    const input = { playerId: b.id, revisionId: fifth.publishedRevisionId },
      endpoint = `/api/activity/${fifth.id}/congratulate`;
    assert.equal((await f.request(d, "POST", endpoint, input)).status, 403);
    assert.equal(
      (
        await f.request(c, "POST", endpoint, {
          ...input,
          revisionId: randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.request(c, "POST", `/api/activity/${first.id}/congratulate`, {
          playerId: b.id,
          revisionId: first.publishedRevisionId,
        })
      ).status,
      409,
    );
    const before = f.app.service.profile(b.id).ratings;
    const sent = await f.request(c, "POST", endpoint, input),
      retried = await f.request(c, "POST", endpoint, input);
    assert.equal(sent.status, 200);
    assert.equal(retried.data.id, sent.data.id);
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM court_congratulations")!.n,
      1,
    );
    assert.deepEqual(f.app.service.profile(b.id).ratings, before);
    assert.equal(f.db.get("SELECT count(*) AS n FROM push_deliveries")!.n, 0);
    assert.equal(
      (await f.request(c, "GET", `/api/results/${fifth.id}`)).status,
      403,
    );
    const feed = (await f.request(c, "GET", "/api/dashboard")).data.feed.find(
      (p: any) => p.unitId === fifth.id && p.player.id === b.id,
    );
    assert.equal(feed.congratulated, true);
    assert.equal(feed.games, undefined);
    const own = (await f.request(b, "GET", "/api/dashboard")).data
      .receivedRespect;
    assert.equal(own.length, 1);
    assert.equal(own[0].player.id, c.id);
    assert.equal(own[0].milestone, "reveal");
    assert.equal(
      (await f.request(a, "GET", "/api/dashboard")).data.receivedRespect.length,
      0,
    );
    const exported = (await f.request(c, "GET", "/api/account/export")).data;
    assert.equal(exported.congratulations.length, 1);
    assert.equal(
      (await f.request(b, "POST", "/api/blocks", { playerId: c.id })).status,
      200,
    );
    assert.equal(
      (await f.request(b, "GET", "/api/dashboard")).data.receivedRespect.length,
      0,
    );
    assert.equal((await f.request(c, "POST", endpoint, input)).status, 403);
    assert.equal(
      (
        await f.request(c, "DELETE", "/api/account", {
          password: "Growth-fixture-2026!",
          confirmation: "DELETE",
        })
      ).status,
      200,
    );
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM court_congratulations")!.n,
      0,
    );
    assert.equal(f.db.get("SELECT count(*) AS n FROM rating_events")!.n, 5);
  } finally {
    await f.app.close();
  }
});

test("a correction cannot borrow congratulations from an earlier revision or celebrate a pending milestone", async () => {
  const f = await fixture();
  try {
    const [a, b, c] = f.players;
    await f.connect(c, b);
    let fifth: any;
    for (let i = 0; i < 5; i++) fifth = await f.match(i % 2 === 0);
    const endpoint = `/api/activity/${fifth.id}/congratulate`,
      input = { playerId: b.id, revisionId: fifth.publishedRevisionId };
    assert.equal((await f.request(c, "POST", endpoint, input)).status, 200);
    const correction = await f.request(
      a,
      "POST",
      `/api/results/${fifth.id}/correct`,
      {
        revisionId: fifth.revisionId,
        format: "ONE_21",
        games: [[17, 21]],
        agree: true,
      },
    );
    assert.equal(correction.status, 200);
    assert.equal((await f.request(c, "POST", endpoint, input)).status, 409);
    assert.equal(
      (await f.request(b, "GET", "/api/dashboard")).data.receivedRespect.length,
      0,
    );
    const updated = (await f.request(b, "GET", `/api/results/${fifth.id}`))
      .data;
    assert.equal(
      (
        await f.request(b, "POST", `/api/results/${fifth.id}/approve`, {
          revisionId: updated.revisionId,
          agree: true,
        })
      ).status,
      200,
    );
    f.app.service.work();
    assert.equal(
      (await f.request(b, "GET", "/api/dashboard")).data.receivedRespect.length,
      0,
    );
    assert.equal((await f.request(c, "POST", endpoint, input)).status, 409);
    const fresh = f.db.get(
      "SELECT revision_id FROM rating_events WHERE unit_id=?",
      fifth.id,
    )!;
    assert.equal(
      (
        await f.request(c, "POST", endpoint, {
          ...input,
          revisionId: fresh.revision_id,
        })
      ).status,
      200,
    );
  } finally {
    await f.app.close();
  }
});

test("replaying an earlier correction renews congratulations only for changed milestone evidence", async () => {
  const f = await fixture();
  try {
    const [a, b, c] = f.players;
    await f.connect(c, b);
    const first = await f.match();
    for (let i = 1; i < 4; i++) await f.match();
    const fifth = await f.match();
    const endpoint = `/api/activity/${fifth.id}/congratulate`,
      input = { playerId: b.id, revisionId: fifth.publishedRevisionId };
    const original = await f.request(c, "POST", endpoint, input);
    assert.equal(original.status, 200);
    const oldScore = f.db.get(
      "SELECT score FROM court_congratulations WHERE id=?",
      original.data.id,
    )!.score;
    assert.equal(
      (await f.request(b, "GET", "/api/dashboard")).data.receivedRespect.length,
      1,
    );
    // A correction upstream replays this reveal without changing its revision.
    assert.equal(
      (
        await f.request(a, "POST", `/api/results/${first.id}/correct`, {
          revisionId: first.revisionId,
          format: "ONE_21",
          games: [[17, 21]],
          agree: true,
        })
      ).status,
      200,
    );
    const updated = (await f.request(b, "GET", `/api/results/${first.id}`))
      .data;
    assert.equal(
      (
        await f.request(b, "POST", `/api/results/${first.id}/approve`, {
          revisionId: updated.revisionId,
          agree: true,
        })
      ).status,
      200,
    );
    f.app.service.work();
    const replayed = f.db.get(
      "SELECT revision_id,changes FROM rating_events WHERE unit_id=?",
      fifth.id,
    )!;
    const currentScore = JSON.parse(replayed.changes)[b.id].after;
    assert.equal(replayed.revision_id, input.revisionId);
    assert.notEqual(currentScore, oldScore);
    const entry = (await f.request(c, "GET", "/api/dashboard")).data.feed.find(
      (p: any) => p.unitId === fifth.id && p.player.id === b.id,
    );
    assert.equal(entry.milestone, "reveal");
    assert.equal(entry.canCongratulate, true);
    assert.equal(entry.congratulated, false);
    assert.equal(
      (await f.request(b, "GET", "/api/dashboard")).data.receivedRespect.length,
      0,
    );
    const renewed = await f.request(c, "POST", endpoint, input),
      retried = await f.request(c, "POST", endpoint, input);
    assert.equal(renewed.status, 200);
    assert.equal(retried.status, 200);
    assert.notEqual(renewed.data.id, original.data.id);
    assert.equal(retried.data.id, renewed.data.id);
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM court_congratulations")!.n,
      1,
    );
    assert.equal(
      f.db.get(
        "SELECT score FROM court_congratulations WHERE id=?",
        renewed.data.id,
      )!.score,
      currentScore,
    );
    assert.equal(
      (await f.request(c, "GET", "/api/dashboard")).data.feed.find(
        (p: any) => p.unitId === fifth.id && p.player.id === b.id,
      ).congratulated,
      true,
    );
    const received = (await f.request(b, "GET", "/api/dashboard")).data
      .receivedRespect;
    assert.equal(received.length, 1);
    assert.equal(received[0].id, renewed.data.id);
  } finally {
    await f.app.close();
  }
});

test("personal progress is actor-bound and starts its trajectory at the fifth confirmed result without a hidden prior", async () => {
  const f = await fixture();
  try {
    const [a] = f.players;
    for (let i = 0; i < 4; i++) await f.match(i % 2 === 0);
    let insights = (
      await f.request(a, "GET", "/api/insights?category=Singles&period=30")
    ).data;
    assert.equal(insights.owner, a.id);
    assert.deepEqual(insights.trajectory, []);
    assert.deepEqual(insights.moments, []);
    assert.equal(insights.delta, null);
    await f.match();
    insights = (
      await f.request(a, "GET", "/api/insights?category=Singles&period=30")
    ).data;
    assert.equal(insights.trajectory.length, 1);
    assert.equal(insights.trajectory[0].count, 5);
    assert.equal(insights.moments.length, 1);
    assert.equal(insights.moments[0].milestone, "reveal");
    assert.equal(insights.moments[0].delta, null);
    assert.equal(insights.delta, 0);
    assert.equal(
      insights.trajectory[0].score,
      f.app.service.rating(a.id, "Singles").score,
    );
    await f.match(false);
    insights = (
      await f.request(a, "GET", "/api/insights?category=Singles&period=all")
    ).data;
    assert.equal(insights.trajectory.length, 2);
    assert.ok(insights.moments.every((m: any) => m.count >= 5));
    assert.equal(insights.moments[0].won, false);
    assert.equal(insights.moments[0].score, insights.trajectory[1].score);
    assert.equal(
      (await f.request(a, "GET", `/api/results/${insights.moments[0].unitId}`))
        .status,
      200,
    );
    assert.ok(insights.trajectory.every((p: any) => p.count >= 5));
    assert.equal(
      insights.delta,
      insights.trajectory[1].score - insights.trajectory[0].score,
    );
    assert.deepEqual(
      (await f.request(a, "GET", "/api/insights?category=Doubles&period=all"))
        .data.trajectory,
      [],
    );
  } finally {
    await f.app.close();
  }
});

test("trajectory rendering handles a single reveal and equal-time publications without invented intermediate estimates", () => {
  assert.equal(progressTrace([]), null);
  const one = progressTrace([
    { score: 1500, playedAt: "2026-10-01T12:00:00Z" },
  ])!;
  assert.deepEqual(one.points, [{ x: 160, y: 48 }]);
  assert.equal(one.low, 1500);
  assert.equal(one.high, 1500);
  const same = progressTrace([
    { score: 1500, playedAt: "2026-10-01T12:00:00Z" },
    { score: 1520, playedAt: "2026-10-01T12:00:00Z" },
    { score: 1490, playedAt: "2026-10-01T12:00:00Z" },
  ])!;
  assert.deepEqual(
    same.points.map((p) => p.x),
    [0, 160, 320],
  );
  assert.equal(same.points.length, 3);
  assert.ok(same.points.every((p) => Number.isFinite(p.y)));
  const gentle = progressTrace(
    [
      { score: 1500, playedAt: "2026-10-01T12:00:00Z" },
      { score: 1498, playedAt: "2026-10-02T12:00:00Z" },
    ],
    320,
    96,
    150,
  )!;
  assert.equal(gentle.scaleHigh - gentle.scaleLow, 150);
  assert.ok(Math.abs(gentle.points[1].y - gentle.points[0].y) < 2);
});

test("studio collections and matchup histories are actor/category bound and withhold hidden placement ratings", async () => {
  const f = await fixture();
  try {
    const [a, b, c] = f.players;
    for (let i = 0; i < 4; i++) await f.match();
    let data = (
      await f.request(a, "GET", "/api/insights?category=Singles&period=30")
    ).data;
    assert.deepEqual(data.studio.collection, []);
    assert.equal(data.studio.peak, null);
    assert.ok(
      data.opponents[0].matches.every(
        (m: any) => m.score === null && m.delta === null,
      ),
    );
    const revealed = await f.match();
    data = (
      await f.request(a, "GET", "/api/insights?category=Singles&period=30")
    ).data;
    assert.equal(data.studio.reveal.unitId, revealed.id);
    assert.equal(data.studio.collection.length, 1);
    assert.equal(data.studio.comparison.current.count, 5);
    assert.equal(data.studio.comparison.previous.count, 0);
    assert.equal(data.opponents[0].matches.at(-1).unitId, revealed.id);
    assert.equal(data.opponents[0].matches.at(-1).delta, null);
    const foreign = (
      await f.request(c, "GET", "/api/insights?category=Singles&period=30")
    ).data;
    assert.deepEqual(foreign.studio.collection, []);
    assert.deepEqual(foreign.opponents, []);
    const separate = (
      await f.request(a, "GET", "/api/insights?category=Doubles&period=30")
    ).data;
    assert.deepEqual(separate.studio.collection, []);
    const opponent = (
      await f.request(b, "GET", "/api/insights?category=Singles&period=all")
    ).data;
    assert.equal(
      opponent.studio.peak.score,
      f.app.service.rating(b.id, "Singles").score,
    );
    assert.notEqual(opponent.studio.peak.score, data.studio.peak.score);
  } finally {
    await f.app.close();
  }
});
