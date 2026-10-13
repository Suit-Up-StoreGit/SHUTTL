import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CATEGORIES } from "../src/domain.ts";
import { now } from "./service.ts";

export function registerPodiums(app: FastifyInstance) {
  const service = app.service,
    db = service.db;
  app.get("/api/arena-place", async (req) => ({
    owner: req.actor.id,
    ...(db.get(
      "SELECT region,neighborhood FROM arena_places WHERE owner=?",
      req.actor.id,
    ) || { region: "", neighborhood: "" }),
  }));
  app.put("/api/arena-place", async (req) => {
    const input = z
      .object({
        region: z.string().trim().max(80),
        neighborhood: z.string().trim().max(80),
      })
      .strict()
      .parse(req.body);
    const key = (value: string) =>
      value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
    db.run(
      "INSERT INTO arena_places VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET region=excluded.region,region_key=excluded.region_key,neighborhood=excluded.neighborhood,neighborhood_key=excluded.neighborhood_key",
      req.actor.id,
      input.region,
      key(input.region),
      input.neighborhood,
      key(input.neighborhood),
    );
    return { owner: req.actor.id, ...input };
  });
  app.get("/api/podiums", async (req) => {
    const input = z
        .object({ category: z.enum(CATEGORIES) })
        .strict()
        .parse(req.query),
      actor = req.actor.id;
    const own = service.rating(actor, input.category),
      place = db.get("SELECT * FROM arena_places WHERE owner=?", actor);
    const board = (
      id: string,
      label: string,
      ids: string[],
      geographic = false,
      limited = false,
    ) => {
      const available = ids.filter((p) => !service.blocked(actor, p));
      const eligible = available
        .map((id) => ({ id, rating: service.rating(id, input.category) }))
        .filter(
          (p) =>
            p.rating.score !== null &&
            p.rating.status !== "Pair-linked" &&
            !!own.comparisonClass &&
            p.rating.comparisonClass === own.comparisonClass &&
            (!geographic || p.rating.status === "Established"),
        );
      const ready =
        eligible.some((p) => p.id === actor) &&
        !limited &&
        eligible.length >= (geographic ? 20 : 3) &&
        (!geographic || service.validated);
      const position = ready
        ? 1 + eligible.filter((p) => p.rating.score! > own.score!).length
        : null;
      const above = ready
        ? eligible
            .filter((p) => p.rating.score! > own.score!)
            .sort((a, b) => a.rating.score! - b.rating.score!)[0]
        : null;
      return {
        id,
        label,
        geographic,
        ready,
        limited,
        total: available.length,
        comparable: eligible.length,
        position,
        podium: position !== null && position <= 3,
        shared:
          ready &&
          eligible.filter((p) => p.rating.score === own.score).length > 1,
        pointsToPass: above ? above.rating.score! - own.score! + 1 : null,
        category: input.category,
      };
    };
    const friends = db
      .all(
        "SELECT a,b FROM connections WHERE (a=? OR b=?) AND status='accepted'",
        actor,
        actor,
      )
      .map((p) => (p.a === actor ? p.b : p.a))
      .filter((id) => !service.user(id).deleted);
    const boards = [
      board("friends", "Your friend circle", [actor, ...friends]),
    ];
    for (const c of db.all(
      "SELECT c.id,c.name FROM circles c JOIN circle_members m ON m.circle_id=c.id WHERE m.user_id=? AND m.status='accepted' ORDER BY c.id LIMIT 20",
      actor,
    )) {
      const members = db.all(
        "SELECT u.id FROM users u JOIN circle_members m ON m.user_id=u.id WHERE m.circle_id=? AND m.status='accepted' AND u.deleted=0 AND u.guest=0 LIMIT 5001",
        c.id,
      );
      boards.push(
        board(
          `group-${c.id}`,
          c.name,
          members.slice(0, 5000).map((m) => m.id),
          false,
          members.length > 5000,
        ),
      );
    }
    if (req.actor.local_opt_in && req.actor.country && req.actor.city) {
      const conditions: {
        id: string;
        label: string;
        sql: string;
        args: string[];
      }[] = [
        {
          id: "country",
          label: `${req.actor.country} · country pool`,
          sql: "u.country=?",
          args: [req.actor.country],
        },
        {
          id: "city",
          label: `${req.actor.city} · city pool`,
          sql: "u.country=? AND lower(u.city)=lower(?)",
          args: [req.actor.country, req.actor.city],
        },
      ];
      if (req.actor.district)
        conditions.push({
          id: "district",
          label: `${req.actor.district} · district pool`,
          sql: "u.locality_key=?",
          args: [req.actor.locality_key],
        });
      if (place?.region_key)
        conditions.push({
          id: "region",
          label: `${place.region} · region pool`,
          sql: "u.country=? AND a.region_key=?",
          args: [req.actor.country, place.region_key],
        });
      if (place?.neighborhood_key && req.actor.district)
        conditions.push({
          id: "neighborhood",
          label: `${place.neighborhood} · neighbourhood pool`,
          sql: "u.locality_key=? AND a.neighborhood_key=?",
          args: [req.actor.locality_key, place.neighborhood_key],
        });
      for (const c of conditions) {
        const rows = db.all(
          `SELECT u.id FROM users u LEFT JOIN arena_places a ON a.owner=u.id WHERE u.local_opt_in=1 AND u.deleted=0 AND u.guest=0 AND ${c.sql} ORDER BY u.id LIMIT 5001`,
          ...c.args,
        );
        boards.push(
          board(
            c.id,
            c.label,
            rows.slice(0, 5000).map((p) => p.id),
            true,
            rows.length > 5000,
          ),
        );
      }
    }
    return {
      owner: actor,
      category: input.category,
      asOf: now(),
      boards,
      areaEnabled: !!req.actor.local_opt_in,
      demo:
        db.get("SELECT value FROM app_meta WHERE key='demo_seeded'")?.value ===
        "true",
    };
  });
}
