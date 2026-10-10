import { randomUUID } from "node:crypto";
import { Database } from "./database.ts";
import { Service, passwordHash, now, hash } from "./service.ts";
if (
  process.env.ALLOW_DEMO_SEED !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw new Error(
    "Demo seeding is disabled. Explicitly enable ALLOW_DEMO_SEED on a development database.",
  );
const db = new Database();
if (db.get("SELECT count(*) AS n FROM users")!.n) {
  db.close();
  throw new Error(
    "This database already has players. Demo seeding never overwrites existing data.",
  );
}
const service = new Service(db, false),
  password = await passwordHash("Shuttl-demo-2026!");
const people = [
  ["demo_simon", "Simon"],
  ["demo_priya", "Priya Lim"],
  ["demo_chloe", "Chloe Tan"],
  ["demo_kai", "Kai Lee"],
  ["demo_arun", "Arun Kumar"],
  ["demo_rina", "Rina Chen"],
].map(([username, name]) => ({ id: randomUUID(), username, name }));
db.transaction(() => {
  for (const p of people)
    db.run(
      "INSERT INTO users(id,username,name,password,recovery,district,public_name,created_at) VALUES(?,?,?,?,?,?,?,?)",
      p.id,
      p.username,
      p.name,
      password,
      hash(randomUUID()),
      "Tampines",
      1,
      now(),
    );
  db.run("INSERT INTO app_meta VALUES('demo_seeded','true')");
  for (const p of people.slice(1)) {
    const [a, b] = [people[0].id, p.id].sort();
    db.run("INSERT INTO connections VALUES(?,?,?,'accepted')", a, b, a);
  }
  const circle = randomUUID();
  db.run(
    "INSERT INTO circles VALUES(?,?,?,?)",
    circle,
    "Demo · Tampines circle",
    people[0].id,
    now(),
  );
  for (const p of people)
    db.run("INSERT INTO circle_members VALUES(?,?,'accepted')", circle, p.id);
});
for (let i = 0; i < 24; i++) {
  const rotation = [
      people[0],
      people[1 + (i % 3)],
      people[4],
      people[1 + ((i + 1) % 3)],
    ],
    category = i % 5 === 0 ? "Singles" : "Doubles",
    players = category === "Singles" ? [people[0], people[4]] : rotation;
  const playedAt = new Date(Date.now() - (24 - i) * 12 * 3600000).toISOString(),
    unitId = randomUUID();
  db.transaction(() => {
    service.submit(players[0].id, {
      unitId,
      category,
      format: "ONE_21",
      roster: players.map((p) => p.id),
      games: i % 4 === 0 ? [[18, 21]] : [[21, 17]],
      playedAt,
      scopeId: null,
      agree: true,
    });
    const revision = db.get(
      "SELECT current_revision FROM units WHERE id=?",
      unitId,
    )!.current_revision;
    for (const p of players.slice(1))
      service.approve(p.id, unitId, revision, true);
  });
  service.work();
}
db.close();
console.log(
  "A clearly labeled fictional demo court is ready. Sign in as demo_simon with Shuttl-demo-2026!",
);
