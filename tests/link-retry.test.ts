import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { Database } from "../server/database.ts";
import { hash } from "../server/service.ts";

async function fixture() {
  const db = new Database(":memory:");
  const app = await buildApp({
    database: db,
    worker: false,
    origin: "http://localhost:5173",
  });
  const request = async (
    actor: any,
    method: string,
    url: string,
    payload?: any,
    requestId = randomUUID(),
  ) => {
    const response = await app.inject({
      method: method as any,
      url,
      headers: {
        origin: "http://localhost:5173",
        ...(actor ? { cookie: actor.cookie, "x-csrf-token": actor.csrf } : {}),
        "idempotency-key": requestId,
      },
      ...(payload !== undefined ? { payload } : {}),
    });
    return {
      status: response.statusCode,
      data: response.json(),
      headers: response.headers,
    };
  };
  const players = [];
  for (const username of ["link_owner", "link_recipient"]) {
    const response = await request(null, "POST", "/api/auth/register", {
      username,
      name: username,
      password: "Link-retry-fixture-2026!",
      adult: true,
    });
    assert.equal(response.status, 200);
    players.push({
      id: response.data.user.id,
      cookie: String(response.headers["set-cookie"]).split(";")[0],
      csrf: response.data.csrf,
    });
  }
  return { db, app, players, request };
}

test("a lost invitation response replays one link while all server storage retains only its hash", async () => {
  const f = await fixture();
  try {
    const [owner, recipient] = f.players;
    const token = randomBytes(24).toString("base64url");
    const requestId = randomUUID();
    const first = await f.request(
      owner,
      "POST",
      "/api/player-invites",
      { token },
      requestId,
    );
    assert.equal(first.status, 200);
    const replay = await f.request(
      owner,
      "POST",
      "/api/player-invites",
      { token },
      requestId,
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data, first.data);
    assert.equal(first.data.id, hash(token));
    assert.equal(first.data.path, "/connect/" + token);
    const newRequestId = await f.request(owner, "POST", "/api/player-invites", {
      token,
    });
    assert.deepEqual(newRequestId.data, first.data);
    assert.equal(f.db.get("SELECT count(*) AS n FROM player_invites")!.n, 1);
    const replayRecord = f.db.get(
      "SELECT response FROM idempotency WHERE actor=? AND key=?",
      owner.id,
      requestId,
    )!;
    assert.deepEqual(JSON.parse(replayRecord.response), {
      id: hash(token),
      expires: first.data.expires,
    });
    for (const table of f.db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )) {
      assert.match(table.name, /^[a-z_]+$/);
      assert.equal(
        JSON.stringify(f.db.all('SELECT * FROM "' + table.name + '"')).includes(
          token,
        ),
        false,
        "Raw invitation token was stored in " + table.name,
      );
    }
    const foreign = await f.request(recipient, "POST", "/api/player-invites", {
      token,
    });
    assert.equal(foreign.status, 409);
    assert.equal(f.db.get("SELECT count(*) AS n FROM player_invites")!.n, 1);
    const changed = await f.request(
      owner,
      "POST",
      "/api/player-invites",
      { token: randomBytes(24).toString("base64url") },
      requestId,
    );
    assert.equal(changed.status, 409);
    assert.equal(f.db.get("SELECT count(*) AS n FROM player_invites")!.n, 1);
    assert.equal(
      (await f.request(recipient, "GET", "/api/player-invites/" + token)).data
        .status,
      "available",
    );
  } finally {
    await f.app.close();
  }
});

test("revocation and expiry cannot be reversed by an invitation creation replay", async () => {
  const f = await fixture();
  try {
    const [owner] = f.players;
    for (const invalidation of ["revoked", "expired"]) {
      const token = randomBytes(24).toString("base64url");
      const requestId = randomUUID();
      const first = await f.request(
        owner,
        "POST",
        "/api/player-invites",
        { token },
        requestId,
      );
      assert.equal(first.status, 200);
      if (invalidation === "revoked")
        await f.request(
          owner,
          "DELETE",
          "/api/player-invites/" + first.data.id,
          {},
        );
      else
        f.db.run(
          "UPDATE player_invites SET expires=? WHERE id=?",
          "2000-01-01T00:00:00.000Z",
          first.data.id,
        );
      for (const replayKey of [requestId, randomUUID()]) {
        const replay = await f.request(
          owner,
          "POST",
          "/api/player-invites",
          { token },
          replayKey,
        );
        assert.equal(replay.status, 409);
      }
      const publicLink = await f.request(
        null,
        "GET",
        "/api/auth/player-invite/" + token,
      );
      assert.equal(publicLink.status, 404);
    }
    assert.equal(f.db.get("SELECT count(*) AS n FROM player_invites")!.n, 2);
    assert.equal(
      (await f.request(owner, "POST", "/api/player-invites", { token: "weak" }))
        .status,
      400,
    );
  } finally {
    await f.app.close();
  }
});

