import webpush from "web-push";
import { createHash, createECDH } from "node:crypto";
import type { Database } from "./database.ts";

export type PushPreferences = {
  actions: boolean;
  updates: boolean;
  comparisons: boolean;
  quietHours: boolean;
};
export const defaultPushPreferences: PushPreferences = {
  actions: true,
  updates: false,
  comparisons: false,
  quietHours: true,
};
export function trustedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      (!u.port || u.port === "443") &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export function pushChannel(
  kind: string,
): keyof Pick<PushPreferences, "actions" | "updates" | "comparisons"> {
  return kind === "comparison"
    ? "comparisons"
    : ["rating", "correction"].includes(kind)
      ? "updates"
      : "actions";
}
export function enqueuePush(
  db: Database,
  notificationId: string,
  user: string,
  kind: string,
) {
  for (const subscription of db.all(
    "SELECT id,preferences FROM push_subscriptions WHERE owner=?",
    user,
  )) {
    const prefs = JSON.parse(subscription.preferences);
    if (prefs[pushChannel(kind)])
      db.run(
        "INSERT OR IGNORE INTO push_deliveries(notification_id,subscription_id,status,attempts,next_at) VALUES(?,?,'queued',0,?)",
        notificationId,
        subscription.id,
        new Date().toISOString(),
      );
  }
}
export type PushConfiguration = {
  publicKey: string;
  privateKey: string;
  subject: string;
};
export function pushConfiguration(): PushConfiguration | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "",
    privateKey = process.env.VAPID_PRIVATE_KEY || "",
    subject = process.env.VAPID_SUBJECT || "";
  try {
    if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject))
      return null;
    const contact = new URL(subject);
    if (contact.username || contact.password) return null;
    const keys = createECDH("prime256v1");
    keys.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (keys.getPublicKey().toString("base64url") !== publicKey) return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}
export type PushSender = (
  subscription: any,
  payload: string,
  signal: AbortSignal,
) => Promise<number>;
export function createPushSender(config: PushConfiguration): PushSender {
  return async (subscription, payload, signal) => {
    if (!trustedPushEndpoint(subscription.endpoint))
      throw new Error("untrusted_endpoint");
    const request = webpush.generateRequestDetails(subscription, payload, {
      vapidDetails: config,
      TTL: 86400,
      urgency: "normal",
      topic: createHash("sha256")
        .update(JSON.parse(payload).tag)
        .digest("base64url")
        .slice(0, 32),
    });
    const response = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      body: request.body as any,
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    await response.body?.cancel();
    return response.status;
  };
}
export class PushWorker {
  private running: Promise<void> | null = null;
  private controller = new AbortController();
  private db: Database;
  private send: PushSender | null;
  constructor(db: Database, send: PushSender | null) {
    this.db = db;
    this.send = send;
    db.run(
      "UPDATE push_deliveries SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error_code='interrupted_delivery' WHERE status='running'",
    );
  }
  work() {
    if (!this.send || this.running || this.controller.signal.aborted)
      return Promise.resolve();
    this.running = this.deliver().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async deliver() {
    const row = this.db.get(
      "SELECT d.*,s.owner,s.subscription,s.preferences,n.kind,n.unit_id,n.event_key,n.created_at,u.timezone,u.break_mode,u.deleted FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=s.owner WHERE d.status='queued' AND d.attempts<3 AND d.next_at<=? ORDER BY n.created_at LIMIT 1",
      new Date().toISOString(),
    );
    if (!row) return;
    const update = (
      status: string,
      error: string | null = null,
      next = new Date().toISOString(),
    ) =>
      this.db.run(
        "UPDATE push_deliveries SET status=?,error_code=?,next_at=? WHERE notification_id=? AND subscription_id=?",
        status,
        error,
        next,
        row.notification_id,
        row.subscription_id,
      );
    const prefs: PushPreferences = JSON.parse(row.preferences);
    if (
      row.deleted ||
      !prefs[pushChannel(row.kind)] ||
      (row.kind === "comparison" && row.break_mode) ||
      Date.parse(row.created_at) < Date.now() - 3 * 86400000
    ) {
      update("cancelled");
      return;
    }
    if (row.kind === "approval") {
      const unit = this.db.get(
        "SELECT current_revision,status FROM units WHERE id=?",
        row.unit_id,
      );
      if (
        !unit ||
        !["pending", "correction_pending"].includes(unit.status) ||
        unit.current_revision !== row.event_key.split(":")[1]
      ) {
        update("cancelled");
        return;
      }
      if (
        this.db.get(
          "SELECT 1 FROM approvals WHERE revision_id=? AND actor=?",
          unit.current_revision,
          row.owner,
        )
      ) {
        update("cancelled");
        return;
      }
    }
    if (
      row.kind === "agreement" &&
      this.db.get(
        "SELECT 1 FROM consent WHERE scope_id=? AND actor=?",
        row.event_key.split(":")[1],
        row.owner,
      )
    ) {
      update("cancelled");
      return;
    }
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: row.timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    if (prefs.quietHours && (hour >= 21 || hour < 8)) {
      update("queued", null, new Date(Date.now() + 30 * 60000).toISOString());
      return;
    }
    const participant = this.db.get(
      "SELECT 1 FROM unit_players p LEFT JOIN users u ON u.id=p.player_id WHERE p.unit_id=? AND (p.player_id=? OR u.claimed_by=?)",
      row.unit_id,
      row.owner,
      row.owner,
    );
    const url =
      row.kind === "comparison"
        ? "/friends"
        : participant && row.unit_id
          ? "/inbox?result=" + encodeURIComponent(row.unit_id)
          : "/inbox";
    const payload = JSON.stringify({
      title: "SHUTTL",
      body:
        row.kind === "comparison"
          ? "A supported comparison changed in your circle."
          : pushChannel(row.kind) === "updates"
            ? "Your confirmed progress has an update."
            : "There is a player request or review update in your inbox.",
      tag: row.notification_id,
      url,
    });
    this.db.run(
      "UPDATE push_deliveries SET status='running',attempts=attempts+1 WHERE notification_id=? AND subscription_id=?",
      row.notification_id,
      row.subscription_id,
    );
    try {
      const status = await this.send!(
        JSON.parse(row.subscription),
        payload,
        this.controller.signal,
      );
      if (status === 404 || status === 410) {
        this.db.run(
          "DELETE FROM push_subscriptions WHERE id=?",
          row.subscription_id,
        );
        return;
      }
      if (status >= 200 && status < 300) update("accepted");
      else if ((status === 429 || status >= 500) && row.attempts + 1 < 3)
        update(
          "queued",
          "provider_" + status,
          new Date(Date.now() + (row.attempts ? 120000 : 30000)).toISOString(),
        );
      else update("failed", "provider_" + status);
    } catch {
      update(
        row.attempts + 1 < 3 ? "queued" : "failed",
        "delivery_failed",
        new Date(Date.now() + 30000).toISOString(),
      );
    }
  }
  async close() {
    this.controller.abort();
    await this.running;
  }
}
