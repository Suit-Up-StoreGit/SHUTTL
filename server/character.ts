import type { FastifyInstance } from "fastify";
import type { Service } from "./service.ts";
import { z } from "zod";
import { DEFAULT_CHARACTER, validCharacter } from "../src/character.ts";
import { requireThat, now } from "./service.ts";

export function characterProgress(service: Service, owner: string) {
  const aliases = service.actorIds(owner),
    path = `$."${owner}"`,
    field = path + ".won";
  const filter = `unit_id IN (SELECT unit_id FROM unit_players WHERE player_id IN (${aliases.map(() => "?").join(",")})) AND json_extract(changes,?) IS NOT NULL`;
  const totals = service.db.get(
    `SELECT count(*) AS matches,COALESCE(sum(json_extract(changes,?)),0) AS wins FROM rating_events WHERE ${filter}`,
    field,
    ...aliases,
    path,
  )!;
  const recent = service.db.all(
    `SELECT json_extract(changes,?) AS won FROM rating_events WHERE ${filter} ORDER BY played_at,unit_id`,
    field,
    ...aliases,
    path,
  );
  let streak = 0,
    run = 0;
  for (const r of recent) {
    run = r.won ? run + 1 : 0;
    streak = Math.max(streak, run);
    if (streak >= 3) break;
  }
  return { matches: totals.matches, wins: totals.wins, streak };
}
export function characterFor(service: Service, owner: string) {
  const row = service.db.get(
    "SELECT look FROM characters WHERE owner=?",
    owner,
  );
  return row
    ? validCharacter(JSON.parse(row.look), characterProgress(service, owner))
    : DEFAULT_CHARACTER;
}
export function registerCharacters(app: FastifyInstance) {
  app.get("/api/character", async (req) => ({
    owner: req.actor.id,
    look: characterFor(app.service, req.actor.id),
    progress: characterProgress(app.service, req.actor.id),
  }));
  app.put("/api/character", async (req) => {
    const look = z
      .object({
        body: z.enum(["original", "night", "solar"]),
        accessory: z.enum(["none", "visor", "band", "halo"]),
        dance: z.enum(["bounce", "shuffle", "spin"]),
      })
      .strict()
      .parse(req.body);
    const progress = characterProgress(app.service, req.actor.id),
      checked = validCharacter(look, progress);
    requireThat(
      JSON.stringify(checked) === JSON.stringify(look),
      "Earn this look with confirmed play before equipping it.",
    );
    app.service.db.run(
      "INSERT INTO characters VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET look=excluded.look,updated_at=excluded.updated_at",
      req.actor.id,
      JSON.stringify(checked),
      now(),
    );
    return { owner: req.actor.id, look: checked, progress };
  });
}
