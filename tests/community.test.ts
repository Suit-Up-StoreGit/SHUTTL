import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { Database } from "../server/database.ts";
import { localityKey } from "../src/location.ts";
import { safePortrait, sanitizePortrait } from "../server/portrait.ts";
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
    const response = await app.inject({
      method: method as any,
      url,
      headers: {
        origin: "http://localhost:5173",
        ...(actor ? { cookie: actor.cookie, "x-csrf-token": actor.csrf } : {}),
        "idempotency-key": randomUUID(),
      },
      ...(payload !== undefined ? { payload } : {}),
    });
    return {
      status: response.statusCode,
      data: response.headers["content-type"]?.includes("application/json")
        ? response.json()
        : response.rawPayload,
      headers: response.headers,
    };
  };
  const register = async (name: string) => {
    const r = await request(null, "POST", "/api/auth/register", {
      username: name,
      name,
      password: "Community-fixture-2026!",
      adult: true,
    });
    assert.equal(r.status, 200);
    return {
      id: r.data.user.id,
      cookie: String(r.headers["set-cookie"]).split(";")[0],
      csrf: r.data.csrf,
    };
  };
  const players = await Promise.all(
    ["community_a", "community_b", "community_c", "community_d"].map(register),
  );
  const publish = async (roster: string[], category = "Singles") => {
    const r = await request(players[0], "POST", "/api/results", {
      unitId: randomUUID(),
      scopeId: null,
      category,
      format: "ONE_21",
      roster,
      games: [[21, 17]],
      playedAt: new Date(Date.now() - 300000).toISOString(),
      agree: true,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const view = await request(players[0], "GET", "/api/results/" + r.data.id);
    for (const p of players.filter(
      (p) => roster.includes(p.id) && p.id !== players[0].id,
    ))
      assert.equal(
        (
          await request(p, "POST", "/api/results/" + r.data.id + "/approve", {
            revisionId: view.data.revisionId,
            agree: true,
          })
        ).status,
        200,
      );
    app.service.work();
    return r.data.id;
  };
  return { db, app, request, players, publish };
}
test("declared global pools distinguish country and city; invalid country or incomplete opt-in fails", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    for (const [p, country, city] of [
      [a, "DE", "Berlin"],
      [b, "US", "Berlin"],
    ] as const) {
      const me = f.app.service.profile(p.id);
      const r = await f.request(p, "PATCH", "/api/profile", {
        name: me.name,
        district: "Central",
        country,
        city,
        publicName: false,
        publicDistrict: false,
        publicHistory: false,
        discoverable: true,
        localOptIn: true,
        breakMode: false,
        timezone: "Europe/Berlin",
        goals: {},
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const table = await f.request(p, "GET", "/api/rankings?category=Singles");
      assert.equal(table.data.total, 1);
      assert.equal(table.data.crownAvailable, false);
    }
    assert.notEqual(
      localityKey("DE", "Berlin", "Central"),
      localityKey("US", "Berlin", "Central"),
    );
    assert.equal(
      localityKey("DE", "  Berlin  ", "CENTRAL"),
      localityKey("DE", "Berlin", "Central"),
    );
    const me = f.app.service.profile(a.id),
      input = {
        name: me.name,
        district: "Central",
        country: "ZZ",
        city: "Berlin",
        publicName: false,
        publicDistrict: false,
        publicHistory: false,
        discoverable: true,
        localOptIn: true,
        breakMode: false,
        timezone: "Europe/Berlin",
      };
    assert.equal(
      (await f.request(a, "PATCH", "/api/profile", input)).status,
      400,
    );
    assert.equal(
      (
        await f.request(a, "PATCH", "/api/profile", {
          ...input,
          country: "DE",
          city: "",
        })
      ).status,
      400,
    );
  } finally {
    await f.app.close();
  }
});
test("private invitations retain explicit friendship review and can be revoked without granting result consent", async () => {
  const f = await fixture();
  try {
    const [a, b, c] = f.players,
      invite = await f.request(a, "POST", "/api/player-invites", {}),
      token = invite.data.path.split("/")[2];
    assert.equal(invite.status, 200);
    const publicView = await f.request(
      null,
      "GET",
      "/api/auth/player-invite/" + token,
    );
    assert.equal(publicView.data.username, "community_a");
    assert.ok(!("owner" in publicView.data));
    assert.equal(
      (
        await f.request(
          b,
          "POST",
          "/api/player-invites/" + token + "/accept",
          {},
        )
      ).status,
      200,
    );
    assert.equal(f.db.get("SELECT status FROM connections")?.status, "pending");
    assert.equal(f.db.get("SELECT count(*) AS n FROM consent")?.n, 0);
    await f.request(c, "DELETE", "/api/player-invites/" + invite.data.id, {});
    assert.equal(
      (await f.request(null, "GET", "/api/auth/player-invite/" + token)).status,
      200,
    );
    await f.request(a, "DELETE", "/api/player-invites/" + invite.data.id, {});
    assert.equal(
      (
        await f.request(
          c,
          "POST",
          "/api/player-invites/" + token + "/accept",
          {},
        )
      ).status,
      404,
    );
    const second = await f.request(a, "POST", "/api/player-invites", {});
    f.db.run("INSERT INTO blocks VALUES(?,?)", a.id, c.id);
    assert.equal(
      (
        await f.request(
          c,
          "POST",
          "/api/player-invites/" + second.data.path.split("/")[2] + "/accept",
          {},
        )
      ).status,
      404,
    );
  } finally {
    await f.app.close();
  }
});
test("invitation state distinguishes self, pending directions and accepted connections without duplicate notifications", async () => {
  const f = await fixture();
  try {
    const [owner, recipient, incoming] = f.players;
    const created = await f.request(owner, "POST", "/api/player-invites", {});
    const token = created.data.path.split("/")[2];
    const path = "/api/player-invites/" + token;
    const countNotifications = () =>
      f.db.get("SELECT count(*) AS n FROM notifications")!.n;
    assert.equal((await f.request(null, "GET", path)).status, 401);
    const publicView = await f.request(
      null,
      "GET",
      "/api/auth/player-invite/" + token,
    );
    assert.equal(publicView.status, 200);
    assert.ok(!("status" in publicView.data));
    assert.ok(!("owner" in publicView.data));
    assert.equal((await f.request(owner, "GET", path)).data.status, "self");
    const baseline = countNotifications();
    assert.equal(
      (await f.request(owner, "POST", path + "/accept", {})).status,
      404,
    );
    assert.equal(countNotifications(), baseline);
    assert.equal(
      (await f.request(recipient, "GET", path)).data.status,
      "available",
    );
    assert.equal(
      (await f.request(recipient, "POST", path + "/accept", {})).data.status,
      "pending",
    );
    assert.equal(
      (await f.request(recipient, "GET", path)).data.status,
      "pending",
    );
    const afterRequest = countNotifications();
    assert.equal(afterRequest, baseline + 1);
    assert.equal(
      (await f.request(recipient, "POST", path + "/accept", {})).data.status,
      "pending",
    );
    assert.equal(countNotifications(), afterRequest);
    assert.equal(
      (
        await f.request(
          owner,
          "POST",
          "/api/friends/" + recipient.id + "/accept",
          {},
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.request(recipient, "GET", path)).data.status,
      "accepted",
    );
    assert.equal(
      (await f.request(recipient, "POST", path + "/accept", {})).data.status,
      "accepted",
    );
    assert.equal(countNotifications(), afterRequest);
    assert.equal(
      (
        await f.request(owner, "POST", "/api/friends", {
          playerId: incoming.id,
        })
      ).status,
      200,
    );
    const afterIncoming = countNotifications();
    assert.equal(
      (await f.request(incoming, "GET", path)).data.status,
      "incoming",
    );
    assert.equal(
      (await f.request(incoming, "POST", path + "/accept", {})).data.status,
      "incoming",
    );
    assert.equal(countNotifications(), afterIncoming);
    assert.equal(
      f.db.get(
        "SELECT status FROM connections WHERE requested_by=? AND (a=? OR b=?)",
        owner.id,
        incoming.id,
        incoming.id,
      )!.status,
      "pending",
    );
    assert.equal(f.db.get("SELECT count(*) AS n FROM consent")!.n, 0);
    assert.equal(
      (
        await f.request(recipient, "POST", "/api/blocks", {
          playerId: owner.id,
        })
      ).status,
      200,
    );
    assert.equal((await f.request(recipient, "GET", path)).status, 404);
    assert.equal(
      (
        await f.request(
          owner,
          "DELETE",
          "/api/player-invites/" + created.data.id,
          {},
        )
      ).status,
      200,
    );
    assert.equal((await f.request(incoming, "GET", path)).status, 404);
  } finally {
    await f.app.close();
  }
});

test("username code lookups retain outgoing and incoming review state through cancellation and acceptance", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    const fromA = () =>
      f.request(a, "GET", "/api/players/by-username/community_b");
    const fromB = () =>
      f.request(b, "GET", "/api/players/by-username/community_a");
    assert.equal((await fromA()).data.connection, "none");
    assert.equal(
      (await f.request(a, "POST", "/api/friends", { playerId: b.id })).status,
      200,
    );
    assert.equal((await fromA()).data.connection, "outgoing");
    assert.equal((await fromB()).data.connection, "incoming");
    assert.equal((await fromA()).data.friend, false);
    assert.equal(
      (
        await f.request(a, "DELETE", "/api/friends/" + b.id, {
          pendingOnly: true,
        })
      ).status,
      200,
    );
    assert.equal((await fromA()).data.connection, "none");
    assert.equal((await fromB()).data.connection, "none");
    assert.equal(
      (await f.request(a, "POST", "/api/friends", { playerId: b.id })).status,
      200,
    );
    assert.equal(
      (await f.request(b, "POST", "/api/friends/" + a.id + "/accept", {}))
        .status,
      200,
    );
    assert.equal((await fromA()).data.connection, "accepted");
    assert.equal((await fromB()).data.connection, "accepted");
    assert.equal((await fromA()).data.friend, true);
    const racedCancellation = await f.request(
      a,
      "DELETE",
      "/api/friends/" + b.id,
      { pendingOnly: true },
    );
    assert.equal(racedCancellation.status, 409);
    assert.match(racedCancellation.data.error, /already been accepted/);
    assert.equal((await fromA()).data.connection, "accepted");
    assert.equal((await fromB()).data.friend, true);
    assert.equal(
      (await f.request(a, "GET", "/api/players/by-username/community_a")).data
        .connection,
      "self",
    );
    assert.equal(f.db.get("SELECT count(*) AS n FROM consent")!.n, 0);
    assert.equal(
      (await f.request(b, "POST", "/api/blocks", { playerId: a.id })).status,
      200,
    );
    assert.equal((await fromA()).status, 404);
    assert.equal((await fromB()).status, 404);
  } finally {
    await f.app.close();
  }
});

