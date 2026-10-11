import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { Database } from "../server/database.ts";
const ORIGIN = "http://localhost:5173";
type Client = {
  id: string;
  cookie: string;
  csrf: string;
  recovery: string;
  username: string;
};
async function fixture() {
  const app = await buildApp({
    database: new Database(":memory:"),
    worker: false,
    origin: ORIGIN,
  });
  const request = async (
    client: Client | null,
    method: string,
    url: string,
    payload?: any,
    key = randomUUID(),
  ) => {
    const response = await app.inject({
      method: method as any,
      url,
      headers: {
        origin: ORIGIN,
        ...(client
          ? { cookie: client.cookie, "x-csrf-token": client.csrf }
          : {}),
        "idempotency-key": key,
      },
      ...(payload !== undefined ? { payload } : {}),
    });
    return {
      status: response.statusCode,
      data: response.json(),
      headers: response.headers,
    };
  };
  const register = async (username: string): Promise<Client> => {
    const r = await request(null, "POST", "/api/auth/register", {
      username,
      name: username,
      password: "Shuttl-test-2026!",
      adult: true,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return {
      id: r.data.user.id,
      cookie: String(r.headers["set-cookie"]).split(";")[0],
      csrf: r.data.csrf,
      recovery: r.data.recoveryCode,
      username,
    };
  };
  const players = await Promise.all(
    ["alice", "bruno", "chloe", "david"].map(register),
  );
  const submit = async (
    playedAt = new Date().toISOString(),
    scopeId: string | null = null,
  ) =>
    request(players[0], "POST", "/api/results", {
      unitId: randomUUID(),
      category: "Doubles",
      format: "ONE_21",
      roster: players.map((p) => p.id),
      games: [[21, 18]],
      playedAt,
      scopeId,
      agree: true,
    });
  const approve = async (unit: string, client: Client) => {
    const r = await request(client, "GET", "/api/results/" + unit);
    return request(client, "POST", "/api/results/" + unit + "/approve", {
      revisionId: r.data.revisionId,
      agree: true,
    });
  };
  const finalize = async (unit: string) => {
    for (const p of players.slice(1)) await approve(unit, p);
    app.service.work();
  };
  return { app, request, register, players, submit, approve, finalize };
}
test("accounts hide secrets, reject forged actor fields and require CSRF", async () => {
  const f = await fixture();
  try {
    const me = await f.request(f.players[0], "GET", "/api/me");
    assert.ok(!("password" in me.data) && !("recovery" in me.data));
    assert.match(f.players[0].cookie, /shuttl_session=/);
    const timezone = await f.request(null, "POST", "/api/auth/register", {
      username: "timezone_player",
      name: "Timezone fixture",
      password: "Shuttl-test-2026!",
      adult: true,
      timezone: "Asia/Kolkata",
    });
    assert.equal(timezone.status, 200);
    assert.equal(timezone.data.user.timezone, "Asia/Kolkata");
    const invalidZone = await f.request(null, "POST", "/api/auth/register", {
      username: "invalid_zone",
      name: "Timezone fixture",
      password: "Shuttl-test-2026!",
      adult: true,
      timezone: "not/a-zone",
    });
    assert.equal(invalidZone.status, 400);
    const bad = await f.app.inject({
      method: "POST",
      url: "/api/friends",
      headers: { origin: ORIGIN, cookie: f.players[0].cookie },
      payload: { playerId: f.players[1].id },
    });
    assert.equal(bad.statusCode, 403);
    const forged = await f.request(f.players[0], "POST", "/api/friends", {
      playerId: f.players[1].id,
      actorId: f.players[2].id,
    });
    assert.equal(forged.status, 400);
    const origin = await f.app.inject({
      method: "POST",
      url: "/api/friends",
      headers: {
        origin: "https://attacker.invalid",
        cookie: f.players[0].cookie,
        "x-csrf-token": f.players[0].csrf,
      },
      payload: { playerId: f.players[1].id },
    });
    assert.equal(origin.statusCode, 403);
  } finally {
    await f.app.close();
  }
});
test("retrospective doubles requires all four and publication is separate", async () => {
  const f = await fixture();
  try {
    const r = await f.submit();
    assert.equal(r.status, 200);
    const unit = r.data.id;
    await f.approve(unit, f.players[2]);
    await f.approve(unit, f.players[3]);
    assert.equal(f.app.service.rating(f.players[0].id, "Doubles").count, 0);
    await f.approve(unit, f.players[1]);
    const confirmed = await f.request(
      f.players[0],
      "GET",
      "/api/results/" + unit,
    );
    assert.equal(confirmed.data.status, "confirmed");
    assert.equal(f.app.service.rating(f.players[0].id, "Doubles").count, 0);
    f.app.service.work();
    assert.equal(f.app.service.rating(f.players[0].id, "Doubles").count, 1);
    assert.equal(f.app.service.rating(f.players[0].id, "Singles").count, 0);
    assert.equal(
      (await f.request(f.players[0], "GET", "/api/results/" + unit)).data
        .ratingChanges,
      null,
    );
    assert.equal(
      (await f.request(f.players[0], "GET", "/api/results/" + unit)).data
        .status,
      "rated",
    );
  } finally {
    await f.app.close();
  }
});
test("prior consent permits one opponent, never a teammate; unused duties cancel", async () => {
  const f = await fixture();
  try {
    const scope = await f.request(f.players[0], "POST", "/api/scopes", {
      roster: f.players.map((p) => p.id),
      category: "Doubles",
      format: "ONE_21",
      starts: new Date().toISOString(),
      ends: new Date(Date.now() + 3600000).toISOString(),
      agree: true,
    });
    for (const p of f.players.slice(1))
      assert.equal(
        (
          await f.request(
            p,
            "POST",
            "/api/scopes/" + scope.data.id + "/accept",
            { agree: true },
          )
        ).status,
        200,
      );
    const r = await f.submit(
      new Date(Date.now() + 10).toISOString(),
      scope.data.id,
    );
    assert.equal((await f.approve(r.data.id, f.players[1])).status, 403);
    assert.equal((await f.approve(r.data.id, f.players[2])).status, 200);
    f.app.service.work();
    assert.equal(f.app.service.rating(f.players[0].id, "Doubles").count, 1);
    const unused = f.app.service.db.get(
      "SELECT state FROM duties WHERE participant=?",
      f.players[3].id,
    );
    assert.equal(unused?.state, "cancelled");
    const after = await f.request(f.players[0], "POST", "/api/results", {
      unitId: randomUUID(),
      category: "Doubles",
      format: "ONE_21",
      roster: [
        f.players[0].id,
        f.players[2].id,
        f.players[1].id,
        f.players[3].id,
      ],
      games: [[21, 15]],
      playedAt: new Date(Date.now() + 20).toISOString(),
      scopeId: scope.data.id,
      agree: true,
    });
    assert.equal(
      (await f.request(f.players[0], "GET", "/api/results/" + after.data.id))
        .data.retrospective,
      false,
    );
  } finally {
    await f.app.close();
  }
});
test("retries are idempotent and payload reuse cannot create a second unit", async () => {
  const f = await fixture();
  try {
    const key = randomUUID(),
      payload = {
        unitId: randomUUID(),
        category: "Doubles",
        format: "ONE_21",
        roster: f.players.map((p) => p.id),
        games: [[21, 18]],
        playedAt: new Date().toISOString(),
        scopeId: null,
        agree: true,
      };
    const a = await f.request(
        f.players[0],
        "POST",
        "/api/results",
        payload,
        key,
      ),
      b = await f.request(f.players[0], "POST", "/api/results", payload, key);
    assert.equal(a.data.id, b.data.id);
    assert.equal(f.app.service.db.get("SELECT count(*) AS n FROM units")?.n, 1);
    assert.equal(
      (
        await f.request(
          f.players[0],
          "POST",
          "/api/results",
          { ...payload, games: [[21, 19]] },
          key,
        )
      ).status,
      409,
    );
    const outsider = await f.register("outsider");
    assert.equal(
      (await f.request(outsider, "GET", "/api/results/" + a.data.id)).status,
      403,
    );
  } finally {
    await f.app.close();
  }
});
test("corrections need fresh approvals and deterministically replay later results", async () => {
  const f = await fixture();
  try {
    const early = await f.submit(new Date(Date.now() - 300000).toISOString());
    await f.finalize(early.data.id);
    const later = await f.submit(new Date(Date.now() - 100000).toISOString());
    await f.finalize(later.data.id);
    const before = f.app.service.db.get(
      "SELECT mu FROM ratings WHERE user_id=? AND category=?",
      f.players[0].id,
      "Doubles",
    )!.mu;
    const view = await f.request(
        f.players[0],
        "GET",
        "/api/results/" + early.data.id,
      ),
      old = view.data.revisionId;
    const correction = await f.request(
      f.players[0],
      "POST",
      "/api/results/" + early.data.id + "/correct",
      { revisionId: old, format: "ONE_21", games: [[18, 21]], agree: true },
    );
    assert.equal(correction.status, 200);
    assert.equal(
      (
        await f.request(
          f.players[2],
          "POST",
          "/api/results/" + early.data.id + "/approve",
          { revisionId: old, agree: true },
        )
      ).status,
      409,
    );
    assert.equal(
      f.app.service.db.get(
        "SELECT mu FROM ratings WHERE user_id=? AND category=?",
        f.players[0].id,
        "Doubles",
      )!.mu,
      before,
    );
    await f.finalize(early.data.id);
    assert.notEqual(
      f.app.service.db.get(
        "SELECT mu FROM ratings WHERE user_id=? AND category=?",
        f.players[0].id,
        "Doubles",
      )!.mu,
      before,
    );
    assert.equal(f.app.service.rating(f.players[0].id, "Doubles").count, 2);
    const canonical = f.app.service.db.all(
      "SELECT mu,variance,count FROM ratings ORDER BY user_id",
    );
    f.app.service.rebuild("Doubles");
    assert.deepEqual(
      f.app.service.db.all(
        "SELECT mu,variance,count FROM ratings ORDER BY user_id",
      ),
      canonical,
    );
  } finally {
    await f.app.close();
  }
});
test("disputes cannot silently erase a published loss; reviewer cannot adjudicate own result", async () => {
  const f = await fixture();
  try {
    const r = await f.submit();
    await f.finalize(r.data.id);
    const v = await f.request(f.players[2], "GET", "/api/results/" + r.data.id);
    assert.equal(
      (
        await f.request(
          f.players[2],
          "POST",
          "/api/results/" + r.data.id + "/dispute",
          {
            revisionId: v.data.revisionId,
            reason: "The score needs independent checking.",
          },
        )
      ).status,
      200,
    );
    f.app.service.rebuild("Doubles");
    assert.equal(f.app.service.rating(f.players[2].id, "Doubles").count, 1);
    const dispute = f.app.service.db.get("SELECT id FROM disputes")!.id;
    f.app.service.db.run(
      "UPDATE users SET role='reviewer' WHERE id=?",
      f.players[2].id,
    );
    assert.equal(
      (
        await f.request(f.players[2], "POST", "/api/reviewer/" + dispute, {
          decision: "void",
          reason: "I should not be able to resolve this myself.",
        })
      ).status,
      403,
    );
    const reviewer = await f.register("reviewer");
    f.app.service.db.run(
      "UPDATE users SET role='reviewer' WHERE id=?",
      reviewer.id,
    );
    const bundle = await f.request(reviewer, "GET", "/api/reviewer");
    assert.deepEqual(bundle.data.reviews[0].result.games, [[21, 18]]);
    assert.equal(bundle.data.reviews[0].result.players.length, 4);
    assert.equal(bundle.data.reviews[0].result.ratingChanges, null);
    assert.equal(
      (
        await f.request(reviewer, "POST", "/api/reviewer/" + dispute, {
          decision: "void",
          reason: "Independent review found that the match was not completed.",
        })
      ).status,
      200,
    );
    f.app.service.work();
    assert.equal(f.app.service.rating(f.players[0].id, "Doubles").count, 0);
  } finally {
    await f.app.close();
  }
});
test("guest links need inviter identity verification before acting, then all-player approval", async () => {
  const f = await fixture();
  try {
    const guest = await f.request(f.players[0], "POST", "/api/guests", {
        name: "Invited player",
      }),
      token = guest.data.invitePath.split("/").at(-1);
    const result = await f.request(f.players[0], "POST", "/api/results", {
      unitId: randomUUID(),
      category: "Doubles",
      format: "ONE_21",
      roster: [
        f.players[0].id,
        f.players[1].id,
        guest.data.player.id,
        f.players[3].id,
      ],
      games: [[21, 18]],
      playedAt: new Date().toISOString(),
      scopeId: null,
      agree: true,
    });
    assert.equal(
      (await f.request(f.players[2], "GET", "/api/results/" + result.data.id))
        .status,
      403,
    );
    assert.equal(
      (
        await f.request(
          f.players[2],
          "POST",
          "/api/claims/" + token + "/request",
          {},
        )
      ).status,
      200,
    );
    const claim = f.app.service.db.get("SELECT token FROM guest_claims")!.token;
    assert.equal(
      (
        await f.request(
          f.players[0],
          "POST",
          "/api/guest-claims/" + claim + "/verify",
          { accept: true },
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.request(f.players[2], "GET", "/api/results/" + result.data.id))
        .status,
      200,
    );
    await f.finalize(result.data.id);
    for (let i = 0; i < 3; i++) f.app.service.work();
    assert.equal(f.app.service.rating(f.players[2].id, "Doubles").count, 1);
  } finally {
    await f.app.close();
  }
});
test("recovery is single use and invalidates older sessions", async () => {
  const f = await fixture();
  try {
    const p = f.players[0],
      recovery = await f.request(null, "POST", "/api/auth/recover", {
        username: p.username,
        recoveryCode: p.recovery,
        password: "New-shuttl-password-2026!",
      });
    assert.equal(recovery.status, 200);
    assert.equal((await f.request(p, "GET", "/api/me")).status, 401);
    assert.equal(
      (
        await f.request(null, "POST", "/api/auth/recover", {
          username: p.username,
          recoveryCode: p.recovery,
          password: "Another-good-password!",
        })
      ).status,
      401,
    );
  } finally {
    await f.app.close();
  }
});
test("shares are explicit and revocable; fixed pairs cannot manufacture a local title", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 5; i++) {
      const r = await f.submit(
        new Date(Date.now() - 10000 + i * 1000).toISOString(),
      );
      await f.finalize(r.data.id);
    }
    const score = f.app.service.rating(f.players[0].id, "Doubles");
    assert.notEqual(score.score, null);
    assert.equal(score.status, "Pair-linked");
    const moments = await f.request(
      f.players[0],
      "GET",
      "/api/milestones?category=Doubles",
    );
    assert.equal(moments.status, 200);
    assert.equal(moments.data.reveal.score, score.score);
    assert.equal(moments.data.best.score, score.peak);
    const insights = await f.request(
      f.players[0],
      "GET",
      "/api/insights?category=Doubles&period=all",
    );
    assert.equal(insights.status, 200);
    assert.equal(insights.data.count, 5);
    assert.equal(insights.data.wins, 5);
    assert.equal(insights.data.delta, 0); // There is no displayed rating before the fifth result.
    assert.equal(insights.data.partners[0].count, 5);
    const historical = await f.request(f.players[0], "POST", "/api/shares", {
      category: "Doubles",
      includeName: false,
      includeDistrict: false,
      template: "reveal",
    });
    assert.equal(historical.status, 200);
    assert.equal(historical.data.payload.score, score.score);
    assert.equal(historical.data.payload.template, "reveal");
    assert.equal(historical.data.payload.asOf, moments.data.reveal.asOf);
    assert.ok(!Number.isNaN(Date.parse(historical.data.payload.createdAt)));
    const share = await f.request(f.players[0], "POST", "/api/shares", {
      category: "Doubles",
      includeName: false,
      includeDistrict: false,
    });
    assert.equal(share.status, 200);
    const publicView = await f.request(
      null,
      "GET",
      "/api/shares/" + share.data.id,
    );
    assert.equal(publicView.status, 200);
    assert.ok(!("owner" in publicView.data) && !("name" in publicView.data));
    assert.ok(!("currentScore" in publicView.data));
    assert.equal(
      (
        await f.request(f.players[0], "POST", "/api/shares", {
          category: "Doubles",
          includeName: true,
          includeDistrict: false,
        })
      ).status,
      400,
    );
    await f.request(f.players[0], "DELETE", "/api/shares/" + share.data.id, {});
    assert.equal(
      (await f.request(null, "GET", "/api/shares/" + share.data.id)).status,
      404,
    );
    const rank = await f.request(
      f.players[0],
      "GET",
      "/api/rankings?category=Doubles",
    );
    assert.equal(rank.data.crownAvailable, false);
    assert.equal(rank.data.players.length, 0);
  } finally {
    await f.app.close();
  }
});
test("history cursors and comparison details preserve account and connection boundaries", async () => {
  const f = await fixture();
  try {
    const outsider = await f.register("outsider");
    for (let i = 0; i < 52; i++) {
      const r = await f.submit(
        new Date(Date.now() - 100000 + i * 1000).toISOString(),
      );
      assert.equal(r.status, 200);
    }
    const first = await f.request(
      f.players[0],
      "GET",
      "/api/history?category=Doubles",
    );
    assert.equal(first.status, 200);
    assert.equal(first.data.results.length, 50);
    assert.ok(first.data.next);
    const next = await f.request(
      f.players[0],
      "GET",
      "/api/history?category=Doubles&before=" + first.data.next,
    );
    assert.equal(next.data.results.length, 2);
    assert.equal(next.data.next, null);
    assert.equal(
      new Set(
        [...first.data.results, ...next.data.results].map((r: any) => r.id),
      ).size,
      52,
    );
    assert.equal(
      (
        await f.request(
          outsider,
          "GET",
          "/api/history?category=Doubles&before=" + first.data.next,
        )
      ).status,
      403,
    );
    assert.equal(
      (await f.request(null, "GET", "/api/history?category=Doubles")).status,
      401,
    );
    assert.equal(
      (
        await f.request(
          f.players[0],
          "GET",
          "/api/comparisons/" + f.players[1].id,
        )
      ).status,
      403,
    );
    await f.request(f.players[0], "POST", "/api/friends", {
      playerId: f.players[1].id,
    });
    await f.request(
      f.players[1],
      "POST",
      "/api/friends/" + f.players[0].id + "/accept",
      {},
    );
    assert.equal(
      (
        await f.request(
          f.players[0],
          "GET",
          "/api/comparisons/" + f.players[1].id,
        )
      ).status,
      200,
    );
    await f.request(f.players[0], "POST", "/api/blocks", {
      playerId: f.players[1].id,
    });
    assert.equal(
      (
        await f.request(
          f.players[0],
          "GET",
          "/api/comparisons/" + f.players[1].id,
        )
      ).status,
      403,
    );
  } finally {
    await f.app.close();
  }
});
