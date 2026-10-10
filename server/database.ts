import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export type Row = Record<string, any>;
export class Database {
  raw: DatabaseSync;
  constructor(path = process.env.DATABASE_PATH || "./data/shuttl.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path, { timeout: 5000 });
    this.raw
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT, recovery TEXT, guest INTEGER NOT NULL DEFAULT 0, invited_by TEXT, claimed_by TEXT, district TEXT NOT NULL DEFAULT '', public_name INTEGER NOT NULL DEFAULT 0, public_district INTEGER NOT NULL DEFAULT 0, public_history INTEGER NOT NULL DEFAULT 0, discoverable INTEGER NOT NULL DEFAULT 1, local_opt_in INTEGER NOT NULL DEFAULT 0, break_mode INTEGER NOT NULL DEFAULT 0, timezone TEXT NOT NULL DEFAULT 'Asia/Singapore', goal TEXT NOT NULL DEFAULT '{}', role TEXT NOT NULL DEFAULT 'player', deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connections(a TEXT NOT NULL REFERENCES users(id), b TEXT NOT NULL REFERENCES users(id), requested_by TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(a,b));
      CREATE TABLE IF NOT EXISTS blocks(actor TEXT NOT NULL REFERENCES users(id), target TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(actor,target));
      CREATE TABLE IF NOT EXISTS circles(id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS circle_members(circle_id TEXT NOT NULL REFERENCES circles(id), user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, PRIMARY KEY(circle_id,user_id));
      CREATE TABLE IF NOT EXISTS scopes(id TEXT PRIMARY KEY, author TEXT NOT NULL REFERENCES users(id), roster TEXT NOT NULL, category TEXT NOT NULL, format TEXT NOT NULL, starts TEXT NOT NULL, ends TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS consent(scope_id TEXT NOT NULL REFERENCES scopes(id), participant TEXT NOT NULL REFERENCES users(id), actor TEXT NOT NULL REFERENCES users(id), accepted_at TEXT NOT NULL, revoked_at TEXT, PRIMARY KEY(scope_id,participant));
      CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY, author TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, scope_id TEXT REFERENCES scopes(id), current_revision TEXT, accepted_revision TEXT, published_revision TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY, unit_id TEXT NOT NULL REFERENCES units(id), number INTEGER NOT NULL, author TEXT NOT NULL REFERENCES users(id), roster TEXT NOT NULL, format TEXT NOT NULL, games TEXT NOT NULL, played_at TEXT NOT NULL, retrospective INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', content_hash TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(unit_id,number));
      CREATE TABLE IF NOT EXISTS approvals(revision_id TEXT NOT NULL REFERENCES revisions(id), participant TEXT NOT NULL REFERENCES users(id), actor TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(revision_id,participant));
      CREATE TABLE IF NOT EXISTS unit_players(unit_id TEXT NOT NULL REFERENCES units(id), player_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(unit_id,player_id));
      CREATE TABLE IF NOT EXISTS duties(revision_id TEXT NOT NULL REFERENCES revisions(id), participant TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL DEFAULT 'open', delivered_at TEXT, due_at TEXT, handled_at TEXT, PRIMARY KEY(revision_id,participant));
      CREATE TABLE IF NOT EXISTS ratings(user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, mu REAL NOT NULL, variance REAL NOT NULL, count INTEGER NOT NULL, peak REAL NOT NULL, last_played TEXT, partners TEXT NOT NULL, comparison_class TEXT, snapshot INTEGER NOT NULL, PRIMARY KEY(user_id,category));
      CREATE TABLE IF NOT EXISTS rating_events(unit_id TEXT PRIMARY KEY REFERENCES units(id), revision_id TEXT NOT NULL REFERENCES revisions(id), category TEXT NOT NULL, played_at TEXT NOT NULL, changes TEXT NOT NULL, snapshot INTEGER NOT NULL, model TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(category TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS disputes(id TEXT PRIMARY KEY, unit_id TEXT NOT NULL REFERENCES units(id), revision_id TEXT NOT NULL REFERENCES revisions(id), actor TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open', decision TEXT, reviewer TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, unit_id TEXT, event_key TEXT UNIQUE NOT NULL, read_at TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency(actor TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(actor,key));
      CREATE TABLE IF NOT EXISTS guest_claims(token TEXT PRIMARY KEY, guest_id TEXT NOT NULL REFERENCES users(id), author TEXT NOT NULL REFERENCES users(id), claimant TEXT REFERENCES users(id), expires TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'invited');
      CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS unit_player_lookup ON unit_players(player_id);
      CREATE INDEX IF NOT EXISTS notification_inbox ON notifications(user_id,created_at);
      CREATE INDEX IF NOT EXISTS ratings_category ON ratings(category);
      CREATE INDEX IF NOT EXISTS revision_played ON revisions(played_at);
      CREATE INDEX IF NOT EXISTS queued_jobs ON jobs(status,created_at);
    `);
    if (
      !this.all("PRAGMA table_info(units)").some(
        (column) => column.name === "physical_key",
      )
    )
      this.raw.exec("ALTER TABLE units ADD COLUMN physical_key TEXT");
    this.raw.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS unique_physical_unit ON units(physical_key)",
    );
    this.raw.exec(
      "CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    );
  }
  get(sql: string, ...params: any[]): Row | undefined {
    return this.raw.prepare(sql).get(...params) as Row | undefined;
  }
  all(sql: string, ...params: any[]): Row[] {
    return this.raw.prepare(sql).all(...params) as Row[];
  }
  run(sql: string, ...params: any[]) {
    return this.raw.prepare(sql).run(...params);
  }
  transaction<T>(action: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const value = action();
      this.raw.exec("COMMIT");
      return value;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.raw.close();
  }
}