test("declining a group invitation cannot remove membership accepted before the decline arrives", async () => {
  const f = await fixture();
  try {
    const [owner, member] = f.players;
    const created = await f.request(owner, "POST", "/api/circles", {
      name: "Membership Race Fixture",
    });
    assert.equal(created.status, 200);
    const path = "/api/circles/" + created.data.id;
    const membership = () =>
      f.db.get(
        "SELECT status FROM circle_members WHERE circle_id=? AND user_id=?",
        created.data.id,
        member.id,
      );
    assert.equal(
      (
        await f.request(owner, "POST", path + "/invite", {
          playerId: member.id,
        })
      ).status,
      200,
    );
    assert.equal(membership()!.status, "invited");
    assert.equal(
      (
        await f.request(member, "DELETE", path + "/membership", {
          pendingOnly: true,
        })
      ).status,
      200,
    );
    assert.equal(membership(), undefined);
    assert.equal((await f.request(member, "GET", path)).status, 403);

    assert.equal(
      (
        await f.request(owner, "POST", path + "/invite", {
          playerId: member.id,
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.request(member, "POST", path + "/accept", {})).status,
      200,
    );
    assert.equal(membership()!.status, "accepted");
    const lateDecline = await f.request(
      member,
      "DELETE",
      path + "/membership",
      { pendingOnly: true },
    );
    assert.equal(lateDecline.status, 409);
    assert.match(lateDecline.data.error, /already joined/);
    assert.equal(membership()!.status, "accepted");
    assert.equal((await f.request(member, "GET", path)).status, 200);
    assert.equal(
      (await f.request(member, "DELETE", path + "/membership", {})).status,
      200,
    );
    assert.equal(membership(), undefined);
    assert.equal((await f.request(member, "GET", path)).status, 403);
    assert.equal(
      f.db.get("SELECT owner FROM circles WHERE id=?", created.data.id)!.owner,
      owner.id,
    );
    assert.equal(f.db.get("SELECT count(*) AS n FROM consent")!.n, 0);
  } finally {
    await f.app.close();
  }
});

test("circle identity is owner-only and recap contains whole-group evidence without foreign result-detail access", async () => {
  const f = await fixture();
  try {
    const [a, b, c, d] = f.players,
      created = await f.request(a, "POST", "/api/circles", {
        name: "Existing Group",
      }),
      circle = created.data.id;
    for (const p of [b, c]) {
      await f.request(a, "POST", "/api/circles/" + circle + "/invite", {
        playerId: p.id,
      });
      await f.request(p, "POST", "/api/circles/" + circle + "/accept", {});
    }
    const identity = {
      crest: "court",
      tagline: "Real rallies, real friends",
      recapDay: 2,
    };
    assert.equal(
      (
        await f.request(
          b,
          "PATCH",
          "/api/circles/" + circle + "/identity",
          identity,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          a,
          "PATCH",
          "/api/circles/" + circle + "/identity",
          identity,
        )
      ).status,
      200,
    );
    const unit = await f.publish([a.id, b.id]);
    const recap = await f.request(
      c,
      "GET",
      "/api/circles/" + circle + "/recap?category=Singles",
    );
    assert.equal(recap.data.results, 1);
    assert.equal(recap.data.activePlayers, 2);
    assert.equal(recap.data.identity.crest, "court");
    assert.equal(recap.data.recent[0].id, undefined);
    assert.equal(recap.data.recent[0].games, undefined);
    assert.equal(
      (await f.request(c, "GET", "/api/results/" + unit)).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          d,
          "GET",
          "/api/circles/" + circle + "/recap?category=Singles",
        )
      ).status,
      403,
    );
    f.db.run("INSERT INTO blocks VALUES(?,?)", c.id, b.id);
    assert.equal(
      (
        await f.request(
          c,
          "GET",
          "/api/circles/" + circle + "/recap?category=Singles",
        )
      ).data.results,
      0,
    );
  } finally {
    await f.app.close();
  }
});
test("research is explicit, account-bound, deduplicated, erasable and does not record private payloads", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    assert.equal(
      (await f.request(a, "GET", "/api/account/research")).data.enabled,
      false,
    );
    assert.equal(
      (
        await f.request(a, "POST", "/api/account/research/events", {
          owner: a.id,
          kind: "home-view",
        })
      ).status,
      403,
    );
    await f.request(a, "PUT", "/api/account/research", { enabled: true });
    assert.equal(
      (
        await f.request(a, "POST", "/api/account/research/events", {
          owner: b.id,
          kind: "home-view",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(a, "POST", "/api/account/research/events", {
          owner: a.id,
          kind: "home-view",
          score: 2000,
        })
      ).status,
      400,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await f.request(a, "POST", "/api/account/research/events", {
            owner: a.id,
            kind: "home-view",
          })
        ).status,
        200,
      );
    assert.equal(f.db.get("SELECT count(*) AS n FROM research_events")!.n, 1);
    await f.request(a, "PUT", "/api/account/research", { enabled: false });
    assert.equal(f.db.get("SELECT count(*) AS n FROM research_events")!.n, 0);
  } finally {
    await f.app.close();
  }
});
test("encouragement is limited to another real participant and cannot alter a rating", async () => {
  const f = await fixture();
  try {
    const [a, b, c] = f.players,
      unit = await f.publish([a.id, b.id]),
      before = f.app.service.rating(a.id, "Singles");
    const payload = { recipient: b.id, kind: "well-played" };
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await f.request(
            a,
            "POST",
            "/api/results/" + unit + "/encouragement",
            payload,
          )
        ).status,
        200,
      );
    assert.equal(f.db.get("SELECT count(*) AS n FROM encouragement")!.n, 1);
    assert.deepEqual(f.app.service.rating(a.id, "Singles"), before);
    f.db.run("UPDATE users SET deleted=1 WHERE id=?", b.id);
    assert.equal(
      (
        await f.request(
          a,
          "POST",
          "/api/results/" + unit + "/encouragement",
          payload,
        )
      ).status,
      403,
    );
    f.db.run("UPDATE users SET deleted=0 WHERE id=?", b.id);
    assert.equal(
      (
        await f.request(a, "POST", "/api/results/" + unit + "/encouragement", {
          ...payload,
          recipient: a.id,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          c,
          "POST",
          "/api/results/" + unit + "/encouragement",
          payload,
        )
      ).status,
      403,
    );
  } finally {
    await f.app.close();
  }
});
test("dashboard cache follows account mutations and publication, and isolates identities", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    const before = await f.request(a, "GET", "/api/dashboard");
    assert.equal(before.data.me.id, a.id);
    assert.equal(before.data.results.length, 0);
    f.db.run("UPDATE users SET name='Changed fixture' WHERE id=?", a.id);
    assert.equal(
      (await f.request(a, "GET", "/api/dashboard")).data.me.name,
      "Changed fixture",
    );
    await f.publish([a.id, b.id]);
    const after = (await f.request(a, "GET", "/api/dashboard")).data;
    assert.equal(after.results.length, 1);
    assert.equal(after.results[0].status, "rated");
    assert.equal(
      (await f.request(b, "GET", "/api/dashboard")).data.me.id,
      b.id,
    );
    await f.request(a, "PUT", "/api/account/research", { enabled: true });
    await f.request(a, "POST", "/api/account/research/events", {
      owner: a.id,
      kind: "home-view",
    });
    const exported = (await f.request(a, "GET", "/api/account/export")).data;
    assert.equal(exported.research.events[0].kind, "home-view");
    assert.ok(!JSON.stringify(exported.passkeys).includes("public_key"));
  } finally {
    await f.app.close();
  }
});
test("portrait sanitization strips a bounded color profile and rejects active or extra metadata chunks", () => {
  const chunk = (kind: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(kind);
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([
      head,
      data,
      ...(data.length % 2 ? [Buffer.alloc(1)] : []),
    ]);
  };
  const container = (parts: Buffer[]) => {
    const b = Buffer.concat(parts),
      head = Buffer.alloc(12);
    head.write("RIFF");
    head.writeUInt32LE(b.length + 4, 4);
    head.write("WEBP", 8);
    return Buffer.concat([head, b]);
  };
  const pixels = Buffer.alloc(10);
  pixels[3] = 0x9d;
  pixels[4] = 1;
  pixels[5] = 0x2a;
  pixels.writeUInt16LE(256, 6);
  pixels.writeUInt16LE(256, 8);
  const raster = chunk("VP8 ", pixels),
    extended = Buffer.alloc(10);
  extended[0] = 0x20;
  extended.writeUIntLE(255, 4, 3);
  extended.writeUIntLE(255, 7, 3);
  const wrapped = container([
    chunk("VP8X", extended),
    chunk("ICCP", Buffer.from("color-profile")),
    raster,
  ]);
  assert.deepEqual(sanitizePortrait(wrapped), container([raster]));
  assert.equal(
    sanitizePortrait(
      container([
        chunk("VP8X", extended),
        raster,
        chunk("EXIF", Buffer.from("location")),
      ]),
    ),
    null,
  );
  extended[0] = 0x22;
  assert.equal(
    sanitizePortrait(container([chunk("VP8X", extended), raster])),
    null,
  );
  const bad = container([raster]);
  bad.writeUInt32LE(0xffffffff, 4);
  assert.equal(sanitizePortrait(bad), null);
  pixels.writeUInt16LE(257, 6);
  assert.equal(sanitizePortrait(container([chunk("VP8 ", pixels)])), null);
});
test("default anonymous password authentication throttles repeated attempts", async () => {
  const db = new Database(":memory:"),
    app = await buildApp({
      database: db,
      worker: false,
      origin: "http://localhost:5173",
    });
  try {
    const status = [];
    for (let i = 0; i < 9; i++)
      status.push(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: { origin: "http://localhost:5173" },
            payload: {
              username: "missing_fixture",
              password: "Invalid-password-2026!",
            },
          })
        ).statusCode,
      );
    assert.deepEqual(status.slice(0, 8), Array(8).fill(401));
    assert.equal(status[8], 429);
  } finally {
    await app.close();
  }
});
test("private portraits do not leak through public names and malformed files fail", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    f.db.run("UPDATE users SET public_name=1 WHERE id=?", a.id);
    f.db.run(
      "INSERT INTO portraits VALUES(?,?,?)",
      a.id,
      Buffer.from("private-photo-fixture"),
      new Date().toISOString(),
    );
    assert.equal("portrait" in f.app.service.player(a.id, b.id), false);
    assert.equal(
      (await f.request(b, "GET", "/api/portraits/" + a.id)).status,
      404,
    );
    f.db.run("UPDATE users SET public_portrait=1 WHERE id=?", a.id);
    assert.equal(
      (await f.request(b, "GET", "/api/portraits/" + a.id)).status,
      200,
    );
    f.db.run("INSERT INTO blocks VALUES(?,?)", a.id, b.id);
    assert.equal(
      (await f.request(b, "GET", "/api/portraits/" + a.id)).status,
      404,
    );
    assert.equal(
      (
        await f.request(a, "PUT", "/api/account/portrait", {
          image: "data:image/svg+xml;base64,PHN2Zz4=",
        })
      ).status,
      400,
    );
    assert.equal(safePortrait(Buffer.from("RIFF0000WEBP")), false);
  } finally {
    await f.app.close();
  }
});
test("passkey creation requires password and a single-use account/session-bound challenge", async () => {
  const f = await fixture();
  try {
    const [a, b] = f.players;
    assert.equal(
      (
        await f.request(a, "POST", "/api/account/passkeys/options", {
          password: "wrong",
        })
      ).status,
      401,
    );
    const options = await f.request(
      a,
      "POST",
      "/api/account/passkeys/options",
      { password: "Community-fixture-2026!" },
    );
    assert.equal(options.status, 200);
    assert.equal(
      options.data.options.authenticatorSelection.userVerification,
      "required",
    );
    const payload = {
      challengeId: options.data.challengeId,
      response: { id: "forged" },
      label: "Fixture",
    };
    assert.equal(
      (await f.request(b, "POST", "/api/account/passkeys/verify", payload))
        .status,
      400,
    );
    assert.equal(
      (await f.request(a, "POST", "/api/account/passkeys/verify", payload))
        .status,
      400,
    );
    assert.equal(
      (await f.request(a, "POST", "/api/account/passkeys/verify", payload))
        .status,
      400,
    );
    assert.equal(f.db.get("SELECT count(*) AS n FROM passkeys")!.n, 0);
    assert.equal(
      (
        await f.request(null, "POST", "/api/auth/passkey/verify", {
          response: { id: "forged" },
        })
      ).status,
      400,
    );
  } finally {
    await f.app.close();
  }
});
