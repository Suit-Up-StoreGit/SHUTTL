import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database } from "./database.ts";
import { Service, requireThat, hash, now } from "./service.ts";
import { CATEGORIES, validateGames } from "../src/domain.ts";
import { sanitizePortrait } from "./portrait.ts";

export const CRESTS = ["shuttle", "court", "rally", "orbit"] as const;
export function registerCommunity(
  app: FastifyInstance,
  db: Database,
  service: Service,
) {
  const circleAccess = (circle: string, actor: string) => {
    const row = db.get("SELECT * FROM circles WHERE id=?", circle);
    requireThat(
      row &&
        db.get(
          "SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='accepted'",
          circle,
          actor,
        ),
      "Join this circle before viewing it.",
      403,
    );
    return row;
  };
  app.patch("/api/circles/:id/identity", async (req) => {
    const circle = circleAccess((req.params as any).id, req.actor.id);
    requireThat(
      circle.owner === req.actor.id,
      "Only the owner can edit the group identity.",
      403,
    );
    const input = z
      .object({
        crest: z.enum(CRESTS),
        tagline: z.string().trim().max(100),
        recapDay: z.number().int().min(0).max(6),
      })
      .strict()
      .parse(req.body);
    db.run(
      "INSERT INTO circle_identity(circle_id,crest,tagline,recap_day) VALUES(?,?,?,?) ON CONFLICT(circle_id) DO UPDATE SET crest=excluded.crest,tagline=excluded.tagline,recap_day=excluded.recap_day",
      circle.id,
      input.crest,
      input.tagline,
      input.recapDay,
    );
    return { ok: true };
  });
  app.get("/api/circles/:id/recap", async (req) => {
    const circle = circleAccess((req.params as any).id, req.actor.id);
    const input = z
      .object({
        category: z.enum(CATEGORIES),
        period: z.enum(["week", "month", "quarter"]).default("week"),
      })
      .parse(req.query);
    const days = { week: 7, month: 30, quarter: 90 }[input.period],
      cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const members = db
      .all(
        "SELECT u.id FROM users u JOIN circle_members m ON m.user_id=u.id WHERE m.circle_id=? AND m.status='accepted' AND u.deleted=0",
        circle.id,
      )
      .filter((p) => !service.blocked(req.actor.id, p.id))
      .map((p) => p.id);
    const memberSet = new Set(members);
    const events = db.all(
      `SELECT e.*,r.roster,r.games,r.format FROM rating_events e JOIN revisions r ON r.id=e.revision_id WHERE e.category=? AND e.played_at>=? AND NOT EXISTS(SELECT 1 FROM json_each(r.roster) p LEFT JOIN users u ON u.id=p.value WHERE coalesce(u.claimed_by,p.value) NOT IN (${members.map(() => "?").join(",") || "NULL"})) ORDER BY e.played_at DESC,e.unit_id DESC LIMIT 2001`,
      input.category,
      cutoff,
      ...members,
    );
    const relevant = events
      .slice(0, 2000)
      .filter((e) =>
        JSON.parse(e.roster).every((p: string) =>
          memberSet.has(service.canonical(p)),
        ),
      );
    const participants = new Set<string>();
    const edges = new Set<string>();
    const totals = new Map<
      string,
      {
        results: number;
        wins: number;
        first: number | null;
        last: number | null;
      }
    >();
    for (const e of [...relevant].reverse()) {
      const roster = (JSON.parse(e.roster) as string[]).map((p) =>
        service.canonical(p),
      );
      const winner = validateGames(e.format, JSON.parse(e.games));
      for (let i = 0; i < roster.length; i++) {
        const player = roster[i];
        participants.add(player);
        const row = totals.get(player) || {
          results: 0,
          wins: 0,
          first: null,
          last: null,
        };
        row.results++;
        row.wins += Number((i < roster.length / 2 ? 0 : 1) === winner);
        const c = JSON.parse(e.changes)[player];
        if (c?.count >= 5) {
          if (row.first === null)
            row.first = c.count === 5 ? c.after : c.before;
          row.last = c.after;
        }
        totals.set(player, row);
        for (const other of roster.slice(i + 1))
          edges.add([player, other].sort().join(":"));
      }
    }
    return {
      circle: circle.name,
      category: input.category,
      period: input.period,
      days,
      asOf: now(),
      from: cutoff,
      results: relevant.length,
      activePlayers: participants.size,
      playingEdges: edges.size,
      bounded: events.length > 2000,
      identity: db.get(
        "SELECT crest,tagline,recap_day AS recapDay FROM circle_identity WHERE circle_id=?",
        circle.id,
      ) || { crest: "shuttle", tagline: "", recapDay: 0 },
      players: [...totals]
        .map(([player, t]) => ({
          ...service.player(player, req.actor.id),
          results: t.results,
          wins: t.wins,
          visibleChange:
            t.first === null || t.last === null
              ? null
              : Math.round(t.last) - Math.round(t.first),
        }))
        .sort(
          (a, b) =>
            b.results - a.results || a.username.localeCompare(b.username),
        ),
      recent: relevant.slice(0, 8).map((e) => ({
        ...(JSON.parse(e.roster).some(
          (p: string) => service.canonical(p) === req.actor.id,
        )
          ? { id: e.unit_id }
          : {}),
        playedAt: e.played_at,
        players: JSON.parse(e.roster).map((p: string) =>
          service.player(p, req.actor.id),
        ),
      })),
      scope:
        "Only published matches whose entire roster is in your current visible circle. Activity counts are not skill rankings.",
    };
  });
  app.get("/api/players/by-username/:username", async (req) => {
    const name = z
      .string()
      .min(3)
      .max(24)
      .regex(/^[a-z0-9_]+$/i)
      .parse((req.params as any).username)
      .toLowerCase();
    const user = db.get(
      "SELECT * FROM users WHERE username=? AND guest=0 AND deleted=0",
      name,
    );
    requireThat(
      user &&
        !service.blocked(req.actor.id, user.id) &&
        (user.discoverable ||
          user.id === req.actor.id ||
          service.friends(req.actor.id, user.id)),
      "This player is unavailable.",
      404,
    );
    return {
      player: service.player(user.id, req.actor.id),
      friend: service.friends(req.actor.id, user.id),
      self: user.id === req.actor.id,
    };
  });
  app.post("/api/player-invites", async (req) => {
    z.object({}).strict().parse(req.body);
    requireThat(
      db.get(
        "SELECT count(*) AS n FROM player_invites WHERE owner=? AND revoked=0 AND expires>?",
        req.actor.id,
        now(),
      )!.n < 10,
      "Revoke an old invitation before creating another.",
      429,
    );
    const token = randomBytes(24).toString("base64url"),
      expires = new Date(Date.now() + 7 * 86400000).toISOString(),
      key = hash(token);
    db.run(
      "INSERT INTO player_invites VALUES(?,?,?,0,?)",
      key,
      req.actor.id,
      expires,
      now(),
    );
    return { id: key, path: "/connect/" + token, expires };
  });
  const invitation = (token: string) => {
    requireThat(
      /^[A-Za-z0-9_-]{32}$/.test(token),
      "This invitation is unavailable.",
      404,
    );
    const row = db.get(
      "SELECT i.*,u.username,u.name,u.public_name FROM player_invites i JOIN users u ON u.id=i.owner WHERE i.id=? AND i.revoked=0 AND i.expires>? AND u.deleted=0",
      hash(token),
      now(),
    );
    requireThat(row, "This invitation is unavailable.", 404);
    return row;
  };
  app.get("/api/auth/player-invite/:token", async (req) => {
    const row = invitation((req.params as any).token);
    return {
      username: row.username,
      name: row.public_name ? row.name : row.username,
      expires: row.expires,
    };
  });
  app.post("/api/player-invites/:token/accept", async (req) => {
    z.object({}).strict().parse(req.body);
    const row = invitation((req.params as any).token);
    requireThat(
      row.owner !== req.actor.id && !service.blocked(row.owner, req.actor.id),
      "This invitation is unavailable.",
      404,
    );
    const [a, b] = [row.owner, req.actor.id].sort();
    db.run(
      "INSERT OR IGNORE INTO connections VALUES(?,?,?,'pending')",
      a,
      b,
      req.actor.id,
    );
    service.notification(
      row.owner,
      "friend",
      "A player responded to your invitation",
      "Review their identity before accepting the friendship.",
      `friend-link:${row.id}:${req.actor.id}`,
    );
    return {
      ok: true,
      status: db.get("SELECT status FROM connections WHERE a=? AND b=?", a, b)!
        .status,
    };
  });
  app.delete("/api/player-invites/:id", async (req) => {
    db.run(
      "UPDATE player_invites SET revoked=1 WHERE id=? AND owner=?",
      (req.params as any).id,
      req.actor.id,
    );
    return { ok: true };
  });
  app.get("/api/account/player-invites", async (req) => ({
    invitations: db.all(
      "SELECT id,expires,revoked FROM player_invites WHERE owner=? ORDER BY created_at DESC LIMIT 30",
      req.actor.id,
    ),
  }));
  app.put("/api/account/portrait", async (req) => {
    const { image } = z
      .object({ image: z.string().max(60000) })
      .strict()
      .parse(req.body);
    requireThat(
      /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(image),
      "Choose a supported portrait.",
    );
    const bytes = sanitizePortrait(Buffer.from(image.split(",")[1], "base64"));
    requireThat(bytes, "Choose a supported portrait under 44 KB.");
    db.run(
      "INSERT INTO portraits VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET image=excluded.image,updated_at=excluded.updated_at",
      req.actor.id,
      bytes,
      now(),
    );
    return { ok: true };
  });
  app.delete("/api/account/portrait", async (req) => {
    db.run("DELETE FROM portraits WHERE owner=?", req.actor.id);
    return { ok: true };
  });
  app.get("/api/portraits/:id", async (req, reply) => {
    const owner = (req.params as any).id,
      user = db.get(
        "SELECT public_portrait,deleted FROM users WHERE id=?",
        owner,
      );
    requireThat(
      user &&
        !user.deleted &&
        !service.blocked(req.actor.id, owner) &&
        (owner === req.actor.id ||
          user.public_portrait ||
          service.friends(owner, req.actor.id)),
      "Portrait unavailable.",
      404,
    );
    const image = db.get("SELECT image FROM portraits WHERE owner=?", owner);
    requireThat(image, "Portrait unavailable.", 404);
    return reply
      .type("image/webp")
      .header("Cache-Control", "no-store")
      .send(Buffer.from(image.image));
  });
  app.get("/api/results/:id/encouragement", async (req) => {
    service.unitView(
      req.actor.id,
      service.unitFor(req.actor.id, (req.params as any).id),
    );
    return {
      received: db.all(
        "SELECT kind,count(*) AS count FROM encouragement WHERE unit_id=? AND recipient=? GROUP BY kind",
        (req.params as any).id,
        req.actor.id,
      ),
      sent: db.all(
        "SELECT recipient,kind FROM encouragement WHERE unit_id=? AND sender=?",
        (req.params as any).id,
        req.actor.id,
      ),
    };
  });
  app.post("/api/results/:id/encouragement", async (req) => {
    const input = z
      .object({
        recipient: z.string().uuid(),
        kind: z.enum(["well-played", "respect"]),
      })
      .strict()
      .parse(req.body);
    const result = service.unitView(
      req.actor.id,
      service.unitFor(req.actor.id, (req.params as any).id),
    );
    const recipient = db.get(
      "SELECT guest,deleted FROM users WHERE id=?",
      input.recipient,
    );
    requireThat(
      result.publishedRevisionId &&
        recipient &&
        !recipient.guest &&
        !recipient.deleted &&
        input.recipient !== req.actor.id &&
        result.players.some(
          (p: any) =>
            p.canonicalId === input.recipient || p.id === input.recipient,
        ) &&
        !service.blocked(req.actor.id, input.recipient),
      "Choose another participant in this published result.",
      403,
    );
    db.run(
      "INSERT OR IGNORE INTO encouragement VALUES(?,?,?,?,?)",
      result.id,
      req.actor.id,
      input.recipient,
      input.kind,
      now(),
    );
    return { ok: true };
  });
  app.get("/api/account/research", async (req) => ({
    owner: req.actor.id,
    enabled: !!db.get(
      "SELECT enabled FROM research_consent WHERE owner=?",
      req.actor.id,
    )?.enabled,
    version: "pilot-events-v1",
  }));
  app.put("/api/account/research", async (req) => {
    const input = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    db.transaction(() => {
      db.run(
        "INSERT INTO research_consent VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,updated_at=CASE WHEN research_consent.enabled<>excluded.enabled THEN excluded.updated_at ELSE research_consent.updated_at END",
        req.actor.id,
        Number(input.enabled),
        "pilot-events-v1",
        now(),
      );
      if (!input.enabled)
        db.run("DELETE FROM research_events WHERE owner=?", req.actor.id);
    });
    return { ok: true };
  });
  app.post("/api/account/research/events", async (req) => {
    const input = z
      .object({
        owner: z.string().uuid(),
        kind: z.enum([
          "home-view",
          "comparison-view",
          "history-view",
          "insight-view",
          "group-recap-view",
          "share-created",
        ]),
      })
      .strict()
      .parse(req.body);
    requireThat(
      input.owner === req.actor.id,
      "Your account changed. Start again.",
      403,
    );
    requireThat(
      db.get("SELECT enabled FROM research_consent WHERE owner=?", req.actor.id)
        ?.enabled,
      "Research participation is off.",
      403,
    );
    const last = db.get(
      "SELECT created_at FROM research_events WHERE owner=? AND kind=? ORDER BY created_at DESC LIMIT 1",
      req.actor.id,
      input.kind,
    );
    if (!last || Date.now() - Date.parse(last.created_at) >= 15 * 60000)
      db.run(
        "INSERT INTO research_events VALUES(?,?,?,?)",
        randomUUID(),
        req.actor.id,
        input.kind,
        now(),
      );
    db.run(
      "DELETE FROM research_events WHERE created_at<?",
      new Date(Date.now() - 90 * 86400000).toISOString(),
    );
    return { ok: true };
  });
}
