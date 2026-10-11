import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database } from "../server/database.ts";
import { buildApp } from "../server/app.ts";
import {
  preferenceSnapshot,
  preferenceValues,
} from "../src/preference-draft.ts";

test("cached dashboards carry the requesting session binding for two sessions of the same player", async () => {
  const app = await buildApp({
    database: new Database(":memory:"),
    worker: false,
    origin: "http://localhost:5173",
  });
  try {
    const username = "sessions_" + randomUUID().slice(0, 8);
    const password = "Session-fixture-2026!";
    const first = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin: "http://localhost:5173" },
      payload: {
        name: "Session Binding Fixture",
        username,
        password,
        adult: true,
      },
    });
    assert.equal(first.statusCode, 200);
    const second = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { username, password },
    });
    assert.equal(second.statusCode, 200);
    const firstCookie = String(first.headers["set-cookie"]).split(";")[0];
    const secondCookie = String(second.headers["set-cookie"]).split(";")[0];
    const firstDashboard = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: { cookie: firstCookie },
    });
    const cachedDashboard = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: { cookie: secondCookie },
    });
    assert.equal(firstDashboard.statusCode, 200);
    assert.equal(cachedDashboard.statusCode, 200);
    assert.deepEqual(firstDashboard.json(), cachedDashboard.json());
    assert.equal(firstDashboard.headers["x-shuttl-csrf"], first.json().csrf);
    assert.equal(cachedDashboard.headers["x-shuttl-csrf"], second.json().csrf);
    assert.notEqual(
      firstDashboard.headers["x-shuttl-csrf"],
      cachedDashboard.headers["x-shuttl-csrf"],
    );
    assert.equal(
      (await app.inject({ method: "GET", url: "/api/dashboard" })).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});

test("a stale preference draft cannot silently replace newer saved privacy", async () => {
  const db = new Database(":memory:");
  const app = await buildApp({
    database: db,
    worker: false,
    origin: "http://localhost:5173",
  });
  try {
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin: "http://localhost:5173" },
      payload: {
        name: "Privacy Continuity Fixture",
        username: "prefs_" + randomUUID().slice(0, 8),
        password: "Private-fixture-2026!",
        adult: true,
      },
    });
    assert.equal(registered.statusCode, 200);
    const cookie = String(registered.headers["set-cookie"]).split(";")[0];
    const initial = (
      await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })
    ).json();
    const patch = (payload: any) =>
      app.inject({
        method: "PATCH",
        url: "/api/profile",
        headers: {
          cookie,
          origin: "http://localhost:5173",
          "x-csrf-token": initial.csrf,
          "idempotency-key": randomUUID(),
        },
        payload,
      });
    const changed = await patch({
      ...preferenceValues(initial),
      publicName: true,
      expectedPreferences: preferenceSnapshot(initial),
    });
    assert.equal(changed.statusCode, 200);
    const stale = await patch({
      ...preferenceValues(initial),
      name: "Stale Draft Name",
      expectedPreferences: preferenceSnapshot(initial),
    });
    assert.equal(stale.statusCode, 409);
    const current = (
      await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })
    ).json();
    assert.equal(current.name, initial.name);
    assert.equal(current.publicName, true);
    const reviewed = await patch({
      ...preferenceValues(current),
      name: "Reviewed Current Name",
      expectedPreferences: preferenceSnapshot(current),
    });
    assert.equal(reviewed.statusCode, 200);
    assert.equal(reviewed.json().publicName, true);
  } finally {
    await app.close();
  }
});
