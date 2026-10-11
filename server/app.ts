import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Database, type Row } from "./database.ts";
import {
  PushWorker,
  pushConfiguration,
  createPushSender,
  trustedPushEndpoint,
  defaultPushPreferences,
} from "./push.ts";
import {
  Service,
  Problem,
  requireThat,
  passwordHash,
  passwordMatches,
  hash,
  now,
} from "./service.ts";
import { CATEGORIES, FORMATS, type Category } from "../src/domain.ts";
declare module "fastify" {
  interface FastifyRequest {
    actor: Row;
    sessionToken: string;
  }
  interface FastifyInstance {
    service: Service;
  }
}
const uuid = z.string().uuid(),
  category = z.enum(CATEGORIES),
  format = z.enum(
    Object.keys(FORMATS) as [keyof typeof FORMATS, ...(keyof typeof FORMATS)[]],
  );
const username = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_]+$/i)
  .transform((s) => s.toLowerCase());
const secret = z.string().min(12, "Use at least 12 characters.").max(128);
const games = z
  .array(
    z.tuple([z.number().int().min(0).max(30), z.number().int().min(0).max(30)]),
  )
  .min(1)
  .max(3);
const body = <T extends z.ZodType>(
  req: FastifyRequest,
  schema: T,
): z.infer<T> => schema.parse(req.body);
const id = (req: FastifyRequest) => (req.params as Record<string, string>).id;
const pair = (a: string, b: string) => [a, b].sort();
export async function buildApp(
  options: {
    database?: Database;
    worker?: boolean;
    validated?: boolean;
    origin?: string;
  } = {},
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 65536,
    requestTimeout: 15000,
    trustProxy: process.env.TRUST_PROXY || false,
  });
  const db = options.database || new Database(),
    service = new Service(db, options.validated);
  app.decorate("service", service);
  app.decorateRequest("actor", null as any);
  app.decorateRequest("sessionToken", "");
  const origin =
    options.origin || process.env.APP_ORIGIN || "http://localhost:5173";
  const development = process.env.NODE_ENV !== "production";
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 180,
    timeWindow: "1 minute",
    allowList: (req) =>
      !req.url.startsWith("/api/") || req.url.startsWith("/api/health"),
    keyGenerator: (req) => {
      const token = req.cookies.shuttl_session;
      const session =
        token &&
        db.get(
          "SELECT user_id FROM sessions WHERE token=? AND expires>?",
          hash(token),
          now(),
        );
      return session ? "player:" + session.user_id : "ip:" + req.ip;
    },
  });
  app.addHook("onSend", async (req, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY")
      .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (origin.startsWith("https:"))
      reply.header("Strict-Transport-Security", "max-age=31536000");
    return payload;
  });
  const publicPath = (url: string, method: string) =>
    url === "/api/health" ||
    url.startsWith("/api/auth/") ||
    (method === "GET" &&
      (url.startsWith("/api/claims/") || url.startsWith("/api/shares/")));
  app.addHook("preHandler", async (req) => {
    if (!req.url.startsWith("/api/")) return;
    const path = req.url.split("?")[0];
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const supplied = req.headers.origin;
      const devOrigin =
        development &&
        supplied &&
        /^http:\/\/(localhost|127\.0\.0\.1):(5173|3000)$/.test(supplied);
      requireThat(
        supplied === origin || devOrigin,
        "Open SHUTTL in its own tab before changing data.",
        403,
      );
    }
    if (publicPath(path, req.method)) return;
    const token = req.cookies.shuttl_session;
    const session =
      token &&
      db.get(
        "SELECT s.*,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.deleted=0",
        hash(token),
        now(),
      );
    requireThat(session, "Sign in to continue.", 401);
    req.actor = session;
    req.sessionToken = hash(token!);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const supplied =
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : "";
      const a = Buffer.from(supplied),
        b = Buffer.from(session.csrf);
      requireThat(
        a.length === b.length && timingSafeEqual(a, b),
        "Your session changed. Refresh and try again.",
        403,
      );
    }
  });
  app.setErrorHandler((error, req, reply) => {
    const status =
      error instanceof Problem
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : (error as any).statusCode || 500;
    const message =
      error instanceof Problem
        ? error.message
        : error instanceof z.ZodError
          ? error.issues
              .map((i) => i.message)
              .slice(0, 2)
              .join(" ")
          : status === 429
            ? "Too many attempts. Please wait a moment."
            : String((error as Error).message).includes("UNIQUE constraint")
              ? "That name or result is already used."
              : "Something went wrong. Your request has not been confirmed. Try again.";
    reply
      .code(
        String((error as Error).message).includes("UNIQUE constraint")
          ? 409
          : status,
      )
      .send({
        error: message,
        code: error instanceof Problem ? error.code : "request_failed",
        requestId: req.id,
      });
  });
  const authenticate = (reply: any, user: string) => {
    const session = service.session(user);
    reply.setCookie("shuttl_session", session.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https:"),
      maxAge: 14 * 86400,
    });
    return { user: service.profile(user), csrf: session.csrf };
  };
  const mutate = (
    req: FastifyRequest,
    route: string,
    input: any,
    action: () => unknown,
  ) =>
    service.mutation(
      req.actor.id,
      String(req.headers["idempotency-key"] || ""),
      route,
      input,
      action,
    );
  const authLimit = {
    config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
  };
  app.get("/api/health", async () => ({ status: "ok", version: "0.1.0" }));
  app.post("/api/auth/register", authLimit, async (req, reply) => {
    const input = body(
      req,
      z
        .object({
          username,
          password: secret,
          name: z.string().trim().min(1).max(60),
          adult: z.literal(true),
          timezone: z.string().max(60).default("UTC"),
        })
        .strict(),
    );
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format();
    } catch {
      throw new Problem(400, "Choose a valid timezone.");
    }
    requireThat(
      !db.get("SELECT 1 FROM users WHERE username=?", input.username),
      "That username is already used.",
      409,
    );
    const encoded = await passwordHash(input.password),
      user = randomUUID(),
      recoveryCode = randomBytes(24).toString("base64url");
    db.transaction(() => {
      db.run(
        "INSERT INTO users(id,username,name,password,recovery,created_at,timezone) VALUES(?,?,?,?,?,?,?)",
        user,
        input.username,
        input.name,
        encoded,
        hash(recoveryCode),
        now(),
        input.timezone,
      );
      service.audit(user, "account.created", user, {});
    });
    return { ...authenticate(reply, user), recoveryCode };
  });
  app.post("/api/auth/login", authLimit, async (req, reply) => {
    const input = body(
        req,
        z.object({ username, password: z.string().min(1).max(128) }).strict(),
      ),
      user = db.get(
        "SELECT * FROM users WHERE username=? AND deleted=0 AND guest=0",
        input.username,
      );
    const valid = await passwordMatches(input.password, user?.password || null);
    requireThat(user && valid, "Username or password is incorrect.", 401);
    return authenticate(reply, user.id);
  });
  app.post("/api/auth/recover", authLimit, async (req, reply) => {
    const input = body(
        req,
        z
          .object({
            username,
            recoveryCode: z.string().min(20).max(80),
            password: secret,
          })
          .strict(),
      ),
      user = db.get(
        "SELECT * FROM users WHERE username=? AND deleted=0 AND guest=0",
        input.username,
      );
    const code = hash(input.recoveryCode),
      stored = user?.recovery || "0".repeat(64);
    requireThat(
      user && timingSafeEqual(Buffer.from(code), Buffer.from(stored)),
      "The account or recovery code is incorrect.",
      401,
    );
    const encoded = await passwordHash(input.password),
      recoveryCode = randomBytes(24).toString("base64url");
    db.transaction(() => {
      requireThat(
        db.get("SELECT recovery FROM users WHERE id=?", user.id)?.recovery ===
          stored,
        "That recovery code was already used.",
        409,
      );
      db.run(
        "UPDATE users SET password=?,recovery=? WHERE id=?",
        encoded,
        hash(recoveryCode),
        user.id,
      );
      db.run("DELETE FROM sessions WHERE user_id=?", user.id);
      db.run("DELETE FROM push_subscriptions WHERE owner=?", user.id);
      service.audit(user.id, "account.recovered", user.id, {});
    });
    return { ...authenticate(reply, user.id), recoveryCode };
  });
  app.get("/api/me", async (req) => ({
    ...service.profile(req.actor.id),
    csrf: req.actor.csrf,
  }));
  app.get("/api/account/reliability", async (req) =>
    service.reliability(req.actor.id),
  );
  app.post("/api/account/recovery-code", authLimit, async (req) => {
    const input = body(
      req,
      z.object({ password: z.string().max(128) }).strict(),
    );
    requireThat(
      await passwordMatches(input.password, req.actor.password),
      "Your password is incorrect.",
      401,
    );
    const code = randomBytes(24).toString("base64url");
    db.run("UPDATE users SET recovery=? WHERE id=?", hash(code), req.actor.id);
    service.audit(req.actor.id, "recovery.rotated", req.actor.id, {});
    return { recoveryCode: code };
  });
  app.post("/api/logout", async (req, reply) => {
    const input = body(
      req,
      z.object({ endpoint: z.string().max(2048).optional() }).strict(),
    );
    db.run(
      "DELETE FROM push_subscriptions WHERE owner=? AND (session_hash=? OR endpoint=?)",
      req.actor.id,
      req.sessionToken,
      input.endpoint || "",
    );
    db.run("DELETE FROM sessions WHERE token=?", req.sessionToken);
    reply.clearCookie("shuttl_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/push", async (req) => ({
    configured: !!pushConfiguration(),
    publicKey: pushConfiguration()?.publicKey || null,
    devices: db
      .all(
        "SELECT id,preferences,created_at AS createdAt FROM push_subscriptions WHERE owner=?",
        req.actor.id,
      )
      .map((v) => ({ ...v, preferences: JSON.parse(v.preferences) })),
  }));
  app.post("/api/push", async (req) => {
    requireThat(
      pushConfiguration(),
      "Device notifications are unavailable on this host.",
      503,
    );
    const input = body(
      req,
      z
        .object({
          subscription: z
            .object({
              endpoint: z
                .string()
                .max(2048)
                .refine(
                  trustedPushEndpoint,
                  "Choose a supported browser push service.",
                ),
              expirationTime: z.number().nullable().optional(),
              keys: z
                .object({
                  p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
                  auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
                })
                .strict(),
            })
            .strict(),
          preferences: z
            .object({
              actions: z.boolean(),
              updates: z.boolean(),
              comparisons: z.boolean(),
              quietHours: z.boolean(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    );
    return mutate(req, "push.subscribe", input, () => {
      const existing = db.get(
        "SELECT id,owner FROM push_subscriptions WHERE endpoint=?",
        input.subscription.endpoint,
      );
      requireThat(
        !existing || existing.owner === req.actor.id,
        "This device subscription belongs to another account. Disable it before switching.",
        409,
      );
      requireThat(
        existing ||
          db.get(
            "SELECT count(*) AS n FROM push_subscriptions WHERE owner=?",
            req.actor.id,
          )!.n < 10,
        "Manage your existing notification devices before adding another.",
      );
      const subscriptionId = existing?.id || randomUUID();
      db.run(
        "INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET session_hash=excluded.session_hash,subscription=excluded.subscription,preferences=excluded.preferences",
        subscriptionId,
        req.actor.id,
        req.sessionToken,
        input.subscription.endpoint,
        JSON.stringify(input.subscription),
        JSON.stringify(input.preferences || defaultPushPreferences),
        now(),
      );
      return { id: subscriptionId };
    });
  });
  app.patch("/api/push/:id", async (req) => {
    const input = body(
      req,
      z
        .object({
          actions: z.boolean(),
          updates: z.boolean(),
          comparisons: z.boolean(),
          quietHours: z.boolean(),
        })
        .strict(),
    );
    return mutate(req, "push.preferences", { ...input, id: id(req) }, () => {
      const result = db.run(
        "UPDATE push_subscriptions SET preferences=? WHERE id=? AND owner=?",
        JSON.stringify(input),
        id(req),
        req.actor.id,
      );
      requireThat(
        result.changes,
        "This notification device is unavailable.",
        404,
      );
      return { ok: true };
    });
  });
  app.delete("/api/push/:id", async (req) => {
    db.run(
      "DELETE FROM push_subscriptions WHERE id=? AND owner=?",
      id(req),
      req.actor.id,
    );
    return { ok: true };
  });
  app.get("/api/players", async (req) => {
    const q = z
      .object({ q: z.string().trim().min(2).max(60) })
      .parse(req.query)
      .q.toLowerCase();
    return {
      players: db
        .all(
          "SELECT id FROM users WHERE guest=0 AND deleted=0 AND discoverable=1 AND (username LIKE ? ESCAPE ? OR (public_name=1 AND name LIKE ? ESCAPE ?)) ORDER BY username LIMIT 20",
          q.replace(/[\\%_]/g, "\\$&") + "%",
          "\\",
          "%" + q.replace(/[\\%_]/g, "\\$&") + "%",
          "\\",
        )
        .filter(
          (p) => p.id !== req.actor.id && !service.blocked(req.actor.id, p.id),
        )
        .map((p) => service.player(p.id, req.actor.id)),
    };
  });
  app.get("/api/dashboard", async (req) => {
    const actor = req.actor.id,
      connections = db.all(
        "SELECT * FROM connections WHERE (a=? OR b=?) AND status='accepted'",
        actor,
        actor,
      );
    const friends = connections
      .map((c) => (c.a === actor ? c.b : c.a))
      .filter((p) => !service.blocked(actor, p))
      .map((p) => ({
        ...service.player(p, actor),
        ratings: CATEGORIES.map((c) => service.rating(p, c)),
      }));
    const feed: any[] = [];
    for (const friend of friends) {
      const rows = db.all(
        "SELECT e.* FROM rating_events e JOIN unit_players p ON p.unit_id=e.unit_id WHERE p.player_id IN (SELECT id FROM users WHERE id=? OR claimed_by=?) ORDER BY e.played_at DESC LIMIT 8",
        friend.id,
        friend.id,
      );
      for (const row of rows) {
        const change = JSON.parse(row.changes)[friend.id];
        if (change)
          feed.push({
            id: row.unit_id + friend.id,
            unitId: row.unit_id,
            player: friend,
            category: row.category,
            playedAt: row.played_at,
            score: change.count >= 5 ? change.after : null,
            delta: change.count > 5 ? change.delta : null,
            milestone:
              change.count === 5
                ? "reveal"
                : change.peakBefore !== null &&
                    change.peakBefore !== undefined &&
                    change.after > change.peakBefore
                  ? "best"
                  : null,
            won: change.won,
          });
      }
    }
    return {
      demo:
        db.get("SELECT value FROM app_meta WHERE key='demo_seeded'")?.value ===
        "true",
      me: service.profile(actor),
      friends,
      feed: feed
        .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
        .slice(0, 20),
      results: service.results(actor),
      circles: db.all(
        "SELECT c.id,c.name,c.owner,(SELECT count(*) FROM circle_members WHERE circle_id=c.id AND status='accepted') AS members FROM circles c JOIN circle_members m ON m.circle_id=c.id WHERE m.user_id=? AND m.status='accepted' ORDER BY c.created_at",
        actor,
      ),
      competitionUpdate: (() => {
        const n = db.get(
          "SELECT title,detail,created_at AS createdAt FROM notifications WHERE user_id=? AND kind='comparison' AND created_at>? ORDER BY created_at DESC LIMIT 1",
          actor,
          new Date(Date.now() - 7 * 86400000).toISOString(),
        );
        return n || null;
      })(),
      unread:
        db.get(
          "SELECT count(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL",
          actor,
        )?.n || 0,
    };
  });
  app.get("/api/inbox", async (req) => service.inbox(req.actor.id));
  app.get("/api/history", async (req) => {
    const input = z
      .object({ category, before: uuid.optional() })
      .strict()
      .parse(req.query);
    const aliases = service.actorIds(req.actor.id);
    const cursor = input.before
      ? service.unitFor(req.actor.id, input.before)
      : null;
    const rows = db.all(
      `SELECT DISTINCT u.* FROM units u JOIN unit_players p ON p.unit_id=u.id WHERE p.player_id IN (${aliases.map(() => "?").join(",")}) AND u.category=? ${cursor ? "AND (u.created_at<? OR (u.created_at=? AND u.id<?))" : ""} ORDER BY u.created_at DESC,u.id DESC LIMIT 51`,
      ...aliases,
      input.category,
      ...(cursor ? [cursor.created_at, cursor.created_at, cursor.id] : []),
    );
    return {
      results: rows.slice(0, 50).map((u) => service.unitView(req.actor.id, u)),
      next: rows.length > 50 ? rows[49].id : null,
    };
  });
  app.get("/api/comparisons/:id", async (req) => {
    const target = id(req),
      actor = req.actor.id,
      [a, b] = pair(actor, target);
    requireThat(
      !service.blocked(actor, target) &&
        (db.get(
          "SELECT 1 FROM connections WHERE a=? AND b=? AND status='accepted'",
          a,
          b,
        ) ||
          db.get(
            "SELECT 1 FROM circle_members m JOIN circle_members n ON n.circle_id=m.circle_id WHERE m.user_id=? AND n.user_id=? AND m.status='accepted' AND n.status='accepted'",
            actor,
            target,
          )),
      "Connect as friends or join the same circle before comparing.",
      403,
    );
    const own = service.actorIds(actor),
      theirs = service.actorIds(target);
    const rows = db.all(
      `SELECT DISTINCT u.* FROM units u JOIN unit_players p ON p.unit_id=u.id JOIN unit_players q ON q.unit_id=u.id WHERE p.player_id IN (${own.map(() => "?").join(",")}) AND q.player_id IN (${theirs.map(() => "?").join(",")}) AND u.status='rated' ORDER BY u.created_at DESC,u.id DESC LIMIT 201`,
      ...own,
      ...theirs,
    );
    return {
      player: {
        ...service.player(target, actor),
        ratings: CATEGORIES.map((c) => service.rating(target, c)),
      },
      results: rows.slice(0, 200).map((u) => service.unitView(actor, u)),
      limited: rows.length > 200,
    };
  });
  app.get("/api/insights", async (req) => {
    const input = z
      .object({ category, period: z.enum(["7", "30", "90", "all"]) })
      .strict()
      .parse(req.query);
    const actor = req.actor.id,
      aliases = service.actorIds(actor);
    const cutoff =
      input.period === "all"
        ? null
        : new Date(Date.now() - Number(input.period) * 86400000).toISOString();
    const rows = db.all(
      `SELECT e.* FROM rating_events e WHERE e.category=? AND e.unit_id IN (SELECT unit_id FROM unit_players WHERE player_id IN (${aliases.map(() => "?").join(",")})) ${cutoff ? "AND e.played_at>=?" : ""} ORDER BY e.played_at DESC,e.unit_id DESC LIMIT 2001`,
      input.category,
      ...aliases,
      ...(cutoff ? [cutoff] : []),
    );
    const events = rows.slice(0, 2000).reverse();
    const partners = new Map<string, any>(),
      opponents = new Map<string, any>(),
      formats = new Map<string, any>();
    const visible: any[] = [];
    let wins = 0;
    for (const event of events) {
      const change = JSON.parse(event.changes)[actor];
      if (!change) continue;
      wins += Number(change.won);
      if (change.count >= 5) visible.push(change);
      const revision = db.get(
        "SELECT roster,format FROM revisions WHERE id=?",
        event.revision_id,
      )!;
      const roster = JSON.parse(revision.roster).map((p: string) =>
          service.canonical(p),
        ),
        size = roster.length / 2,
        index = roster.indexOf(actor);
      const collect = (map: Map<string, any>, p: string) => {
        const v = map.get(p) || {
          player: service.player(p, actor),
          count: 0,
          wins: 0,
        };
        v.count++;
        v.wins += Number(change.won);
        map.set(p, v);
      };
      if (size === 2 && index >= 0)
        collect(partners, roster[index % 2 === 0 ? index + 1 : index - 1]);
      roster
        .slice(index < size ? size : 0, index < size ? size * 2 : size)
        .forEach((p: string) => collect(opponents, p));
      const f = formats.get(revision.format) || {
        format: revision.format,
        count: 0,
        wins: 0,
      };
      f.count++;
      f.wins += Number(change.won);
      formats.set(revision.format, f);
    }
    const first = visible[0],
      last = visible.at(-1),
      baseline = first?.count === 5 ? first.after : first?.before;
    const ordered = (map: Map<string, any>) =>
      [...map.values()].sort((a, b) => b.count - a.count);
    return {
      category: input.category,
      period: input.period,
      count: events.length,
      wins,
      delta: last && baseline !== undefined ? last.after - baseline : null,
      firstPlayed: events[0]?.played_at || null,
      lastPlayed: events.at(-1)?.played_at || null,
      partners: ordered(partners),
      opponents: ordered(opponents),
      formats: [...formats.values()],
      limited: rows.length > 2000,
    };
  });
  app.post("/api/notifications/read", async (req) => {
    db.run(
      "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE user_id=?",
      now(),
      req.actor.id,
    );
    return { ok: true };
  });
  app.post("/api/friends", async (req) => {
    const input = body(req, z.object({ playerId: uuid }).strict());
    return mutate(req, "friends", input, () => {
      const actor = req.actor.id,
        target = service.user(input.playerId);
      requireThat(
        actor !== target.id &&
          !target.guest &&
          !service.blocked(actor, target.id),
        "Choose an available registered player.",
      );
      const [a, b] = pair(actor, target.id);
      requireThat(
        !db.get("SELECT 1 FROM connections WHERE a=? AND b=?", a, b),
        "This connection already exists.",
        409,
      );
      db.run("INSERT INTO connections VALUES(?,?,?,?)", a, b, actor, "pending");
      service.notification(
        target.id,
        "friend",
        `${req.actor.username} invited you to their circle`,
        "Accept to compare your ratings.",
        `friend:${a}:${b}`,
      );
      return { ok: true };
    });
  });
  app.post("/api/friends/:id/accept", async (req) =>
    mutate(req, "friend.accept", { id: id(req) }, () => {
      const [a, b] = pair(req.actor.id, id(req)),
        connection = db.get(
          "SELECT * FROM connections WHERE a=? AND b=? AND status='pending'",
          a,
          b,
        );
      requireThat(
        connection &&
          connection.requested_by !== req.actor.id &&
          !service.blocked(a, b),
        "This invitation is unavailable.",
        403,
      );
      db.run(
        "UPDATE connections SET status='accepted' WHERE a=? AND b=?",
        a,
        b,
      );
      return { ok: true };
    }),
  );
  app.delete("/api/friends/:id", async (req) =>
    mutate(req, "friend.remove", { id: id(req) }, () => {
      const [a, b] = pair(req.actor.id, id(req));
      db.run("DELETE FROM connections WHERE a=? AND b=?", a, b);
      return { ok: true };
    }),
  );
  app.post("/api/blocks", async (req) => {
    const input = body(req, z.object({ playerId: uuid }).strict());
    return mutate(req, "block", input, () => {
      service.user(input.playerId);
      requireThat(
        input.playerId !== req.actor.id,
        "You cannot block yourself.",
      );
      db.run(
        "INSERT OR IGNORE INTO blocks VALUES(?,?)",
        req.actor.id,
        input.playerId,
      );
      const [a, b] = pair(req.actor.id, input.playerId);
      db.run("DELETE FROM connections WHERE a=? AND b=?", a, b);
      service.audit(req.actor.id, "connection.blocked", input.playerId, {});
      return { ok: true };
    });
  });
  app.get("/api/blocks", async (req) => ({
    players: db
      .all("SELECT target FROM blocks WHERE actor=?", req.actor.id)
      .map((p) => service.player(p.target, req.actor.id)),
  }));
  app.delete("/api/blocks/:id", async (req) => {
    db.run(
      "DELETE FROM blocks WHERE actor=? AND target=?",
      req.actor.id,
      id(req),
    );
    return { ok: true };
  });
  app.post("/api/circles", async (req) => {
    const input = body(
      req,
      z.object({ name: z.string().trim().min(3).max(60) }).strict(),
    );
    return mutate(req, "circle.create", input, () => {
      const circle = randomUUID();
      db.run(
        "INSERT INTO circles VALUES(?,?,?,?)",
        circle,
        input.name,
        req.actor.id,
        now(),
      );
      db.run(
        "INSERT INTO circle_members VALUES(?,?,?)",
        circle,
        req.actor.id,
        "accepted",
      );
      return { id: circle };
    });
  });
  app.get("/api/circles/:id", async (req) => {
    requireThat(
      db.get(
        "SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='accepted'",
        id(req),
        req.actor.id,
      ),
      "Join this circle before viewing it.",
      403,
    );
    const circle = db.get("SELECT * FROM circles WHERE id=?", id(req)),
      members = db.all(
        "SELECT user_id FROM circle_members WHERE circle_id=? AND status='accepted'",
        id(req),
      );
    return {
      ...circle,
      members: members
        .filter((m) => !service.blocked(req.actor.id, m.user_id))
        .map((m) => ({
          ...service.player(m.user_id, req.actor.id),
          ratings: CATEGORIES.map((c) => service.rating(m.user_id, c)),
        })),
    };
  });
  app.post("/api/circles/:id/invite", async (req) => {
    const input = body(req, z.object({ playerId: uuid }).strict());
    return mutate(req, "circle.invite", { ...input, circle: id(req) }, () => {
      const circle = db.get("SELECT * FROM circles WHERE id=?", id(req));
      requireThat(
        circle && circle.owner === req.actor.id,
        "Only the circle owner can invite players.",
        403,
      );
      requireThat(
        db.get(
          "SELECT count(*) AS n FROM circle_members WHERE circle_id=?",
          circle.id,
        )!.n < 128,
        "This pilot circle has reached its 128-player limit.",
      );
      const target = service.user(input.playerId);
      requireThat(
        !target.guest && !service.blocked(req.actor.id, target.id),
        "This player is unavailable.",
      );
      db.run(
        "INSERT OR IGNORE INTO circle_members VALUES(?,?,?)",
        circle.id,
        target.id,
        "invited",
      );
      service.notification(
        target.id,
        "circle",
        `Invitation to ${circle.name}`,
        "A comparison group for the people you already play with.",
        `circle:${circle.id}:${target.id}`,
      );
      return { ok: true };
    });
  });
  app.post("/api/circles/:id/accept", async (req) => {
    requireThat(
      db.get(
        "SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='invited'",
        id(req),
        req.actor.id,
      ),
      "This invitation is unavailable.",
      404,
    );
    db.run(
      "UPDATE circle_members SET status='accepted' WHERE circle_id=? AND user_id=?",
      id(req),
      req.actor.id,
    );
    return { ok: true };
  });
  app.delete("/api/circles/:id/membership", async (req) => {
    const circle = db.get("SELECT * FROM circles WHERE id=?", id(req));
    requireThat(circle, "Circle not found.", 404);
    requireThat(
      circle.owner !== req.actor.id ||
        db.get(
          "SELECT count(*) AS n FROM circle_members WHERE circle_id=? AND status='accepted'",
          circle.id,
        )!.n === 1,
      "Transfer ownership before leaving your circle.",
    );
    db.run(
      "DELETE FROM circle_members WHERE circle_id=? AND user_id=?",
      circle.id,
      req.actor.id,
    );
    return { ok: true };
  });
  app.post("/api/circles/:id/owner", async (req) => {
    const input = body(req, z.object({ playerId: uuid }).strict());
    const circle = db.get("SELECT * FROM circles WHERE id=?", id(req));
    requireThat(
      circle?.owner === req.actor.id &&
        db.get(
          "SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='accepted'",
          id(req),
          input.playerId,
        ),
      "Choose an existing member of your circle.",
      403,
    );
    db.run("UPDATE circles SET owner=? WHERE id=?", input.playerId, id(req));
    return { ok: true };
  });
  app.post("/api/guests", async (req) => {
    const input = body(
      req,
      z.object({ name: z.string().trim().min(1).max(60) }).strict(),
    );
    return mutate(req, "guest", input, () => {
      const guest = randomUUID(),
        token = randomBytes(32).toString("base64url");
      db.run(
        "INSERT INTO users(id,username,name,guest,invited_by,discoverable,created_at) VALUES(?,?,?,1,?,0,?)",
        guest,
        "guest_" + guest,
        input.name,
        req.actor.id,
        now(),
      );
      db.run(
        "INSERT INTO guest_claims(token,guest_id,author,expires) VALUES(?,?,?,?)",
        hash(token),
        guest,
        req.actor.id,
        new Date(Date.now() + 7 * 86400000).toISOString(),
      );
      return {
        player: service.player(guest, req.actor.id),
        invitePath: "/claim/" + token,
      };
    });
  });
  app.get("/api/claims/:id", async (req) => {
    const claim = db.get(
      "SELECT * FROM guest_claims WHERE token=? AND expires>?",
      hash(id(req)),
      now(),
    );
    requireThat(
      claim && claim.state !== "verified",
      "This invitation is expired or already claimed.",
      404,
    );
    const units = db.all(
      "SELECT u.* FROM units u JOIN unit_players p ON p.unit_id=u.id WHERE p.player_id=? ORDER BY u.created_at DESC LIMIT 10",
      claim.guest_id,
    );
    return {
      name: db.get("SELECT name FROM users WHERE id=?", claim.guest_id)!.name,
      author: service.player(claim.author),
      state: claim.state,
      results: units.map((u) => {
        const r = db.get(
          "SELECT * FROM revisions WHERE id=?",
          u.current_revision,
        )!;
        return {
          category: u.category,
          format: r.format,
          games: JSON.parse(r.games),
          playedAt: r.played_at,
          players: JSON.parse(r.roster).map((p: string) =>
            p === claim.guest_id ? "Your invitation" : "Other player",
          ),
        };
      }),
    };
  });
  app.post("/api/claims/:id/request", async (req) =>
    mutate(req, "claim.request", { token: id(req) }, () => {
      const claim = db.get(
        "SELECT * FROM guest_claims WHERE token=? AND expires>? AND state='invited'",
        hash(id(req)),
        now(),
      );
      requireThat(
        claim && claim.author !== req.actor.id,
        "This invitation is unavailable.",
        403,
      );
      db.run(
        "UPDATE guest_claims SET claimant=?,state='requested' WHERE token=?",
        req.actor.id,
        claim.token,
      );
      service.notification(
        claim.author,
        "claim",
        "Verify who joined your invitation",
        `${req.actor.username} is asking to claim an invited player.`,
        `claim:${claim.token}`,
      );
      return { status: "awaiting_author" };
    }),
  );
  app.post("/api/guest-claims/:id/verify", async (req) => {
    const input = body(req, z.object({ accept: z.boolean() }).strict());
    return mutate(req, "claim.verify", { ...input, claim: id(req) }, () => {
      const claim = db.get(
        "SELECT * FROM guest_claims WHERE token=? AND author=? AND state='requested'",
        id(req),
        req.actor.id,
      );
      requireThat(claim, "Claim not found.", 404);
      if (input.accept) {
        for (const unit of db.all(
          "SELECT unit_id FROM unit_players WHERE player_id=?",
          claim.guest_id,
        )) {
          const members = db.all(
            "SELECT player_id FROM unit_players WHERE unit_id=? AND player_id<>?",
            unit.unit_id,
            claim.guest_id,
          );
          requireThat(
            !members.some(
              (p) => service.canonical(p.player_id) === claim.claimant,
            ),
            "This would put one player in both positions. Review the roster first.",
            409,
          );
        }
        db.run(
          "UPDATE users SET claimed_by=? WHERE id=?",
          claim.claimant,
          claim.guest_id,
        );
        db.run(
          "UPDATE guest_claims SET state='verified' WHERE token=?",
          claim.token,
        );
        for (const c of CATEGORIES) service.enqueue(c);
        service.notification(
          claim.claimant,
          "claim",
          "Your invitation is verified",
          "Review and agree to each exact score before it counts.",
          `verified:${claim.token}`,
        );
      } else
        db.run(
          "UPDATE guest_claims SET state='invited',claimant=NULL WHERE token=?",
          claim.token,
        );
      service.audit(req.actor.id, "identity.claim_reviewed", claim.guest_id, {
        accepted: input.accept,
      });
      return { ok: true };
    });
  });
  app.get("/api/scopes", async (req) => ({
    scopes: service.scopes(req.actor.id),
  }));
  app.post("/api/scopes", async (req) => {
    const input = body(
      req,
      z
        .object({
          roster: z.array(uuid).min(2).max(4),
          category,
          format,
          starts: z.iso.datetime({ offset: true }),
          ends: z.iso.datetime({ offset: true }),
          agree: z.literal(true),
        })
        .strict(),
    );
    return mutate(req, "scope", input, () =>
      service.scope(req.actor.id, input),
    );
  });
  for (const [action, revoke] of [
    ["accept", false],
    ["revoke", true],
  ] as const)
    app.post(`/api/scopes/:id/${action}`, async (req) => {
      const input = body(req, z.object({ agree: z.literal(true) }).strict());
      return mutate(req, "scope." + action, { ...input, id: id(req) }, () =>
        service.scopeAction(req.actor.id, id(req), revoke),
      );
    });
  app.get("/api/results", async (req) => ({
    results: service.results(req.actor.id),
  }));
  app.get("/api/results/:id", async (req) =>
    service.unitView(req.actor.id, service.unitFor(req.actor.id, id(req))),
  );
  app.post("/api/results", async (req) => {
    const input = body(
      req,
      z
        .object({
          unitId: uuid,
          category,
          format,
          roster: z.array(uuid).min(2).max(4),
          games,
          playedAt: z.iso.datetime({ offset: true }),
          scopeId: uuid.nullable(),
          agree: z.literal(true),
        })
        .strict(),
    );
    return mutate(req, "result", input, () =>
      service.submit(req.actor.id, input),
    );
  });
  app.post("/api/results/:id/approve", async (req) => {
    const input = body(
      req,
      z.object({ revisionId: uuid, agree: z.literal(true) }).strict(),
    );
    return mutate(req, "approve", { ...input, id: id(req) }, () =>
      service.approve(req.actor.id, id(req), input.revisionId, input.agree),
    );
  });
  app.post("/api/results/batch-approve", async (req) => {
    const input = body(
      req,
      z
        .object({
          results: z
            .array(z.object({ id: uuid, revisionId: uuid }).strict())
            .min(1)
            .max(20),
          agree: z.literal(true),
        })
        .strict(),
    );
    return mutate(req, "approve.batch", input, () => ({
      results: input.results.map((r) =>
        service.approve(req.actor.id, r.id, r.revisionId, input.agree),
      ),
    }));
  });
  app.post("/api/results/:id/correct", async (req) => {
    const input = body(
      req,
      z
        .object({ revisionId: uuid, format, games, agree: z.literal(true) })
        .strict(),
    );
    return mutate(req, "correct", { ...input, id: id(req) }, () =>
      service.correct(req.actor.id, id(req), input),
    );
  });
  app.post("/api/results/:id/dispute", async (req) => {
    const input = body(
      req,
      z
        .object({
          revisionId: uuid,
          reason: z.string().trim().min(8).max(1500),
        })
        .strict(),
    );
    return mutate(req, "dispute", { ...input, id: id(req) }, () =>
      service.dispute(req.actor.id, id(req), input),
    );
  });
  app.patch("/api/profile", async (req) => {
    const input = body(
      req,
      z
        .object({
          name: z.string().trim().min(1).max(60),
          district: z.enum([
            "",
            "Tampines",
            "Bedok",
            "Pasir Ris",
            "Hougang",
            "Sengkang",
            "Punggol",
            "Ang Mo Kio",
            "Bishan",
            "Toa Payoh",
            "Woodlands",
            "Yishun",
            "Bukit Batok",
            "Jurong",
            "Clementi",
            "Queenstown",
            "Central",
            "Other",
          ]),
          publicName: z.boolean(),
          publicDistrict: z.boolean(),
          publicHistory: z.boolean(),
          discoverable: z.boolean(),
          localOptIn: z.boolean(),
          breakMode: z.boolean(),
          timezone: z.string().max(60),
          goals: z
            .object({
              Singles: z.number().int().min(0).max(5000).optional(),
              Doubles: z.number().int().min(0).max(5000).optional(),
              Mixed: z.number().int().min(0).max(5000).optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    );
    // Timezone validity is checked without collecting location.
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format();
    } catch {
      throw new Problem(400, "Choose a valid timezone.");
    }
    return mutate(req, "profile", input, () => {
      if (
        (req.actor.public_name && !input.publicName) ||
        (req.actor.public_district && !input.publicDistrict)
      )
        db.run("UPDATE shares SET revoked=1 WHERE owner=?", req.actor.id);
      db.run(
        "UPDATE users SET name=?,district=?,public_name=?,public_district=?,public_history=?,discoverable=?,local_opt_in=?,break_mode=?,timezone=?,goal=? WHERE id=?",
        input.name,
        input.district,
        Number(input.publicName),
        Number(input.publicDistrict),
        Number(input.publicHistory),
        Number(input.discoverable),
        Number(input.localOptIn),
        Number(input.breakMode),
        input.timezone,
        JSON.stringify(input.goals || {}),
        req.actor.id,
      );
      return service.profile(req.actor.id);
    });
  });
  app.get("/api/rankings", async (req) => {
    const input = z
      .object({ category, circle: uuid.optional() })
      .parse(req.query);
    const actor = req.actor.id;
    let players: Row[];
    let name: string;
    if (input.circle) {
      const circle = db.get("SELECT * FROM circles WHERE id=?", input.circle);
      requireThat(
        circle &&
          db.get(
            "SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='accepted'",
            input.circle,
            actor,
          ),
        "Join this circle before comparing.",
        403,
      );
      name = circle.name;
      players = db.all(
        "SELECT u.* FROM users u JOIN circle_members m ON m.user_id=u.id WHERE m.circle_id=? AND m.status='accepted' AND u.deleted=0",
        input.circle,
      );
    } else {
      name = req.actor.district || "Your district";
      players = req.actor.district
        ? db.all(
            "SELECT * FROM users WHERE district=? AND local_opt_in=1 AND deleted=0 AND guest=0 ORDER BY id LIMIT 129",
            req.actor.district,
          )
        : [];
    }
    players = players.filter((p) => !service.blocked(actor, p.id));
    const own = service.rating(actor, input.category),
      scores = players.map((p) => ({
        ...service.player(p.id, actor),
        rating: service.rating(p.id, input.category),
      }));
    const qualified = scores
      .filter(
        (p) =>
          p.rating.status === "Established" &&
          p.rating.comparisonClass &&
          p.rating.comparisonClass === own.comparisonClass,
      )
      .sort((a, b) => (b.rating.score || 0) - (a.rating.score || 0));
    const crown =
      service.validated && players.length <= 128 && qualified.length >= 20;
    const eligible = crown ? qualified : [];
    return {
      name,
      category: input.category,
      total: players.length,
      eligible: eligible.length,
      crownAvailable: crown,
      asOf: now(),
      players: eligible.map((p, i) => ({
        ...p,
        position:
          1 +
          eligible.filter((q) => (q.rating.score || 0) > (p.rating.score || 0))
            .length,
        top: (p.rating.score || 0) === (eligible[0]?.rating.score || 0),
      })),
      developing: scores.filter((p) => p.rating.score !== null).slice(0, 128),
      needsDistrict: !input.circle && !req.actor.district,
    };
  });
  app.post("/api/shares", async (req) => {
    const input = body(
      req,
      z
        .object({
          category,
          includeName: z.boolean(),
          includeDistrict: z.boolean(),
          template: z.enum(["passport", "reveal", "best"]).optional(),
        })
        .strict(),
    );
    return mutate(req, "share", input, () => {
      const rating = service.rating(req.actor.id, input.category);
      requireThat(
        rating.score !== null,
        "Complete five confirmed results before sharing a number.",
      );
      requireThat(
        !input.includeName || req.actor.public_name,
        "Enable name sharing in privacy settings first.",
      );
      requireThat(
        !input.includeDistrict || req.actor.public_district,
        "Enable district sharing in privacy settings first.",
      );
      const share = randomUUID(),
        payload = {
          category: input.category,
          score: rating.score,
          league: rating.league,
          status: rating.status,
          asOf: now(),
          createdAt: now(),
          ...(input.includeDistrict
            ? { title: service.localTitle(req.actor.id, input.category) }
            : {}),
          ...(input.includeName ? { name: req.actor.name } : {}),
          ...(input.includeDistrict ? { district: req.actor.district } : {}),
          owner: req.actor.id,
          template: input.template || "passport",
        };
      if (input.template && input.template !== "passport") {
        const milestone = service.milestone(
          req.actor.id,
          input.category,
          input.template,
        );
        requireThat(
          milestone,
          "This milestone does not yet have published evidence.",
        );
        Object.assign(payload, milestone);
        // A career milestone cannot borrow today's local title.
        delete (payload as any).title;
      }
      db.run(
        "INSERT INTO shares VALUES(?,?,?,0,?)",
        share,
        req.actor.id,
        JSON.stringify(payload),
        now(),
      );
      return { id: share, path: "/share/" + share, payload };
    });
  });
  app.get("/api/milestones", async (req) => {
    const input = z.object({ category }).strict().parse(req.query);
    return {
      reveal: service.milestone(req.actor.id, input.category, "reveal"),
      best: service.milestone(req.actor.id, input.category, "best"),
    };
  });
  app.get("/api/shares/:id", async (req) => {
    const share = db.get(
      "SELECT * FROM shares WHERE id=? AND revoked=0",
      id(req),
    );
    requireThat(share, "This share has been revoked or removed.", 404);
    const payload = JSON.parse(share.payload),
      current = service.rating(share.owner, payload.category);
    payload.createdAt ||= share.created_at;
    delete payload.owner;
    return {
      id: share.id,
      ...payload,
      isCurrent: current.score === payload.score,
    };
  });
  app.get("/api/my-shares", async (req) => ({
    shares: db
      .all(
        "SELECT id,payload,revoked FROM shares WHERE owner=? ORDER BY created_at DESC LIMIT 50",
        req.actor.id,
      )
      .map((s) => ({
        id: s.id,
        ...JSON.parse(s.payload),
        revoked: !!s.revoked,
      })),
  }));
  app.delete("/api/shares/:id", async (req) => {
    db.run(
      "UPDATE shares SET revoked=1 WHERE id=? AND owner=?",
      id(req),
      req.actor.id,
    );
    return { ok: true };
  });
  app.get(
    "/api/account/export",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (req, reply) => {
      reply.header(
        "Content-Disposition",
        'attachment; filename="shuttl-account.json"',
      );
      return {
        exportedAt: now(),
        profile: service.profile(req.actor.id),
        results: service.results(req.actor.id, 150000),
        agreements: service.scopes(req.actor.id),
        model: "gaussian-participant-0.1",
      };
    },
  );
  app.delete("/api/account", async (req, reply) => {
    const input = body(
      req,
      z
        .object({
          password: z.string().max(128),
          confirmation: z.literal("DELETE"),
        })
        .strict(),
    );
    requireThat(
      await passwordMatches(input.password, req.actor.password),
      "Your password is incorrect.",
      401,
    );
    db.transaction(() => {
      const actor = req.actor.id;
      requireThat(
        !db.get(
          "SELECT 1 FROM circles c WHERE c.owner=? AND (SELECT count(*) FROM circle_members WHERE circle_id=c.id AND status='accepted')>1",
          actor,
        ),
        "Transfer ownership of your circles before deleting your account.",
      );
      db.run(
        "UPDATE users SET username=?,name='Former player',password=NULL,recovery=NULL,district='',public_name=0,public_district=0,public_history=0,discoverable=0,local_opt_in=0,goal='{}',deleted=1 WHERE id=?",
        "deleted_" + actor,
        actor,
      );
      db.run(
        "UPDATE users SET name='Former player',deleted=1 WHERE claimed_by=?",
        actor,
      );
      db.run(
        "UPDATE users SET name='Invited player' WHERE invited_by=? AND guest=1 AND claimed_by IS NULL",
        actor,
      );
      db.run("DELETE FROM idempotency WHERE actor=?", actor);
      db.run(
        "DELETE FROM guest_claims WHERE author=? OR claimant=?",
        actor,
        actor,
      );
      db.run("DELETE FROM sessions WHERE user_id=?", actor);
      db.run("DELETE FROM push_subscriptions WHERE owner=?", actor);
      db.run("DELETE FROM connections WHERE a=? OR b=?", actor, actor);
      db.run("DELETE FROM notifications WHERE user_id=?", actor);
      db.run("DELETE FROM circle_members WHERE user_id=?", actor);
      db.run("DELETE FROM blocks WHERE actor=? OR target=?", actor, actor);
      db.run("UPDATE shares SET revoked=1 WHERE owner=?", actor);
      service.audit(actor, "account.deleted", actor, {});
    });
    reply.clearCookie("shuttl_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/reviewer", async (req) => {
    requireThat(
      req.actor.role === "reviewer",
      "Reviewer access required.",
      403,
    );
    return {
      reviews: db
        .all(
          "SELECT d.*,u.category FROM disputes d JOIN units u ON u.id=d.unit_id WHERE d.state='open' ORDER BY d.created_at",
        )
        .filter(
          (d) =>
            !db
              .all(
                "SELECT player_id FROM unit_players WHERE unit_id=?",
                d.unit_id,
              )
              .some((p) => service.canonical(p.player_id) === req.actor.id),
        )
        .map((d) => {
          service.audit(req.actor.id, "review.accessed", d.id, {});
          return {
            ...d,
            result: service.unitView(
              req.actor.id,
              db.get("SELECT * FROM units WHERE id=?", d.unit_id)!,
            ),
          };
        }),
      jobs: db.all(
        "SELECT id,category,status,attempts,error FROM jobs WHERE status<>'done' LIMIT 50",
      ),
    };
  });
  app.post("/api/reviewer/:id", async (req) => {
    const input = body(
      req,
      z
        .object({
          decision: z.enum(["uphold", "void"]),
          reason: z.string().trim().min(10).max(1500),
        })
        .strict(),
    );
    return mutate(req, "review", { ...input, id: id(req) }, () =>
      service.review(req.actor.id, id(req), input.decision, input.reason),
    );
  });
  app.post("/api/reviewer/retry-jobs", async (req) => {
    requireThat(
      req.actor.role === "reviewer",
      "Reviewer access required.",
      403,
    );
    db.run("UPDATE jobs SET attempts=0,status='queued' WHERE status<>'done'");
    return { ok: true };
  });
  if (existsSync(resolve("dist/index.html"))) {
    await app.register(staticFiles, { root: resolve("dist"), prefix: "/" });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Endpoint not found." })
        : reply.sendFile("index.html"),
    );
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  const configuration = pushConfiguration();
  const pushWorker = new PushWorker(
    db,
    configuration ? createPushSender(configuration) : null,
  );
  if (options.worker !== false) {
    timer = setInterval(() => {
      service.work();
      void pushWorker.work();
      const stamp = now();
      db.run(
        "UPDATE duties SET state='unhandled' WHERE state='open' AND due_at<? AND revision_id IN (SELECT current_revision FROM units WHERE status IN ('pending','correction_pending'))",
        stamp,
      );
      db.run("DELETE FROM sessions WHERE expires<?", stamp);
    }, 500);
    timer.unref();
  }
  app.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
    await pushWorker.close();
    db.close();
  });
  await app.ready();
  return app;
}
