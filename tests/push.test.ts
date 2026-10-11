import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import webpush from "web-push";
import { Database } from "../server/database.ts";
import { buildApp } from "../server/app.ts";
import {
  PushWorker,
  trustedPushEndpoint,
  pushConfiguration,
} from "../server/push.ts";
const origin = "http://localhost:5173";
test("notification readiness rejects invalid or mismatched VAPID identity", () => {
  const fields = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  const saved = fields.map((key) => [key, process.env[key]]);
  try {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:fixture@example.invalid";
    assert.ok(pushConfiguration());
    process.env.VAPID_PRIVATE_KEY = webpush.generateVAPIDKeys().privateKey;
    assert.equal(pushConfiguration(), null);
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:";
    assert.equal(pushConfiguration(), null);
    process.env.VAPID_PUBLIC_KEY = "broken-key";
    assert.equal(pushConfiguration(), null);
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  }
});
async function fixture() {
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = "mailto:fixture@example.invalid";
  const app = await buildApp({
    database: new Database(":memory:"),
    worker: false,
    origin,
  });
  const call = async (
    client: any,
    method: string,
    url: string,
    payload?: any,
  ) => {
    const r = await app.inject({
      method: method as any,
      url,
      headers: {
        origin,
        ...(client
          ? { cookie: client.cookie, "x-csrf-token": client.csrf }
          : {}),
        "idempotency-key": randomUUID(),
      },
      ...(payload ? { payload } : {}),
    });
    return { status: r.statusCode, data: r.json(), headers: r.headers };
  };
  const users = [];
  for (const username of ["notify_a", "notify_b"]) {
    const r = await call(null, "POST", "/api/auth/register", {
      username,
      name: "Private 1800 player",
      password: "Notification-test-2026!",
      adult: true,
    });
    assert.equal(r.status, 200);
    users.push({
      id: r.data.user.id,
      csrf: r.data.csrf,
      cookie: String(r.headers["set-cookie"]).split(";")[0],
    });
  }
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/fixture-" + randomUUID(),
    expirationTime: null,
    keys: {
      p256dh: webpush.generateVAPIDKeys().publicKey,
      auth: randomBytes(16).toString("base64url"),
    },
  };
  const preferences = {
    actions: true,
    updates: true,
    comparisons: true,
    quietHours: false,
  };
  return { app, call, users, subscription, preferences };
}
test("push endpoints reject arbitrary hosts and credential tricks", () => {
  for (const value of [
    "http://fcm.googleapis.com/fcm/send/a",
    "https://127.0.0.1/a",
    "https://web.push.apple.com.evil.invalid/a",
    "https://user:password@fcm.googleapis.com/a",
    "https://fcm.googleapis.com:444/a",
    "https://fcm.googleapis.com/a#fragment",
  ]) {
    assert.equal(trustedPushEndpoint(value), false, value);
  }
  assert.equal(trustedPushEndpoint("https://web.push.apple.com/fixture"), true);
  assert.equal(
    trustedPushEndpoint(
      "https://updates.push.services.mozilla.com/wpush/v2/fixture",
    ),
    true,
  );
});
test("device preferences are private, notifications queue once, and logout revokes the device", async () => {
  const f = await fixture();
  let worker: PushWorker | null = null;
  try {
    const added = await f.call(f.users[0], "POST", "/api/push", {
      subscription: f.subscription,
      preferences: f.preferences,
    });
    assert.equal(added.status, 200);
    assert.equal(
      (await f.call(f.users[1], "GET", "/api/push")).data.devices.length,
      0,
    );
    assert.equal(
      (
        await f.call(
          f.users[1],
          "PATCH",
          "/api/push/" + added.data.id,
          f.preferences,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await f.call(f.users[1], "POST", "/api/push", {
          subscription: f.subscription,
          preferences: f.preferences,
        })
      ).status,
      409,
    );
    for (let i = 0; i < 2; i++)
      f.app.service.notification(
        f.users[0].id,
        "rating",
        "Private 1800 player’s score",
        "Sensitive private detail",
        "same-event",
      );
    assert.equal(
      f.app.service.db.get("SELECT count(*) AS n FROM push_deliveries")!.n,
      1,
    );
    const sent: string[] = [];
    worker = new PushWorker(
      f.app.service.db,
      async (_subscription, payload) => {
        sent.push(payload);
        return 201;
      },
    );
    await worker.work();
    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0], /1800|Sensitive|Private/);
    assert.equal(
      f.app.service.db.get("SELECT status FROM push_deliveries")!.status,
      "accepted",
    );
    const me = await f.call(f.users[0], "GET", "/api/push");
    assert.ok(!JSON.stringify(me.data).includes(f.subscription.endpoint));
    await f.call(f.users[0], "POST", "/api/logout", {
      endpoint: f.subscription.endpoint,
    });
    assert.equal(
      f.app.service.db.get("SELECT count(*) AS n FROM push_subscriptions")!.n,
      0,
    );
  } finally {
    await worker?.close();
    await f.app.close();
  }
});
test("delivery retries, expired subscriptions, break mode and quiet hours use actual state", async () => {
  const f = await fixture();
  let worker: PushWorker | null = null;
  try {
    const added = await f.call(f.users[0], "POST", "/api/push", {
      subscription: f.subscription,
      preferences: f.preferences,
    });
    assert.equal(added.status, 200);
    f.app.service.notification(
      f.users[0].id,
      "rating",
      "Updated",
      "Detail",
      "retry-event",
    );
    let status = 429;
    worker = new PushWorker(f.app.service.db, async () => status);
    for (let i = 0; i < 3; i++) {
      f.app.service.db.run(
        "UPDATE push_deliveries SET next_at=?",
        new Date(Date.now() - 1000).toISOString(),
      );
      await worker.work();
    }
    assert.equal(
      f.app.service.db.get("SELECT status,attempts FROM push_deliveries")!
        .status,
      "failed",
    );
    // A process can stop during the final attempt. Restart must expose that
    // uncertainty as failure instead of leaving an undeliverable queued row.
    await worker.close();
    f.app.service.db.run(
      "UPDATE push_deliveries SET status='running' WHERE attempts=3",
    );
    worker = new PushWorker(f.app.service.db, async () => status);
    assert.equal(
      f.app.service.db.get("SELECT status FROM push_deliveries")!.status,
      "failed",
    );
    assert.equal(
      f.app.service.db.get("SELECT error_code FROM push_deliveries")!
        .error_code,
      "interrupted_delivery",
    );
    f.app.service.notification(
      f.users[0].id,
      "comparison",
      "Lead changed",
      "Detail",
      "break-event",
    );
    f.app.service.db.run(
      "UPDATE users SET break_mode=1 WHERE id=?",
      f.users[0].id,
    );
    await worker.work();
    assert.equal(
      f.app.service.db.get(
        "SELECT status FROM push_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE event_key='break-event')",
      )!.status,
      "cancelled",
    );
    const zones = Array.from(
      { length: 25 },
      (_, i) => `Etc/GMT${i - 12 >= 0 ? "+" : ""}${i - 12}`,
    );
    const timezone = zones.find((zone) => {
      const h = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: zone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      );
      return h >= 21 || h < 8;
    })!;
    f.app.service.db.run(
      "UPDATE users SET timezone=? WHERE id=?",
      timezone,
      f.users[0].id,
    );
    f.app.service.db.run(
      "UPDATE push_subscriptions SET preferences=?",
      JSON.stringify({ ...f.preferences, quietHours: true }),
    );
    f.app.service.notification(
      f.users[0].id,
      "rating",
      "Updated",
      "Detail",
      "quiet-event",
    );
    await worker.work();
    const quiet = f.app.service.db.get(
      "SELECT status,next_at FROM push_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE event_key='quiet-event')",
    )!;
    assert.equal(quiet.status, "queued");
    assert.ok(Date.parse(quiet.next_at) > Date.now());
    f.app.service.db.run(
      "UPDATE push_subscriptions SET preferences=?",
      JSON.stringify(f.preferences),
    );
    f.app.service.db.run(
      "UPDATE push_deliveries SET next_at=? WHERE status='queued'",
      new Date(Date.now() - 1000).toISOString(),
    );
    status = 410;
    await worker.work();
    assert.equal(
      f.app.service.db.get("SELECT count(*) AS n FROM push_subscriptions")!.n,
      0,
    );
  } finally {
    await worker?.close();
    await f.app.close();
  }
});
