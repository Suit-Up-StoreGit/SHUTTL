import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { Service, requireThat, now } from "./service.ts";
import { CATEGORIES } from "../src/domain.ts";
import { milestoneFor } from "../src/home-growth.ts";
import { localityLabel } from "../src/location.ts";

function accepted(service: Service, a: string, b: string) {
  return (
    !service.blocked(a, b) &&
    !!service.db.get(
      "SELECT 1 FROM connections WHERE ((a=? AND b=?) OR (a=? AND b=?)) AND status='accepted'",
      a,
      b,
      b,
      a,
    )
  );
}

export function localCourt(service: Service, actor: string) {
  const own = service.user(actor);
  if (!own.local_opt_in || !own.locality_key) return null;
  const rows = service.db.all(
    "SELECT id FROM users WHERE locality_key=? AND local_opt_in=1 AND deleted=0 AND guest=0 ORDER BY id LIMIT 129",
    own.locality_key,
  );
  const players = rows
    .slice(0, 128)
    .filter((p) => !service.blocked(actor, p.id))
    .map((p) => ({
      ...service.player(p.id, actor),
      ratings: CATEGORIES.map((c) => service.rating(p.id, c)),
    }));
  const cutoff = Date.now() - 7 * 86400000;
  return {
    label: localityLabel(own.country, own.city, own.district),
    count: players.length,
    sampled: rows.length > 128,
    active: players.filter((p) =>
      p.ratings.some((r) => r.lastPlayed && Date.parse(r.lastPlayed) >= cutoff),
    ).length,
    published: Object.fromEntries(
      CATEGORIES.map((c) => [
        c,
        players.filter((p) =>
          p.ratings.some((r) => r.category === c && r.score !== null),
        ).length,
      ]),
    ),
    // A social presence preview, never a skill order or neighborhood title.
    people: players
      .filter((p) => p.id !== actor)
      .slice(0, 3)
      .map(({ ratings, ...p }) => p),
  };
}

export function receivedRespect(service: Service, actor: string) {
  const rows = service.db.all(
    "SELECT k.*,e.changes,e.revision_id AS current_revision,u.status,u.category FROM court_congratulations k JOIN rating_events e ON e.unit_id=k.unit_id JOIN units u ON u.id=k.unit_id WHERE k.recipient=? ORDER BY k.created_at DESC LIMIT 40",
    actor,
  );
  const congratulations = rows
    .filter((r) => {
      const change = JSON.parse(r.changes)[actor];
      return (
        r.status === "rated" &&
        r.current_revision === r.revision_id &&
        milestoneFor(change) === r.milestone &&
        change.after === r.score &&
        accepted(service, actor, r.sender)
      );
    })
    .map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      player: service.player(r.sender, actor),
      category: r.category,
      milestone: r.milestone,
      kind: "congratulation",
      createdAt: r.created_at,
    }));
  const acknowledgements = service.db
    .all(
      "SELECT k.*,u.category FROM encouragement k JOIN units u ON u.id=k.unit_id WHERE k.recipient=? ORDER BY k.created_at DESC LIMIT 20",
      actor,
    )
    .filter(
      (r) =>
        !service.blocked(actor, r.sender) && !service.user(r.sender).deleted,
    )
    .map((r) => ({
      id: `${r.unit_id}:${r.sender}`,
      unitId: r.unit_id,
      player: service.player(r.sender, actor),
      category: r.category,
      milestone: null,
      kind: "well-played",
      createdAt: r.created_at,
    }));
  return [...congratulations, ...acknowledgements]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
}

export function registerHomeGrowth(app: FastifyInstance, service: Service) {
  app.post("/api/activity/:id/congratulate", async (req) => {
    const unit = z.uuid().parse((req.params as any).id);
    const input = z
      .object({ playerId: z.uuid(), revisionId: z.uuid() })
      .strict()
      .parse(req.body);
    const actor = req.actor.id;
    return service.db.transaction(() => {
      requireThat(
        input.playerId !== actor && accepted(service, actor, input.playerId),
        "Congratulate an accepted, available friend.",
        403,
      );
      const event = service.db.get(
        "SELECT e.*,u.status FROM rating_events e JOIN units u ON u.id=e.unit_id WHERE e.unit_id=?",
        unit,
      );
      const change = event && JSON.parse(event.changes)[input.playerId];
      const milestone = milestoneFor(change);
      requireThat(
        event &&
          event.status === "rated" &&
          event.revision_id === input.revisionId &&
          milestone,
        "This milestone changed. Refresh your court before congratulating your friend.",
        409,
      );
      service.db.run(
        "INSERT INTO court_congratulations(id,unit_id,revision_id,sender,recipient,milestone,score,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(unit_id,revision_id,sender,recipient) DO UPDATE SET id=excluded.id,milestone=excluded.milestone,score=excluded.score,created_at=excluded.created_at WHERE court_congratulations.milestone<>excluded.milestone OR court_congratulations.score<>excluded.score",
        randomUUID(),
        unit,
        input.revisionId,
        actor,
        input.playerId,
        milestone,
        change.after,
        now(),
      );
      // Private recognition only. No rating points, public counters or device alerts.
      const saved = service.db.get(
        "SELECT id FROM court_congratulations WHERE unit_id=? AND revision_id=? AND sender=? AND recipient=?",
        unit,
        input.revisionId,
        actor,
        input.playerId,
      )!;
      return { id: saved.id, sent: true };
    });
  });
}