test("legacy invitation creation remains compatible and a same-key retry never creates an unseen duplicate", async () => {
  const f = await fixture();
  try {
    const [owner] = f.players;
    const requestId = randomUUID();
    const first = await f.request(
      owner,
      "POST",
      "/api/player-invites",
      {},
      requestId,
    );
    assert.equal(first.status, 200);
    assert.match(first.data.path, /^\/connect\/[A-Za-z0-9_-]{32}$/);
    const replay = await f.request(
      owner,
      "POST",
      "/api/player-invites",
      {},
      requestId,
    );
    assert.equal(replay.status, 409);
    assert.match(replay.data.error, /earlier invitation was created/);
    assert.equal(f.db.get("SELECT count(*) AS n FROM player_invites")!.n, 1);
    const metadata = JSON.parse(
      f.db.get(
        "SELECT response FROM idempotency WHERE actor=? AND key=?",
        owner.id,
        requestId,
      )!.response,
    );
    assert.deepEqual(metadata, {
      id: first.data.id,
      expires: first.data.expires,
    });
  } finally {
    await f.app.close();
  }
});

test("share retries preserve the original published snapshot and create only one public link", async () => {
  const f = await fixture();
  try {
    const [owner, opponent] = f.players;
    for (let game = 0; game < 5; game++) {
      const recorded = await f.request(owner, "POST", "/api/results", {
        unitId: randomUUID(),
        scopeId: null,
        category: "Singles",
        format: "ONE_21",
        roster: [owner.id, opponent.id],
        games: [[21, 17]],
        playedAt: new Date(Date.now() - (game + 1) * 300000).toISOString(),
        agree: true,
      });
      assert.equal(recorded.status, 200, JSON.stringify(recorded.data));
      const view = await f.request(
        owner,
        "GET",
        "/api/results/" + recorded.data.id,
      );
      const approved = await f.request(
        opponent,
        "POST",
        "/api/results/" + recorded.data.id + "/approve",
        { revisionId: view.data.revisionId, agree: true },
      );
      assert.equal(approved.status, 200);
      f.app.service.work();
    }
    const requestId = randomUUID();
    const payload = {
      category: "Singles",
      includeName: false,
      includeDistrict: false,
      template: "passport",
    };
    const first = await f.request(
      owner,
      "POST",
      "/api/shares",
      payload,
      requestId,
    );
    assert.equal(first.status, 200);
    const replay = await f.request(
      owner,
      "POST",
      "/api/shares",
      payload,
      requestId,
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data, first.data);
    assert.equal(f.db.get("SELECT count(*) AS n FROM shares")!.n, 1);
    const changed = await f.request(
      owner,
      "POST",
      "/api/shares",
      { ...payload, template: "reveal" },
      requestId,
    );
    assert.equal(changed.status, 409);
    assert.equal(f.db.get("SELECT count(*) AS n FROM shares")!.n, 1);
    const revoked = await f.request(
      owner,
      "DELETE",
      "/api/shares/" + first.data.id,
      {},
    );
    assert.equal(revoked.status, 200);
    const revokedReplay = await f.request(
      owner,
      "POST",
      "/api/shares",
      payload,
      requestId,
    );
    assert.equal(revokedReplay.status, 409);
    assert.match(revokedReplay.data.error, /revoked or removed/);
    assert.equal(f.db.get("SELECT count(*) AS n FROM shares")!.n, 1);
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM shares WHERE revoked=0")!.n,
      0,
    );
    assert.equal(
      (await f.request(null, "GET", "/api/shares/" + first.data.id)).status,
      404,
    );
  } finally {
    await f.app.close();
  }
});

test("deleting a synthetic account removes authentication and private export but preserves its opponent's valid result", async () => {
  const f = await fixture();
  try {
    const [owner, opponent] = f.players;
    const recorded = await f.request(owner, "POST", "/api/results", {
      unitId: randomUUID(),
      scopeId: null,
      category: "Singles",
      format: "ONE_21",
      roster: [owner.id, opponent.id],
      games: [[21, 17]],
      playedAt: new Date(Date.now() - 300000).toISOString(),
      agree: true,
    });
    assert.equal(recorded.status, 200);
    const view = await f.request(
      owner,
      "GET",
      "/api/results/" + recorded.data.id,
    );
    const approved = await f.request(
      opponent,
      "POST",
      "/api/results/" + recorded.data.id + "/approve",
      {
        revisionId: view.data.revisionId,
        agree: true,
      },
    );
    assert.equal(approved.status, 200);
    f.app.service.work();
    const deleted = await f.request(owner, "DELETE", "/api/account", {
      password: "Link-retry-fixture-2026!",
      confirmation: "DELETE",
    });
    assert.equal(deleted.status, 200);
    assert.equal((await f.request(owner, "GET", "/api/me")).status, 401);
    assert.equal(
      (await f.request(owner, "GET", "/api/account/export")).status,
      401,
    );
    const preserved = await f.request(
      opponent,
      "GET",
      "/api/results/" + recorded.data.id,
    );
    assert.equal(preserved.status, 200);
    assert.equal(preserved.data.status, "rated");
    assert.deepEqual(preserved.data.games, [[21, 17]]);
    assert.equal(
      preserved.data.players.find((p: any) => p.id === owner.id).name,
      "Former player",
    );
    assert.equal(f.app.service.rating(opponent.id, "Singles").count, 1);
    const removed = f.db.get("SELECT * FROM users WHERE id=?", owner.id)!;
    assert.equal(removed.deleted, 1);
    assert.equal(removed.password, null);
    assert.equal(removed.recovery, null);
    assert.equal(
      f.db.get("SELECT count(*) AS n FROM sessions WHERE user_id=?", owner.id)!
        .n,
      0,
    );
  } finally {
    await f.app.close();
  }
});

