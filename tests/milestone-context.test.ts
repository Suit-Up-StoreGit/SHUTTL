import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { Database } from "../server/database.ts";
import { leagueFor } from "../src/domain.ts";

const origin = "http://localhost:5173";
type Actor = { id: string; cookie: string; csrf: string };

async function fixture() {
  const db = new Database(":memory:");
  const app = await buildApp({ database: db, worker: false, origin });
  const request = async (
    actor: Actor | null,
    method: string,
    path: string,
    payload?: Record<string, unknown>,
    requestId = randomUUID(),
  ) => {
    const response = await app.inject({
      method: method as any,
      url: path,
      headers: {
        origin,
        "idempotency-key": requestId,
        ...(actor ? { cookie: actor.cookie, "x-csrf-token": actor.csrf } : {}),
      },
      ...(payload !== undefined ? { payload } : {}),
    });
    return {
      status: response.statusCode,
      data: response.json(),
      headers: response.headers,
    };
  };
  const players: Actor[] = [];
  for (const username of ["promotion_owner", "promotion_opponent"]) {
    const registered = await request(null, "POST", "/api/auth/register", {
      username,
      name: username,
      password: "Promotion-fixture-2026!",
      adult: true,
    });
    assert.equal(registered.status, 200);
    players.push({
      id: registered.data.user.id,
      cookie: String(registered.headers["set-cookie"]).split(";")[0],
      csrf: registered.data.csrf,
    });
  }
  let ordinal = 0;
  const startingTime = Date.now() - 3 * 3600000;
  const publish = async (won: boolean, beforeApproval?: () => Promise<void>) => {
    const [owner, opponent] = players;
    const playedAt = new Date(startingTime + ++ordinal * 120000).toISOString();
    const recorded = await request(owner, "POST", "/api/results", {
      unitId: randomUUID(),
      category: "Singles",
      format: "ONE_21",
      roster: [owner.id, opponent.id],
      games: [won ? [21, 17] : [17, 21]],
      playedAt,
      scopeId: null,
      agree: true,
    });
    assert.equal(recorded.status, 200);
    const proposed = await request(
      opponent,
      "GET",
      "/api/results/" + recorded.data.id,
    );
    assert.equal(proposed.data.status, "pending");
    if (beforeApproval) await beforeApproval();
    const approved = await request(
      opponent,
      "POST",
      "/api/results/" + recorded.data.id + "/approve",
      {
        revisionId: proposed.data.revisionId,
        agree: true,
      },
    );
    assert.equal(approved.status, 200);
    app.service.work();
    const published = await request(
      owner,
      "GET",
      "/api/results/" + recorded.data.id,
    );
    assert.equal(published.data.status, "rated");
    const event = db.get(
      "SELECT changes FROM rating_events WHERE unit_id=?",
      recorded.data.id,
    )!;
    return { playedAt, change: JSON.parse(event.changes)[owner.id] };
  };
  return { app, db, players, request, publish };
}

