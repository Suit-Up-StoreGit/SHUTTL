import {
  randomUUID,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { Database, type Row } from "./database.ts";
import {
  CATEGORIES,
  FORMATS,
  initialRating,
  updateRatings,
  validateGames,
  publicRating,
  leagueFor,
  LEAGUES,
  MODEL_VERSION,
  type Category,
  type Format,
  type Game,
  type Rating,
} from "../src/domain.ts";
import { comparisonClasses } from "./evidence.ts";
import { enqueuePush } from "./push.ts";
import { localityLabel } from "../src/location.ts";
import { milestoneFor } from "../src/home-growth.ts";
const derive = promisify(scrypt);
export const now = () => new Date().toISOString();
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class Problem extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function requireThat(
  test: unknown,
  message: string,
  status = 400,
): asserts test {
  if (!test) throw new Problem(status, message);
}
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex"),
    key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(
  password: string,
  stored: string | null,
): Promise<boolean> {
  const [salt, hex] = (stored || `${"0".repeat(32)}:${"0".repeat(128)}`).split(
    ":",
  );
  const key = (await derive(password, salt, 64)) as Buffer,
    expected = Buffer.from(hex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export class Service {
  db: Database;
  validated: boolean;
  constructor(
    db: Database,
    validated = process.env.VALIDATED_EVIDENCE_POLICY === "true",
  ) {
    this.db = db;
    this.validated = validated;
  }
  user(id: string) {
    const user = this.db.get(
      "SELECT * FROM users WHERE id=? AND deleted=0",
      id,
    );
    requireThat(user, "Player not found.", 404);
    return user;
  }
  actorIds(actor: string): string[] {
    return [
      actor,
      ...this.db
        .all("SELECT id FROM users WHERE claimed_by=?", actor)
        .map((u) => u.id),
    ];
  }
  canonical(id: string) {
    return (
      this.db.get("SELECT claimed_by FROM users WHERE id=?", id)?.claimed_by ||
      id
    );
  }
  blocked(a: string, b: string) {
    return !!this.db.get(
      "SELECT 1 FROM blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)",
      a,
      b,
      b,
      a,
    );
  }
  friends(a: string, b: string) {
    const [left, right] = [a, b].sort();
    return !!this.db.get(
      "SELECT 1 FROM connections WHERE a=? AND b=? AND status='accepted'",
      left,
      right,
    );
  }
  player(id: string, viewer?: string) {
    const u = this.db.get("SELECT * FROM users WHERE id=?", this.canonical(id));
    if (!u || u.deleted)
      return {
        id,
        username: "former_player",
        name: "Former player",
        guest: false,
      };
    const allowed =
      viewer === u.id ||
      (!!viewer && this.friends(viewer, u.id)) ||
      u.public_name;
    const portrait =
      viewer &&
      !this.blocked(viewer, u.id) &&
      (viewer === u.id || this.friends(viewer, u.id) || u.public_portrait)
        ? this.db.get("SELECT updated_at FROM portraits WHERE owner=?", u.id)
        : null;
    return {
      id,
      canonicalId: u.id,
      username: u.guest ? "" : u.username,
      name:
        allowed || (u.guest && u.invited_by === viewer) ? u.name : u.username,
      guest: !!u.guest,
      ...(portrait
        ? {
            portrait:
              "/api/portraits/" +
              u.id +
              "?v=" +
              encodeURIComponent(portrait.updated_at),
          }
        : {}),
      ...(u.public_district || viewer === u.id ? { district: u.district } : {}),
    };
  }
  notification(
    user: string,
    kind: string,
    title: string,
    detail: string,
    key: string,
    unit: string | null = null,
  ) {
    user = this.canonical(user);
    const target = this.db.get(
      "SELECT guest,deleted,break_mode FROM users WHERE id=?",
      user,
    );
    if (!target || target.guest || target.deleted) return;
    if (kind === "comparison" && target.break_mode) return;
    const notificationId = randomUUID();
    const inserted = this.db.run(
      "INSERT OR IGNORE INTO notifications(id,user_id,kind,title,detail,unit_id,event_key,created_at) VALUES(?,?,?,?,?,?,?,?)",
      notificationId,
      user,
      kind,
      title,
      detail,
      unit,
      key,
      now(),
    );
    if (inserted.changes) enqueuePush(this.db, notificationId, user, kind);
  }
  audit(actor: string | null, action: string, target: string, detail: unknown) {
    this.db.run(
      "INSERT INTO audit(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)",
      actor,
      action,
      target,
      JSON.stringify(detail),
      now(),
    );
  }
  mutation(
    actor: string,
    key: string,
    route: string,
    body: unknown,
    action: () => unknown,
  ): any {
    requireThat(
      key && key.length >= 16 && key.length <= 128,
      "This action needs a valid request identity.",
    );
    const digest = hash(route + JSON.stringify(body));
    return this.db.transaction(() => {
      const previous = this.db.get(
        "SELECT * FROM idempotency WHERE actor=? AND key=?",
        actor,
        key,
      );
      if (previous) {
        requireThat(
          previous.hash === digest,
          "That request identity belongs to a different action. Reload the current result.",
          409,
        );
        return JSON.parse(previous.response);
      }
      const result = action();
      this.db.run(
        "INSERT INTO idempotency VALUES(?,?,?,?,?)",
        actor,
        key,
        digest,
        JSON.stringify(result),
        now(),
      );
      return result;
    });
  }
  roster(actor: string, ids: string[], category: Category, historical = false) {
    requireThat(
      ids.length === (category === "Singles" ? 2 : 4),
      "Choose every player on both sides.",
    );
    requireThat(
      new Set(ids.map((id) => this.canonical(id))).size === ids.length,
      "Each player can appear only once.",
    );
    requireThat(
      ids.some((id) => this.canonical(id) === actor),
      "You must be a player in this result.",
      403,
    );
    for (const id of ids) {
      const player = historical
        ? this.db.get("SELECT * FROM users WHERE id=?", id)
        : this.user(id);
      requireThat(player, "Player not found.", 404);
      if (!historical) {
        requireThat(
          !player.guest || player.invited_by === actor || player.claimed_by,
          "You cannot use another player’s unclaimed invitation.",
          403,
        );
        requireThat(
          !this.blocked(actor, this.canonical(id)),
          "A blocked connection cannot create a new rated request.",
          403,
        );
      }
    }
  }
  rating(id: string, category: Category) {
    const row = this.db.get(
      "SELECT * FROM ratings WHERE user_id=? AND category=?",
      this.canonical(id),
      category,
    );
    if (!row)
      return {
        category,
        score: null,
        count: 0,
        peak: null,
        status: "Unrated",
        league: null,
        partnerCount: 0,
        comparisonClass: null,
        lastPlayed: null,
      };
    const partners = JSON.parse(row.partners) as string[],
      score = row.count >= 5 ? publicRating(row.mu) : null;
    const recent =
      row.last_played &&
      Date.parse(row.last_played) > Date.now() - 90 * 86400000;
    const supportedPeers = row.comparison_class
      ? this.db.get(
          "SELECT count(*) AS n FROM ratings WHERE category=? AND comparison_class=?",
          category,
          row.comparison_class,
        )!.n
      : 0;
    const established =
      this.validated &&
      row.count >= 20 &&
      row.variance <= 125 ** 2 &&
      recent &&
      supportedPeers >= 2 &&
      (category === "Singles" || partners.length >= 3);
    return {
      category,
      score,
      count: row.count,
      peak: score === null ? null : publicRating(row.peak),
      status:
        row.count < 5
          ? "Placement"
          : established
            ? "Established"
            : category !== "Singles" && partners.length < 2
              ? "Pair-linked"
              : "Developing",
      league: score === null ? null : leagueFor(score).name,
      partnerCount: partners.length,
      comparisonClass: row.comparison_class,
      lastPlayed: row.last_played,
    };
  }
  profile(actor: string) {
    const u = this.user(actor);
    const portrait = this.db.get(
      "SELECT updated_at FROM portraits WHERE owner=?",
      u.id,
    );
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      district: u.district,
      country: u.country,
      city: u.city,
      publicPortrait: !!u.public_portrait,
      portrait: portrait
        ? "/api/portraits/" +
          u.id +
          "?v=" +
          encodeURIComponent(portrait.updated_at)
        : undefined,
      role: u.role,
      publicName: !!u.public_name,
      publicDistrict: !!u.public_district,
      publicHistory: !!u.public_history,
      discoverable: !!u.discoverable,
      localOptIn: !!u.local_opt_in,
      breakMode: !!u.break_mode,
      timezone: u.timezone,
      goals: JSON.parse(u.goal),
      ratings: CATEGORIES.map((c) => this.rating(actor, c)),
    };
  }
  milestone(
    actor: string,
    category: Category,
    template: "reveal" | "best" | "promotion",
  ) {
    const rating = this.rating(actor, category);
    if (rating.score === null) return null;
    const field = `$."${actor}"`;
    const aliases = this.actorIds(actor),
      pool = `unit_id IN (SELECT unit_id FROM unit_players WHERE player_id IN (${aliases.map(() => "?").join(",")}))`;
    const floors = LEAGUES.map((league) => league.floor).filter(
      Number.isFinite,
    );
    const event =
      template === "reveal"
        ? this.db.get(
            `SELECT * FROM rating_events WHERE category=? AND ${pool} AND json_extract(changes,?)=5 ORDER BY played_at,unit_id LIMIT 1`,
            category,
            ...aliases,
            field + ".count",
          )
        : template === "promotion"
          ? this.db.get(
              `SELECT * FROM rating_events WHERE category=? AND ${pool} AND json_extract(changes,?)>5 AND (${floors.map(() => "(json_extract(changes,?)<? AND json_extract(changes,?)>=?)").join(" OR ")}) ORDER BY played_at DESC,unit_id DESC LIMIT 1`,
              category,
              ...aliases,
              field + ".count",
              ...floors.flatMap((floor) => [
                field + ".before",
                floor,
                field + ".after",
                floor,
              ]),
            )
          : this.db.get(
              `SELECT * FROM rating_events WHERE category=? AND ${pool} AND json_extract(changes,?)=? AND json_extract(changes,?)>=5 ORDER BY played_at DESC,unit_id DESC LIMIT 1`,
              category,
              ...aliases,
              field + ".after",
              rating.peak,
              field + ".count",
            );
    if (!event) return null;
    const change = JSON.parse(event.changes)[actor];
    return {
      score: change.after,
      league: leagueFor(change.after).name,
      asOf: event.played_at,
      count: change.count,
      ...(template === "promotion"
        ? { previousLeague: leagueFor(change.before).name }
        : {}),
      status:
        category !== "Singles" && (change.partnerCount ?? 0) < 2
          ? ("Pair-linked" as const)
          : ("Developing" as const),
    };
  }
  session(user: string) {
    const token = randomBytes(32).toString("base64url"),
      csrf = randomBytes(24).toString("base64url"),
      expires = new Date(Date.now() + 14 * 86400000).toISOString();
    this.db.run(
      "INSERT INTO sessions VALUES(?,?,?,?)",
      hash(token),
      user,
      csrf,
      expires,
    );
    return { token, csrf, expires };
  }
  scope(actor: string, input: any) {
    this.roster(actor, input.roster, input.category);
    requireThat(input.agree === true, "Choose whether to agree to rated play.");
    const start = new Date(input.starts).toISOString(),
      end = new Date(input.ends).toISOString();
    requireThat(
      end > start && Date.parse(end) - Date.parse(start) <= 30 * 86400000,
      "Agreements can cover a session or up to 30 days.",
    );
    requireThat(Date.parse(end) > Date.now(), "Choose a future expiry.");
    const id = randomUUID();
    this.db.run(
      "INSERT INTO scopes VALUES(?,?,?,?,?,?,?,?)",
      id,
      actor,
      JSON.stringify([...input.roster].sort()),
      input.category,
      input.format,
      start,
      end,
      now(),
    );
    const participant = input.roster.find(
      (p: string) => this.canonical(p) === actor,
    );
    this.db.run(
      "INSERT INTO consent VALUES(?,?,?,?,NULL)",
      id,
      participant,
      actor,
      now(),
    );
    for (const p of input.roster)
      if (this.canonical(p) !== actor)
        this.notification(
          p,
          "agreement",
          "Choose whether to rate this play",
          `${input.category} · ${FORMATS[input.format as Format].label}`,
          `scope:${id}:${p}`,
        );
    this.audit(actor, "scope.proposed", id, { category: input.category });
    return { id };
  }
  scopeAction(actor: string, id: string, revoke: boolean) {
    const scope = this.db.get("SELECT * FROM scopes WHERE id=?", id);
    requireThat(scope, "Agreement not found.", 404);
    const roster = JSON.parse(scope.roster) as string[],
      participant = roster.find((p) => this.canonical(p) === actor);
    requireThat(
      participant,
      "Only a named player can decide their consent.",
      403,
    );
    if (revoke) {
      requireThat(
        this.db.get(
          "SELECT 1 FROM consent WHERE scope_id=? AND participant=?",
          id,
          participant,
        ),
        "You have not accepted this agreement.",
      );
      this.db.run(
        "UPDATE consent SET revoked_at=COALESCE(revoked_at,?) WHERE scope_id=? AND participant=?",
        now(),
        id,
        participant,
      );
    } else {
      requireThat(
        scope.ends > now(),
        "This agreement has expired. Create a new one.",
        409,
      );
      requireThat(
        !this.db.get(
          "SELECT 1 FROM consent WHERE scope_id=? AND participant=? AND revoked_at IS NOT NULL",
          id,
          participant,
        ),
        "A revoked agreement cannot restart. Create a new agreement.",
        409,
      );
      this.db.run(
        "INSERT OR IGNORE INTO consent VALUES(?,?,?,?,NULL)",
        id,
        participant,
        actor,
        now(),
      );
    }
    this.audit(actor, revoke ? "scope.revoked" : "scope.accepted", id, {});
    return { id };
  }
  covered(
    scopeId: string | null,
    roster: string[],
    category: Category,
    format: Format,
    played: string,
  ): boolean {
    if (!scopeId) return false;
    const scope = this.db.get("SELECT * FROM scopes WHERE id=?", scopeId);
    if (!scope) return false;
    const scoped = JSON.parse(scope.roster) as string[];
    if (
      scope.category !== category ||
      scope.format !== format ||
      scope.starts > played ||
      scope.ends <= played ||
      JSON.stringify(scoped.map((p) => this.canonical(p)).sort()) !==
        JSON.stringify(roster.map((p) => this.canonical(p)).sort())
    )
      return false;
    return scoped.every((p) => {
      const consent = this.db.get(
        "SELECT * FROM consent WHERE scope_id=? AND participant=?",
        scopeId,
        p,
      );
      return (
        consent &&
        consent.accepted_at <= played &&
        (!consent.revoked_at || consent.revoked_at > played)
      );
    });
  }
  createRevision(actor: string, unit: Row, input: any, number: number) {
    const played = new Date(input.playedAt).toISOString();
    requireThat(
      Date.parse(played) <= Date.now() + 60000 &&
        (number > 1 || Date.parse(played) >= Date.now() - 60 * 86400000),
      "Record a completed match from the last 60 days.",
    );
    validateGames(input.format, input.games);
    this.roster(actor, input.roster, unit.category, number > 1);
    const id = randomUUID(),
      retrospective = !this.covered(
        unit.scope_id,
        input.roster,
        unit.category,
        input.format,
        played,
      );
    requireThat(
      input.agree === true,
      "Confirm that you want this exact result to count toward your rating.",
    );
    const content = {
      roster: input.roster,
      format: input.format,
      games: input.games,
      playedAt: played,
      category: unit.category,
    };
    this.db.run(
      "INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      unit.id,
      number,
      actor,
      JSON.stringify(input.roster),
      input.format,
      JSON.stringify(input.games),
      played,
      Number(retrospective),
      "pending",
      hash(JSON.stringify(content)),
      now(),
    );
    this.db.run(
      "UPDATE units SET current_revision=?,status=? WHERE id=?",
      id,
      unit.accepted_revision ? "correction_pending" : "pending",
      unit.id,
    );
    const self = input.roster.find((p: string) => this.canonical(p) === actor),
      size = input.roster.length / 2,
      side = input.roster.indexOf(self) < size ? 0 : 1;
    this.db.run(
      "INSERT INTO approvals VALUES(?,?,?,?)",
      id,
      self,
      actor,
      now(),
    );
    for (const [i, p] of input.roster.entries()) {
      this.db.run("INSERT OR IGNORE INTO unit_players VALUES(?,?)", unit.id, p);
      if (p !== self && (retrospective || (i < size ? 0 : 1) !== side)) {
        this.db.run(
          "INSERT INTO duties(revision_id,participant) VALUES(?,?)",
          id,
          p,
        );
        this.notification(
          p,
          "approval",
          number > 1
            ? "Review a proposed correction"
            : "A result needs your approval",
          `${unit.category} · ${FORMATS[input.format as Format].label}`,
          `approval:${id}:${p}`,
          unit.id,
        );
      }
    }
    return id;
  }
  submit(actor: string, input: any) {
    requireThat(
      !this.db.get("SELECT 1 FROM units WHERE id=?", input.unitId),
      "That match already exists. Reload its current state.",
      409,
    );
    const physicalKey = hash(
      JSON.stringify({
        category: input.category,
        players: input.roster.map((p: string) => this.canonical(p)).sort(),
        playedAt: new Date(input.playedAt).toISOString(),
      }),
    );
    requireThat(
      !this.db.get("SELECT 1 FROM units WHERE physical_key=?", physicalKey),
      "A result for these players at this exact start already exists. Open it from your history.",
      409,
    );
    this.db.run(
      "INSERT INTO units(id,author,category,scope_id,status,created_at,physical_key) VALUES(?,?,?,?,?,?,?)",
      input.unitId,
      actor,
      input.category,
      input.scopeId || null,
      "pending",
      now(),
      physicalKey,
    );
    const unit = this.db.get("SELECT * FROM units WHERE id=?", input.unitId)!;
    this.createRevision(actor, unit, input, 1);
    this.audit(actor, "result.submitted", unit.id, {});
    return { id: unit.id };
  }
  unitFor(actor: string, id: string) {
    const unit = this.db.get("SELECT * FROM units WHERE id=?", id);
    requireThat(unit, "Result not found.", 404);
    const members = this.db
      .all("SELECT player_id FROM unit_players WHERE unit_id=?", id)
      .map((p) => this.canonical(p.player_id));
    requireThat(
      members.includes(actor),
      "Only its players can access this result.",
      403,
    );
    return unit;
  }
  current(actor: string, id: string, expected: string) {
    const unit = this.unitFor(actor, id);
    requireThat(
      unit.current_revision === expected,
      "This score changed. Reload the exact current revision.",
      409,
    );
    const revision = this.db.get(
      "SELECT * FROM revisions WHERE id=?",
      expected,
    )!;
    return { unit, revision };
  }
  enqueue(category: Category) {
    this.db.run(
      "INSERT INTO jobs(id,category,created_at) VALUES(?,?,?)",
      randomUUID(),
      category,
      now(),
    );
  }
  approve(actor: string, id: string, expected: string, agree: boolean) {
    const { unit, revision } = this.current(actor, id, expected);
    requireThat(agree, "Agree to the exact score and rated status.");
    requireThat(
      ["pending", "correction_pending"].includes(unit.status),
      "This result is already resolved or under review.",
      409,
    );
    const roster = JSON.parse(revision.roster) as string[],
      participant = roster.find((p) => this.canonical(p) === actor);
    requireThat(participant, "You are not in this revision.", 403);
    if (!revision.retrospective) {
      const size = roster.length / 2,
        ownSide = roster.indexOf(participant) < size ? 0 : 1;
      const authorSide =
        roster.findIndex((p) => this.canonical(p) === revision.author) < size
          ? 0
          : 1;
      requireThat(
        ownSide !== authorSide,
        "An ordinary result needs approval from the opposite side.",
        403,
      );
    }
    this.db.run(
      "INSERT OR IGNORE INTO approvals VALUES(?,?,?,?)",
      expected,
      participant,
      actor,
      now(),
    );
    this.db.run(
      "UPDATE duties SET state='handled',handled_at=? WHERE revision_id=? AND participant=?",
      now(),
      expected,
      participant,
    );
    const approved = this.db
        .all("SELECT participant FROM approvals WHERE revision_id=?", expected)
        .map((a) => a.participant),
      size = roster.length / 2;
    const authorIndex = roster.findIndex(
        (p) => this.canonical(p) === revision.author,
      ),
      authorSide = authorIndex < size ? 0 : 1;
    const quorum = revision.retrospective
      ? roster.every((p) => approved.includes(p))
      : approved.some((p) => (roster.indexOf(p) < size ? 0 : 1) !== authorSide);
    if (quorum) {
      this.db.run(
        "UPDATE revisions SET state='confirmed' WHERE id=?",
        expected,
      );
      this.db.run(
        "UPDATE units SET accepted_revision=?,status='confirmed' WHERE id=?",
        expected,
        id,
      );
      this.db.run(
        "UPDATE duties SET state='cancelled' WHERE revision_id=? AND state='open'",
        expected,
      );
      this.enqueue(unit.category);
    }
    this.audit(actor, "result.approved", id, { revision: expected, quorum });
    return { id, status: quorum ? "confirmed" : unit.status };
  }
  correct(actor: string, id: string, input: any) {
    const { unit, revision } = this.current(actor, id, input.revisionId);
    requireThat(
      unit.status !== "disputed" && unit.status !== "void",
      "This result needs review first.",
      409,
    );
    requireThat(
      JSON.stringify(input.games) !== revision.games ||
        input.format !== revision.format,
      "Change the incorrect score or format before proposing a correction.",
    );
    this.db.run(
      "UPDATE duties SET state='cancelled' WHERE revision_id=? AND state='open'",
      revision.id,
    );
    const rev = this.createRevision(
      actor,
      unit,
      {
        ...input,
        roster: JSON.parse(revision.roster),
        playedAt: revision.played_at,
      },
      revision.number + 1,
    );
    this.audit(actor, "result.correction", id, {
      previous: revision.id,
      revision: rev,
    });
    return { id, revisionId: rev };
  }
  dispute(actor: string, id: string, input: any) {
    const { unit, revision } = this.current(actor, id, input.revisionId);
    requireThat(
      !this.db.get(
        "SELECT 1 FROM disputes WHERE unit_id=? AND actor=? AND state='open'",
        id,
        actor,
      ),
      "Your review request is already open.",
      409,
    );
    this.db.run(
      "INSERT INTO disputes(id,unit_id,revision_id,actor,reason,created_at) VALUES(?,?,?,?,?,?)",
      randomUUID(),
      id,
      revision.id,
      actor,
      input.reason,
      now(),
    );
    this.db.run("UPDATE units SET status='disputed' WHERE id=?", id);
    this.db.run(
      "UPDATE duties SET state='cancelled',handled_at=? WHERE revision_id=? AND state='open'",
      now(),
      revision.id,
    );
    this.audit(actor, "result.disputed", id, { revision: revision.id });
    return { id, status: "disputed" };
  }
  review(
    actor: string,
    disputeId: string,
    decision: "uphold" | "void",
    reason: string,
  ) {
    requireThat(
      this.user(actor).role === "reviewer",
      "Reviewer access required.",
      403,
    );
    const dispute = this.db.get(
      "SELECT * FROM disputes WHERE id=? AND state='open'",
      disputeId,
    );
    requireThat(dispute, "Review not found.", 404);
    const roster = this.db.all(
      "SELECT player_id FROM unit_players WHERE unit_id=?",
      dispute.unit_id,
    );
    requireThat(
      !roster.some((p) => this.canonical(p.player_id) === actor),
      "A player cannot review their own result.",
      403,
    );
    const unit = this.db.get(
      "SELECT * FROM units WHERE id=?",
      dispute.unit_id,
    )!;
    this.db.run(
      "UPDATE disputes SET state='resolved',decision=?,reviewer=? WHERE unit_id=? AND state='open'",
      decision + ": " + reason,
      actor,
      unit.id,
    );
    if (decision === "void")
      this.db.run(
        "UPDATE units SET status='void',accepted_revision=NULL WHERE id=?",
        unit.id,
      );
    else {
      const previous =
        unit.accepted_revision ||
        this.db.get(
          "SELECT id FROM revisions WHERE unit_id=? AND state='confirmed' ORDER BY number DESC LIMIT 1",
          unit.id,
        )?.id ||
        null;
      this.db.run(
        "UPDATE units SET accepted_revision=?,status=? WHERE id=?",
        previous,
        previous ? "confirmed" : "pending",
        unit.id,
      );
    }
    if (
      decision === "uphold" &&
      this.db.get(
        "SELECT state FROM revisions WHERE id=?",
        unit.current_revision,
      )?.state === "pending"
    ) {
      // Upholding cannot manufacture missing approvals. Reopen exact duties.
      this.db.run(
        "UPDATE duties SET state='open',delivered_at=NULL,due_at=NULL,handled_at=NULL WHERE revision_id=? AND state='cancelled'",
        unit.current_revision,
      );
    }
    this.enqueue(unit.category);
    this.audit(actor, "review.resolved", unit.id, { decision, reason });
    for (const p of roster)
      this.notification(
        p.player_id,
        "review",
        "Your review has a decision",
        reason,
        `review:${disputeId}:${p.player_id}`,
        unit.id,
      );
    return { id: unit.id };
  }
  friendActivity(actor: string, before?: string) {
    const friends = this.db
      .all(
        "SELECT a,b FROM connections WHERE (a=? OR b=?) AND status='accepted'",
        actor,
        actor,
      )
      .map((c) => (c.a === actor ? c.b : c.a))
      .filter((id) => !this.blocked(actor, id))
      .map((id) => this.player(id, actor));
    const aliases = [
      ...new Set(friends.flatMap((friend) => this.actorIds(friend.id))),
    ];
    if (!aliases.length) return { feed: [], next: null };
    const visible = `EXISTS(SELECT 1 FROM unit_players p WHERE p.unit_id=e.unit_id AND p.player_id IN (${aliases.map(() => "?").join(",")}))`;
    const cursor = before
      ? this.db.get(
          `SELECT e.* FROM rating_events e WHERE e.unit_id=? AND ${visible}`,
          before,
          ...aliases,
        )
      : null;
    requireThat(
      !before || cursor,
      "This activity has changed. Refresh your court before loading older matches.",
      404,
    );
    const rows = this.db.all(
      `SELECT e.*,u.status AS unit_status FROM rating_events e JOIN units u ON u.id=e.unit_id WHERE ${visible} ${cursor ? "AND (e.played_at<? OR (e.played_at=? AND e.unit_id<?))" : ""} ORDER BY e.played_at DESC,e.unit_id DESC LIMIT 21`,
      ...aliases,
      ...(cursor ? [cursor.played_at, cursor.played_at, cursor.unit_id] : []),
    );
    const given = new Map(
      rows.length
        ? this.db
            .all(
              `SELECT unit_id,revision_id,recipient,milestone,score FROM court_congratulations WHERE sender=? AND unit_id IN (${rows.map(() => "?").join(",")})`,
              actor,
              ...rows.map((r) => r.unit_id),
            )
            .map((r) => [`${r.unit_id}:${r.revision_id}:${r.recipient}`, r])
        : [],
    );
    return {
      feed: rows.slice(0, 20).flatMap((row) => {
        const changes = JSON.parse(row.changes);
        return friends.flatMap((friend) => {
          const change = changes[friend.id];
          if (!change) return [];
          const score = change.count >= 5 ? change.after : null;
          const delta = change.count > 5 ? change.delta : null;
          const milestone = milestoneFor(change),
            congratulation = given.get(
              `${row.unit_id}:${row.revision_id}:${friend.id}`,
            );
          return [
            {
              id: `${row.unit_id}:${row.revision_id}:${friend.id}:${score ?? "placement"}:${delta ?? "hidden"}:${Number(change.won)}`,
              unitId: row.unit_id,
              revisionId: row.revision_id,
              player: friend,
              category: row.category,
              playedAt: row.played_at,
              score,
              delta,
              milestone,
              canCongratulate: row.unit_status === "rated" && !!milestone,
              congratulated:
                row.unit_status === "rated" &&
                !!congratulation &&
                congratulation.milestone === milestone &&
                congratulation.score === score,
              league: change.count >= 5 ? leagueFor(change.after).name : null,
              won: change.won,
              shared: !!changes[actor],
            },
          ];
        });
      }),
      next: rows.length > 20 ? rows[19].unit_id : null,
    };
  }
  unitView(
    actor: string,
    unit: Row,
    context?: {
      revisions: Map<string, Row>;
      approvals: Map<string, string[]>;
      events: Map<string, Row>;
      player: (p: string) => any;
      canonical: (p: string) => string;
    },
  ) {
    const revision = context
      ? context.revisions.get(unit.current_revision)!
      : this.db.get(
          "SELECT * FROM revisions WHERE id=?",
          unit.current_revision,
        )!;
    const roster = JSON.parse(revision.roster) as string[],
      approvals = context
        ? context.approvals.get(revision.id) || []
        : this.db
            .all(
              "SELECT participant FROM approvals WHERE revision_id=?",
              revision.id,
            )
            .map((a) => a.participant);
    const event = context
      ? context.events.get(unit.id)
      : this.db.get("SELECT * FROM rating_events WHERE unit_id=?", unit.id);
    const ownChange = event ? JSON.parse(event.changes)[actor] : null;
    return {
      id: unit.id,
      category: unit.category,
      status: unit.status,
      revisionId: revision.id,
      revisionNumber: revision.number,
      format: revision.format,
      games: JSON.parse(revision.games),
      playedAt: revision.played_at,
      players: roster.map((p) =>
        context ? context.player(p) : this.player(p, actor),
      ),
      author: context
        ? context.player(revision.author)
        : this.player(revision.author, actor),
      authorParticipant: roster.find(
        (p) =>
          (context ? context.canonical(p) : this.canonical(p)) ===
          revision.author,
      ),
      retrospective: !!revision.retrospective,
      approvals,
      ownParticipant: roster.find(
        (p) => (context ? context.canonical(p) : this.canonical(p)) === actor,
      ),
      ratingChanges: ownChange?.count >= 5 ? { [actor]: ownChange } : null,
      ownProgress: ownChange
        ? { count: ownChange.count, won: ownChange.won }
        : null,
      publishedRevisionId: unit.published_revision,
      publishedResult:
        unit.published_revision && unit.published_revision !== revision.id
          ? (() => {
              const published = context
                ? context.revisions.get(unit.published_revision)!
                : this.db.get(
                    "SELECT games,format,played_at FROM revisions WHERE id=?",
                    unit.published_revision,
                  )!;
              return {
                games: JSON.parse(published.games),
                format: published.format,
                playedAt: published.played_at,
              };
            })()
          : null,
      scopeId: unit.scope_id,
    };
  }
  results(actor: string, limit = 100) {
    const aliases = this.actorIds(actor);
    return this.projectUnits(
      actor,
      this.db.all(
        `SELECT DISTINCT u.* FROM units u JOIN unit_players p ON p.unit_id=u.id WHERE p.player_id IN (${aliases.map(() => "?").join(",")}) ORDER BY u.created_at DESC LIMIT ?`,
        ...aliases,
        limit,
      ),
    );
  }
  projectUnits(actor: string, units: Row[]) {
    const revisions = new Map<string, Row>(),
      events = new Map<string, Row>(),
      approvals = new Map<string, string[]>(),
      people = new Map<string, any>(),
      aliases = new Map<string, string>();
    const load = (table: string, field: string, ids: string[]) => {
      const rows: Row[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        rows.push(
          ...this.db.all(
            `SELECT * FROM ${table} WHERE ${field} IN (${batch.map(() => "?").join(",")})`,
            ...batch,
          ),
        );
      }
      return rows;
    };
    const revisionIds = [
      ...new Set(
        units.flatMap((u) =>
          [u.current_revision, u.published_revision].filter(Boolean),
        ),
      ),
    ];
    for (const row of load("revisions", "id", revisionIds))
      revisions.set(row.id, row);
    for (const row of load("approvals", "revision_id", revisionIds)) {
      if (!approvals.has(row.revision_id)) approvals.set(row.revision_id, []);
      approvals.get(row.revision_id)!.push(row.participant);
    }
    for (const row of load(
      "rating_events",
      "unit_id",
      units.map((u) => u.id),
    ))
      events.set(row.unit_id, row);
    const context = {
      revisions,
      events,
      approvals,
      player: (p: string) => {
        if (!people.has(p)) people.set(p, this.player(p, actor));
        return people.get(p);
      },
      canonical: (p: string) => {
        if (!aliases.has(p)) aliases.set(p, this.canonical(p));
        return aliases.get(p)!;
      },
    };
    return units.map((u) => this.unitView(actor, u, context));
  }
  reliability(actor: string) {
    const aliases = this.actorIds(actor),
      cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const rows = this.db.all(
      `SELECT state,handled_at,due_at FROM duties WHERE participant IN (${aliases.map(() => "?").join(",")}) AND delivered_at IS NOT NULL AND state<>'cancelled' AND due_at>? AND (due_at<? OR handled_at IS NOT NULL) ORDER BY due_at DESC`,
      ...aliases,
      cutoff,
      now(),
    );
    const handled = rows.filter(
      (r) => r.handled_at && r.handled_at <= r.due_at,
    ).length;
    let consecutive = 0;
    for (const row of rows) {
      if (row.state === "unhandled") consecutive++;
      else break;
    }
    return {
      handled,
      total: rows.length,
      windowDays: 90,
      consecutiveUnresolved: consecutive,
    };
  }
  localTitle(actor: string, category: Category) {
    const player = this.user(actor),
      own = this.rating(actor, category);
    if (
      !this.validated ||
      !player.local_opt_in ||
      !player.locality_key ||
      player.district === "Other" ||
      own.status !== "Established"
    )
      return null;
    const population = this.db.all(
      "SELECT id FROM users WHERE locality_key=? AND local_opt_in=1 AND guest=0 AND deleted=0 ORDER BY id LIMIT 129",
      player.locality_key,
    );
    if (population.length > 128) return null;
    const eligible = population
      .map((p) => ({ id: p.id, r: this.rating(p.id, category) }))
      .filter(
        (p) =>
          p.r.status === "Established" &&
          p.r.comparisonClass === own.comparisonClass,
      );
    if (
      eligible.length < 20 ||
      eligible.some((p) => (p.r.score || 0) > (own.score || 0))
    )
      return null;
    return {
      label: "Top-rated SHUTTL player",
      pool:
        localityLabel(player.country, player.city, player.district) +
        " · supported " +
        category +
        " pool",
      eligible: eligible.length,
      category,
      asOf: now(),
      shared: eligible.filter((p) => p.r.score === own.score).length > 1,
    };
  }
  scopes(actor: string) {
    const aliases = this.actorIds(actor);
    return this.db
      .all(
        `SELECT * FROM scopes s WHERE EXISTS(SELECT 1 FROM json_each(s.roster) p WHERE p.value IN (${aliases.map(() => "?").join(",")})) ORDER BY created_at DESC LIMIT 50`,
        ...aliases,
      )
      .map((s) => {
        const roster = JSON.parse(s.roster) as string[],
          consent = this.db.all("SELECT * FROM consent WHERE scope_id=?", s.id);
        return {
          id: s.id,
          category: s.category,
          format: s.format,
          starts: s.starts,
          ends: s.ends,
          players: roster.map((p) => this.player(p, actor)),
          accepted: consent
            .filter((c) => !c.revoked_at)
            .map((c) => c.participant),
          revoked: consent
            .filter((c) => c.revoked_at)
            .map((c) => c.participant),
          ownParticipant: roster.find((p) => this.canonical(p) === actor),
        };
      });
  }
  inbox(actor: string) {
    const aliases = this.actorIds(actor),
      timestamp = now(),
      due = new Date(Date.now() + 7 * 86400000).toISOString();
    const pending = this.pendingResults(actor);
    for (const p of aliases)
      for (const result of pending)
        if (["pending", "correction_pending"].includes(result.status))
          this.db.run(
            "UPDATE duties SET delivered_at=?,due_at=? WHERE participant=? AND revision_id=? AND state='open' AND delivered_at IS NULL",
            timestamp,
            due,
            p,
            result.revisionId,
          );
    return {
      notifications: this.db.all(
        "SELECT id,kind,title,detail,unit_id AS unitId,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        actor,
      ),
      pending,
      agreements: this.scopes(actor),
      friendRequests: this.db
        .all(
          "SELECT * FROM connections WHERE (a=? OR b=?) AND status='pending' AND requested_by<>?",
          actor,
          actor,
          actor,
        )
        .map((c) => this.player(c.a === actor ? c.b : c.a, actor)),
      circleInvites: this.db.all(
        "SELECT c.id,c.name FROM circle_members m JOIN circles c ON c.id=m.circle_id WHERE m.user_id=? AND m.status='invited'",
        actor,
      ),
      claims: this.db
        .all(
          "SELECT g.token,g.guest_id,g.claimant FROM guest_claims g WHERE g.author=? AND g.state='requested'",
          actor,
        )
        .map((c) => ({
          token: c.token,
          guest: this.player(c.guest_id, actor),
          claimant: this.player(c.claimant, actor),
        })),
      reliability: this.db.all(
        `SELECT state,handled_at,due_at FROM duties WHERE participant IN (${aliases.map(() => "?").join(",")}) AND delivered_at IS NOT NULL AND (handled_at>? OR due_at>?) ORDER BY COALESCE(handled_at,due_at) DESC`,
        ...aliases,
        new Date(Date.now() - 90 * 86400000).toISOString(),
        new Date(Date.now() - 90 * 86400000).toISOString(),
      ),
    };
  }
  pendingResults(actor: string) {
    const aliases = this.actorIds(actor);
    const rows = this.db.all(
      `SELECT DISTINCT u.* FROM units u JOIN unit_players p ON p.unit_id=u.id WHERE p.player_id IN (${aliases.map(() => "?").join(",")}) AND u.status IN ('pending','correction_pending','confirmed','disputed') ORDER BY u.created_at DESC`,
      ...aliases,
    );
    return this.projectUnits(actor, rows);
  }
  rebuild(category: Category) {
    const readRows = () =>
      this.db.all(
        "SELECT u.*,r.id AS rid,r.roster,r.games,r.format,r.played_at FROM units u JOIN revisions r ON r.id=CASE WHEN u.status='disputed' THEN u.published_revision ELSE u.accepted_revision END WHERE u.category=? AND u.status<>'void' ORDER BY r.played_at,u.id",
        category,
      );
    const selected = readRows();
    const aliases = new Map<string, string>();
    for (const row of selected)
      for (const p of JSON.parse(row.roster))
        if (!aliases.has(p)) aliases.set(p, this.canonical(p));
    const signature = (rows: Row[], resolve: (p: string) => string) =>
      hash(
        JSON.stringify(
          rows.map((u) => [
            u.id,
            u.rid,
            u.status,
            JSON.parse(u.roster).map(resolve),
          ]),
        ),
      );
    const expected = signature(selected, (p) => aliases.get(p)!);
    const ratings = new Map<string, Rating>(),
      partners = new Map<string, Set<string>>(),
      events: any[] = [],
      rosters: string[][] = [];
    requireThat(
      selected.length <= 50000,
      "This ledger needs an offline replay worker before publication.",
      503,
    );
    for (const unit of selected) {
      const roster = (JSON.parse(unit.roster) as string[]).map((p) =>
        aliases.get(p)!,
      );
      requireThat(
        new Set(roster).size === roster.length,
        "Identity review is required for this roster.",
        409,
      );
      const before = roster.map((p) => ratings.get(p) || initialRating()),
        winner = validateGames(unit.format, JSON.parse(unit.games)),
        after = updateRatings(before, category, winner, unit.played_at);
      const changes: Record<string, any> = {};
      roster.forEach((p, i) => {
        ratings.set(p, after[i]);
        changes[p] = {
          before: publicRating(before[i].mu),
          after: publicRating(after[i].mu),
          delta: publicRating(after[i].mu) - publicRating(before[i].mu),
          count: after[i].count,
          peakBefore:
            before[i].count >= 5 ? publicRating(before[i].peak) : null,
          peakAfter: after[i].count >= 5 ? publicRating(after[i].peak) : null,
          won: (i < roster.length / 2 ? 0 : 1) === winner,
        };
        if (roster.length === 4) {
          const partner = roster[i % 2 === 0 ? i + 1 : i - 1];
          if (!partners.has(p)) partners.set(p, new Set());
          partners.get(p)!.add(partner);
        }
        changes[p].partnerCount = partners.get(p)?.size || 0;
      });
      rosters.push(roster);
      events.push({ unit, changes });
    }
    // Partition actual playing components before exact bounded checks.
    const parent = new Map<string, string>();
    const find = (p: string): string => {
      if (!parent.has(p)) parent.set(p, p);
      let root = p;
      while (parent.get(root) !== root) root = parent.get(root)!;
      while (parent.get(p) !== p) {
        const next = parent.get(p)!;
        parent.set(p, root);
        p = next;
      }
      return root;
    };
    for (const roster of rosters)
      for (const p of roster) parent.set(find(p), find(roster[0]));
    const components = new Map<string, string[][]>();
    for (const roster of rosters) {
      const key = find(roster[0]);
      if (!components.has(key)) components.set(key, []);
      components.get(key)!.push(roster);
    }
    const classes = new Map<string, string>();
    for (const [component, rows] of components) {
      const result = comparisonClasses(rows);
      for (const [p, c] of result.classes)
        classes.set(p, category + ":" + component + ":" + c);
    }
    const version =
      (this.db.get("SELECT version FROM snapshots WHERE category=?", category)
        ?.version || 0) + 1;
    this.db.transaction(() => {
      const freshAliases = new Map<string, string>();
      if (
        signature(readRows(), (p) => {
          if (!freshAliases.has(p)) freshAliases.set(p, this.canonical(p));
          return freshAliases.get(p)!;
        }) !== expected
      )
        throw new Problem(
          409,
          "Playing evidence changed during replay; retrying the fresh ledger.",
          "replay_changed",
        );
      const previous = new Map(
        this.db
          .all("SELECT * FROM rating_events WHERE category=?", category)
          .map((e) => [e.unit_id, e]),
      );
      const oldRatings = new Map(
        this.db
          .all("SELECT * FROM ratings WHERE category=?", category)
          .map((r) => [r.user_id, r]),
      );
      this.db.run("DELETE FROM ratings WHERE category=?", category);
      this.db.run("DELETE FROM rating_events WHERE category=?", category);
      this.db.run(
        "UPDATE units SET published_revision=NULL WHERE category=? AND status='void'",
        category,
      );
      for (const [id, r] of ratings)
        this.db.run(
          "INSERT INTO ratings VALUES(?,?,?,?,?,?,?,?,?,?)",
          id,
          category,
          r.mu,
          r.variance,
          r.count,
          r.peak,
          r.lastPlayed,
          JSON.stringify([...(partners.get(id) || [])]),
          classes.get(id) || null,
          version,
        );
      for (const { unit, changes } of events) {
        this.db.run(
          "INSERT INTO rating_events VALUES(?,?,?,?,?,?,?)",
          unit.id,
          unit.rid,
          category,
          unit.played_at,
          JSON.stringify(changes),
          version,
          MODEL_VERSION,
        );
        if (unit.status !== "disputed")
          this.db.run(
            "UPDATE units SET published_revision=?,status=CASE WHEN current_revision=? THEN 'rated' ELSE 'correction_pending' END WHERE id=?",
            unit.rid,
            unit.rid,
            unit.id,
          );
        if (
          !previous.has(unit.id) ||
          previous.get(unit.id)!.revision_id !== unit.rid
        )
          for (const [id, change] of Object.entries(changes) as [
            string,
            any,
          ][]) {
            const correction = previous.has(unit.id);
            this.notification(
              id,
              correction ? "correction" : "rating",
              correction
                ? "Your history has been corrected"
                : change.count === 5
                  ? "Your rating is ready"
                  : change.count < 5
                    ? "Placement result confirmed"
                    : "Your rating has updated",
              change.count < 5
                ? `${change.count} of 5 ${category.toLowerCase()} results confirmed`
                : change.count === 5
                  ? `${category} · starting estimate ${change.after}. Future changes compare with this visible starting point.`
                  : `${category} · ${change.after} · ${change.delta >= 0 ? "+" : ""}${change.delta}`,
              `rated:${unit.id}:${unit.rid}:${id}`,
              unit.id,
            );
          }
      }
      this.db.run(
        "INSERT INTO snapshots VALUES(?,?) ON CONFLICT(category) DO UPDATE SET version=excluded.version",
        category,
        version,
      );
      const fresh = events.filter((e) => !previous.has(e.unit.id));
      const maxBefore = Math.max(
        0,
        ...[...previous.values()].map((e) => Date.parse(e.played_at)),
      );
      if (
        fresh.length > 0 &&
        events.length === previous.size + fresh.length &&
        fresh.every((e) => Date.parse(e.unit.played_at) >= maxBefore) &&
        events.every(
          (e) =>
            !previous.has(e.unit.id) ||
            previous.get(e.unit.id)!.revision_id === e.unit.rid,
        )
      ) {
        for (const connection of this.db.all(
          "SELECT a,b FROM connections WHERE status='accepted'",
        ))
          for (const [owner, friend] of [
            [connection.a, connection.b],
            [connection.b, connection.a],
          ]) {
            const old = oldRatings.get(owner),
              oldFriend = oldRatings.get(friend),
              current = this.rating(owner, category),
              peer = this.rating(friend, category);
            if (
              !old ||
              !oldFriend ||
              old.count < 5 ||
              oldFriend.count < 5 ||
              !current.comparisonClass ||
              current.comparisonClass !== peer.comparisonClass ||
              !old.comparison_class ||
              old.comparison_class !== oldFriend.comparison_class ||
              current.status === "Pair-linked" ||
              peer.status === "Pair-linked" ||
              (category !== "Singles" &&
                (JSON.parse(old.partners).length < 2 ||
                  JSON.parse(oldFriend.partners).length < 2)) ||
              !fresh.some((e) => e.changes[friend])
            )
              continue;
            const leadResult = fresh.filter((e) => e.changes[friend]).at(-1)!;
            if (
              publicRating(old.mu) >= publicRating(oldFriend.mu) &&
              current.score !== null &&
              peer.score !== null &&
              current.score < peer.score &&
              !this.blocked(owner, friend)
            )
              this.notification(
                owner,
                "comparison",
                `${this.player(friend, owner).name}’s ${category.toLowerCase()} estimate passed yours`,
                `${peer.score - current.score} rating points apart after a confirmed result.`,
                `lead:${leadResult.unit.rid}:${owner}:${friend}`,
                leadResult.unit.id,
              );
          }
      }
      this.db.run(
        "UPDATE jobs SET status='done',error=NULL WHERE category=? AND status IN ('queued','running')",
        category,
      );
      this.audit(null, "rating.snapshot", category, {
        version,
        units: events.length,
        model: MODEL_VERSION,
      });
    });
    return { category, version, units: events.length };
  }
  work() {
    const job = this.db.get(
      "SELECT * FROM jobs WHERE status IN ('queued','running') AND attempts<3 ORDER BY created_at LIMIT 1",
    );
    if (!job) return;
    this.db.run(
      "UPDATE jobs SET status='running',attempts=attempts+1 WHERE id=?",
      job.id,
    );
    try {
      this.rebuild(job.category);
    } catch (error) {
      if (error instanceof Problem && error.code === "replay_changed") {
        this.db.run(
          "UPDATE jobs SET status='queued',attempts=max(0,attempts-1),error=NULL WHERE id=?",
          job.id,
        );
        return;
      }
      this.db.run(
        "UPDATE jobs SET status='queued',error=? WHERE id=?",
        error instanceof Error ? error.message : "Rating processing failed",
        job.id,
      );
    }
  }
}
