import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  pilotMetrics,
  researchMetrics,
  type PilotParticipant,
} from "./pilot-metrics.ts";
const path = resolve(process.env.DATABASE_PATH || "./data/shuttl.sqlite");
if (!existsSync(path))
  throw new Error(
    "Set DATABASE_PATH to an existing pilot database. This report never creates a database.",
  );
const db = new DatabaseSync(path, { readOnly: true });
const asOf = new Date(process.argv[2] || Date.now()).toISOString();
try {
  const users = db
    .prepare("SELECT id,created_at FROM users WHERE guest=0 AND created_at<=?")
    .all(asOf) as any[];
  const actions = db
    .prepare(
      "SELECT actor AS user_id,created_at FROM approvals UNION SELECT author AS user_id,created_at FROM revisions WHERE number=1",
    )
    .all() as any[];
  const first = db
    .prepare(
      "SELECT user_id,min(created_at) AS published_at FROM notifications WHERE kind='rating' GROUP BY user_id",
    )
    .all() as any[];
  const activity = new Map<string, string[]>();
  for (const action of actions) {
    if (action.created_at <= asOf)
      activity.set(action.user_id, [
        ...(activity.get(action.user_id) || []),
        action.created_at,
      ]);
  }
  const publication = new Map(first.map((v) => [v.user_id, v.published_at]));
  const participants: PilotParticipant[] = users.map((u) => ({
    id: u.id,
    joined: u.created_at,
    actions: activity.get(u.id) || [],
    firstPublished: publication.get(u.id) || null,
  }));
  const demo = !!db
    .prepare("SELECT 1 FROM app_meta WHERE key='demo_seeded' AND value='true'")
    .get();
  const hasResearch = !!db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_events'",
    )
    .get();
  const research = hasResearch
    ? researchMetrics(
        (
          db
            .prepare(
              "SELECT owner,updated_at FROM research_consent WHERE enabled=1",
            )
            .all() as any[]
        ).map((p) => ({
          enrolled: p.updated_at,
          events: (
            db
              .prepare(
                "SELECT kind,created_at FROM research_events WHERE owner=? AND created_at<=?",
              )
              .all(p.owner, asOf) as any[]
          ).map((e) => ({ kind: e.kind, at: e.created_at })),
        })),
        asOf,
      )
    : { status: "No consented research collection in this database." };
  console.log(
    JSON.stringify(
      {
        asOf,
        demo,
        method:
          "Aggregate database-ledger proxies. Includes deleted registered accounts to avoid survivor bias. A return means submitting or approving a result, not opening the app or viewing a rivalry. Day-7 uses days 7–13; day-30 uses days 30–36, with only fully observed windows in the denominator. First publication is availability, not verified time-to-user-value.",
        ...pilotMetrics(participants, asOf),
        consentedResearch: research,
        acceptance:
          "No 9.5 rating or market-success claim is derived from this report. Verify cohort membership and study provenance separately.",
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