test("promotion snapshots require a visible earned crossing, select the latest category milestone and retain their captured context on retry and later play", async () => {
  const f = await fixture();
  try {
    const [owner] = f.players;
    const options = {
      category: "Singles",
      includeName: false,
      includeDistrict: false,
      template: "promotion",
    };
    const milestones = async (category = "Singles") => {
      const response = await f.request(
        owner,
        "GET",
        "/api/milestones?category=" + category,
      );
      assert.equal(response.status, 200);
      return response.data;
    };
    // Four actual losses followed by a confirmed win produce a fifth-result
    // crossing under the current model. Its earlier number was still hidden.
    for (let count = 1; count <= 4; count++) {
      await f.publish(false);
      assert.equal((await milestones()).promotion, null);
      const unavailable = await f.request(
        owner,
        "POST",
        "/api/shares",
        options,
      );
      assert.equal(unavailable.status, 400);
      assert.match(unavailable.data.error, /five confirmed results/);
    }
    const reveal = await f.publish(true);
    assert.equal(reveal.change.count, 5);
    assert.ok(
      leagueFor(reveal.change.after).floor >
        leagueFor(reveal.change.before).floor,
    );
    const revealed = await milestones();
    assert.equal(revealed.reveal.score, reveal.change.after);
    assert.equal(revealed.reveal.asOf, reveal.playedAt);
    assert.equal(revealed.promotion, null);
    const hiddenBaseline = await f.request(
      owner,
      "POST",
      "/api/shares",
      options,
    );
    assert.equal(hiddenBaseline.status, 400);
    assert.match(
      hiddenBaseline.data.error,
      /does not yet have published evidence/,
    );
    assert.equal(f.db.get("SELECT count(*) AS n FROM shares")!.n, 0);

    const firstPromotion = await f.publish(true, async () => {
      assert.equal((await milestones()).promotion, null);
      const unapproved = await f.request(owner, "POST", "/api/shares", options);
      assert.equal(unapproved.status, 400);
      assert.match(unapproved.data.error, /does not yet have published evidence/);
    });
    assert.equal(firstPromotion.change.count, 6);
    assert.ok(
      leagueFor(firstPromotion.change.after).floor >
        leagueFor(firstPromotion.change.before).floor,
    );
    const firstMoment = (await milestones()).promotion;
    assert.deepEqual(firstMoment, {
      score: firstPromotion.change.after,
      league: leagueFor(firstPromotion.change.after).name,
      previousLeague: leagueFor(firstPromotion.change.before).name,
      asOf: firstPromotion.playedAt,
      count: 6,
      status: "Developing",
    });
    const requestId = randomUUID();
    const snapshot = await f.request(
      owner,
      "POST",
      "/api/shares",
      options,
      requestId,
    );
    assert.equal(snapshot.status, 200);
    const replay = await f.request(
      owner,
      "POST",
      "/api/shares",
      options,
      requestId,
    );
    assert.deepEqual(replay.data, snapshot.data);
    assert.equal(replay.status, 200);
    assert.equal(f.db.get("SELECT count(*) AS n FROM shares")!.n, 1);

    // Publish later real matches until the next visible league boundary, rather
    // than injecting fabricated rating events or changing the rating model.
    let laterPromotion: Awaited<ReturnType<typeof f.publish>> | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      const next = await f.publish(true);
      if (
        leagueFor(next.change.after).floor >
        leagueFor(firstPromotion.change.after).floor
      ) {
        laterPromotion = next;
        break;
      }
    }
    assert.ok(
      laterPromotion,
      "The real fixture must reach a second visible promotion.",
    );
    const latestMoment = (await milestones()).promotion;
    assert.equal(latestMoment.score, laterPromotion.change.after);
    assert.equal(latestMoment.asOf, laterPromotion.playedAt);
    assert.equal(
      latestMoment.previousLeague,
      leagueFor(laterPromotion.change.before).name,
    );
    assert.equal(
      latestMoment.league,
      leagueFor(laterPromotion.change.after).name,
    );
    assert.notEqual(latestMoment.asOf, firstMoment.asOf);
    const laterReplay = await f.request(
      owner,
      "POST",
      "/api/shares",
      options,
      requestId,
    );
    assert.deepEqual(laterReplay.data, snapshot.data);
    assert.equal(f.db.get("SELECT count(*) AS n FROM shares")!.n, 1);
    const publicSnapshot = await f.request(
      null,
      "GET",
      "/api/shares/" + snapshot.data.id,
    );
    assert.equal(publicSnapshot.status, 200);
    assert.equal(publicSnapshot.data.score, firstMoment.score);
    assert.equal(publicSnapshot.data.league, firstMoment.league);
    assert.equal(
      publicSnapshot.data.previousLeague,
      firstMoment.previousLeague,
    );
    assert.equal(publicSnapshot.data.asOf, firstMoment.asOf);
    assert.equal(publicSnapshot.data.isCurrent, false);
    for (const privateField of [
      "owner",
      "name",
      "district",
      "currentScore",
      "title",
    ])
      assert.equal(privateField in publicSnapshot.data, false);
    assert.equal(JSON.stringify(publicSnapshot.data).includes(owner.id), false);

    for (const category of ["Doubles", "Mixed"]) {
      assert.deepEqual(await milestones(category), {
        reveal: null,
        best: null,
        promotion: null,
      });
      assert.equal(
        (
          await f.request(owner, "POST", "/api/shares", {
            ...options,
            category,
          })
        ).status,
        400,
      );
      assert.equal(
        f.app.service.rating(owner.id, category as "Doubles" | "Mixed").count,
        0,
      );
    }

    assert.equal(
      (
        await f.request(owner, "PATCH", "/api/profile", {
          name: "Private Promotion Fixture",
          district: "Synthetic Area",
          country: "SG",
          city: "Singapore",
          publicName: false,
          publicDistrict: true,
          publicHistory: false,
          discoverable: true,
          localOptIn: false,
          breakMode: false,
          timezone: "UTC",
          goals: {},
        })
      ).status,
      200,
    );
    // The title provider is stubbed only in this disposable app to prove that
    // even a non-null CURRENT title is stripped from a historical milestone.
    // No live local-title policy, population, eligibility or rating is enabled.
    const originalLocalTitle = f.app.service.localTitle;
    let titleCalls = 0;
    f.app.service.localTitle = () => {
      titleCalls++;
      return {
        label: "Synthetic current title",
        pool: "Synthetic pool",
        eligible: 20,
        category: "Singles",
        asOf: new Date().toISOString(),
        shared: false,
      };
    };
    let namedArea;
    try {
      namedArea = await f.request(owner, "POST", "/api/shares", {
        ...options,
        includeDistrict: true,
      });
    } finally {
      f.app.service.localTitle = originalLocalTitle;
    }
    assert.equal(namedArea.status, 200);
    assert.equal(titleCalls, 1);
    assert.equal(namedArea.data.payload.score, latestMoment.score);
    assert.equal(
      namedArea.data.payload.previousLeague,
      latestMoment.previousLeague,
    );
    assert.equal(namedArea.data.payload.asOf, latestMoment.asOf);
    assert.equal(namedArea.data.payload.district, "Synthetic Area");
    assert.equal("title" in namedArea.data.payload, false);
    const publicArea = await f.request(
      null,
      "GET",
      "/api/shares/" + namedArea.data.id,
    );
    assert.equal(publicArea.status, 200);
    assert.equal(publicArea.data.district, "Synthetic Area");
    assert.equal("title" in publicArea.data, false);
    assert.equal("name" in publicArea.data, false);
    assert.equal("owner" in publicArea.data, false);
  } finally {
    await f.app.close();
  }
});