test("deleting a sole group owner closes the group and pending invitations instead of leaving a group nobody can manage", async () => {
  const f = await fixture();
  try {
    const [owner, invited] = f.players;
    const created = await f.request(owner, "POST", "/api/circles", {
      name: "Closing Synthetic Owner Group",
    });
    assert.equal(created.status, 200);
    const circleId = created.data.id;
    assert.equal(
      (
        await f.request(
          owner,
          "PATCH",
          "/api/circles/" + circleId + "/identity",
          { crest: "court", tagline: "Synthetic group identity", recapDay: 0 },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await f.request(owner, "POST", "/api/circles/" + circleId + "/invite", {
          playerId: invited.id,
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.request(invited, "GET", "/api/inbox")).data.circleInvites.length,
      1,
    );
    const deleted = await f.request(owner, "DELETE", "/api/account", {
      password: "Link-retry-fixture-2026!",
      confirmation: "DELETE",
    });
    assert.equal(deleted.status, 200);
    assert.equal(
      f.db.get("SELECT 1 FROM circles WHERE id=?", circleId),
      undefined,
    );
    assert.equal(
      f.db.get(
        "SELECT count(*) AS n FROM circle_members WHERE circle_id=?",
        circleId,
      )!.n,
      0,
    );
    assert.equal(
      f.db.get("SELECT 1 FROM circle_identity WHERE circle_id=?", circleId),
      undefined,
    );
    assert.equal(
      (await f.request(invited, "GET", "/api/inbox")).data.circleInvites.length,
      0,
    );
    assert.equal(
      (
        await f.request(
          invited,
          "POST",
          "/api/circles/" + circleId + "/accept",
          {},
        )
      ).status,
      404,
    );
  } finally {
    await f.app.close();
  }
});

test("accepted group counts include hidden members without exposing their identities or letting the owner bypass transfer", async () => {
  const f = await fixture();
  try {
    const [owner, member] = f.players;
    const created = await f.request(owner, "POST", "/api/circles", {
      name: "Hidden Member Count Fixture",
    });
    assert.equal(created.status, 200);
    const path = "/api/circles/" + created.data.id;
    assert.equal(
      (
        await f.request(owner, "POST", path + "/invite", {
          playerId: member.id,
        })
      ).status,
      200,
    );
    const pending = await f.request(owner, "GET", path);
    assert.equal(pending.data.acceptedCount, 1);
    assert.deepEqual(
      pending.data.members.map((p: any) => p.id),
      [owner.id],
    );
    assert.equal(
      (await f.request(member, "GET", "/api/inbox")).data.circleInvites.length,
      1,
    );
    assert.equal(
      (await f.request(member, "POST", path + "/accept", {})).status,
      200,
    );
    assert.equal(
      (await f.request(owner, "POST", "/api/blocks", { playerId: member.id }))
        .status,
      200,
    );
    const hidden = await f.request(owner, "GET", path);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.data.acceptedCount, 2);
    assert.deepEqual(
      hidden.data.members.map((p: any) => p.id),
      [owner.id],
    );
    assert.equal(JSON.stringify(hidden.data).includes(member.id), false);
    assert.equal(JSON.stringify(hidden.data).includes("link_recipient"), false);
    const leave = await f.request(owner, "DELETE", path + "/membership", {});
    assert.equal(leave.status, 400);
    assert.match(leave.data.error, /Transfer ownership/);
    assert.equal(
      f.db.get(
        "SELECT count(*) AS n FROM circle_members WHERE circle_id=? AND status='accepted'",
        created.data.id,
      )!.n,
      2,
    );
    assert.equal(
      f.db.get("SELECT owner FROM circles WHERE id=?", created.data.id)!.owner,
      owner.id,
    );
    assert.equal(
      (await f.request(owner, "DELETE", "/api/blocks/" + member.id, {})).status,
      200,
    );
    const visible = await f.request(owner, "GET", path);
    assert.equal(visible.data.acceptedCount, 2);
    assert.deepEqual(
      new Set(visible.data.members.map((p: any) => p.id)),
      new Set([owner.id, member.id]),
    );
  } finally {
    await f.app.close();
  }
});
