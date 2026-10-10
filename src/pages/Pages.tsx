import { useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  ArrowUpRight,
  UsersRound,
  Trophy,
  Copy,
  Download,
  Share2,
  ShieldCheck,
  ChevronRight,
  Check,
} from "lucide-react";
import { api, dateLabel, errorMessage } from "../api.ts";
import {
  CATEGORIES,
  FORMATS,
  LEAGUES,
  type Category,
  type Player,
  type PublicRating,
} from "../domain.ts";
import {
  Avatar,
  CategoryTabs,
  Empty,
  Gem,
  InlineError,
  Modal,
  PageHeading,
  SectionHeading,
  Spinner,
  ScoreGames,
} from "../components/UI.tsx";
import { PlayerLookup, RecoveryCode } from "../components/Flows.tsx";
import { RatingCard } from "./Home.tsx";
const statusLabels: Record<string, string> = {
  rated: "Rating published",
  pending: "Awaiting approval",
  correction_pending: "Correction awaiting approval",
  confirmed: "Rating processing",
  disputed: "Under review",
  void: "Unrated",
};
export function ResultList({
  results,
  open,
}: {
  results: any[];
  open: (id: string) => void;
}) {
  return (
    <div className="list-stack">
      {results.map((r) => (
        <button className="result-card" key={r.id} onClick={() => open(r.id)}>
          <div className="result-top">
            <span>
              {r.category} · {dateLabel(r.playedAt)}
            </span>
            <span className="pill">{statusLabels[r.status] || r.status}</span>
          </div>
          <h3>
            {r.players
              .slice(0, r.players.length / 2)
              .map((p: Player) => p.name)
              .join(" + ")}{" "}
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>vs</span>{" "}
            {r.players
              .slice(r.players.length / 2)
              .map((p: Player) => p.name)
              .join(" + ")}
          </h3>
          <div className="result-games">
            {r.games.map((g: number[], i: number) => (
              <span key={i}>
                {g[0]}–{g[1]}
              </span>
            ))}
          </div>
          <div className="result-bottom">
            <span>
              {FORMATS[r.format as keyof typeof FORMATS].label} · Revision{" "}
              {r.revisionNumber}
            </span>
            <ArrowUpRight size={15} />
          </div>
        </button>
      ))}
    </div>
  );
}
export function FriendsPage({
  data,
  refresh,
  add,
  notify,
}: {
  data: any;
  refresh: () => void;
  add: () => void;
  notify: (message: string) => void;
}) {
  const [category, setCategory] = useState<Category>("Doubles"),
    [circle, setCircle] = useState<any>(null),
    [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [lookup, setLookup] = useState(false),
    [error, setError] = useState("");
  const loadCircle = async (id: string) => {
    try {
      setCircle(await api("/circles/" + id));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const response = await api("/circles", { name });
      setCreating(false);
      setName("");
      refresh();
      loadCircle(response.id);
      notify("Your comparison circle is ready.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const players = circle
    ? circle.members.filter((p: Player) => p.id !== data.me.id)
    : data.friends;
  return (
    <>
      <PageHeading
        eyebrow="REAL PLAYERS. SHARED PROGRESS."
        title={circle ? circle.name : "Your circle"}
      >
        <button
          className="button"
          onClick={circle ? () => setLookup(true) : add}
        >
          <Plus size={16} />
          Add a player
        </button>
      </PageHeading>
      <p className="page-subtitle">
        Compare your own progress with the people you play with. Developing
        estimates help start the conversation; they are not certified skill
        levels.
      </p>
      {circle && (
        <button className="text-button" onClick={() => setCircle(null)}>
          ← Back to your friends
        </button>
      )}
      <CategoryTabs value={category} onChange={setCategory} />
      <InlineError message={error} />
      <div className="page-grid">
        <section className="panel">
          <SectionHeading title={circle ? "Circle members" : "Your players"} />
          {players.length ? (
            players.map((p: any) => {
              const r = p.ratings.find(
                (r: PublicRating) => r.category === category,
              );
              return (
                <div key={p.id} className="ranking-row">
                  <Avatar player={p} />
                  <div className="ranking-person">
                    <strong>{p.name}</strong>
                    <small>
                      @{p.username} · {r.status}
                    </small>
                  </div>
                  <Gem league={r.league} />
                  <strong className="ranking-number">{r.score ?? "—"}</strong>
                  {!circle && (
                    <button
                      className="text-button danger"
                      onClick={async () => {
                        try {
                          await api("/friends/" + p.id, {}, "DELETE");
                          refresh();
                          notify(
                            "Connection removed. Your valid match history stays.",
                          );
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <Empty
              title="Good rivals make better games"
              action="Find a player"
              onClick={add}
            >
              Start with someone you already share a court with.
            </Empty>
          )}
          <p className="form-help">
            Numbers reveal after five confirmed results in this category. Fixed
            partnerships can leave individual comparisons unclear.
          </p>
        </section>
        <div>
          <section className="panel">
            <SectionHeading
              title="Existing groups"
              action="Create a circle"
              onClick={() => setCreating(true)}
            />
            <p className="panel-intro">
              A clearer level conversation for your current group.
            </p>
            <div className="list-stack" style={{ marginTop: 15 }}>
              {data.circles.map((c: any) => (
                <button
                  key={c.id}
                  className="circle-tile"
                  onClick={() => loadCircle(c.id)}
                >
                  <span className="circle-icon">
                    <UsersRound size={22} />
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.members} accepted players</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
            {!data.circles.length && (
              <Empty
                title="Same group. A shared picture."
                action="Create your circle"
                onClick={() => setCreating(true)}
              >
                Use ratings alongside what you actually see on court.
              </Empty>
            )}
          </section>
          {circle && (
            <section className="panel settings-panel">
              <SectionHeading title="Circle membership" />
              {circle.owner === data.me.id && (
                <>
                  <div className="field">
                    <label htmlFor="next-owner">Transfer ownership</label>
                    <select
                      id="next-owner"
                      defaultValue=""
                      onChange={async (e) => {
                        if (!e.target.value) return;
                        try {
                          await api("/circles/" + circle.id + "/owner", {
                            playerId: e.target.value,
                          });
                          await loadCircle(circle.id);
                          notify("Circle ownership transferred.");
                        } catch (error) {
                          setError(errorMessage(error));
                        }
                      }}
                    >
                      <option value="">Choose an accepted member</option>
                      {circle.members
                        .filter((p: Player) => p.id !== data.me.id)
                        .map((p: Player) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
              <button
                className="text-button danger"
                onClick={async () => {
                  try {
                    await api(
                      "/circles/" + circle.id + "/membership",
                      {},
                      "DELETE",
                    );
                    setCircle(null);
                    refresh();
                    notify("You left this circle.");
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Leave this circle
              </button>
            </section>
          )}
        </div>
      </div>
      {creating && (
        <Modal title="A circle for your group" close={() => setCreating(false)}>
          <p className="form-help">
            Compare the players in an existing badminton group. This creates no
            games, bookings or tournaments.
          </p>
          <form onSubmit={create}>
            <div className="field">
              <label htmlFor="circle-name">Circle name</label>
              <input
                id="circle-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={3}
                maxLength={60}
                required
                placeholder="Tampines Tuesday crew"
              />
            </div>
            <InlineError message={error} />
            <button className="button block">
              Create comparison circle
              <Plus size={16} />
            </button>
          </form>
        </Modal>
      )}
      {lookup && circle && (
        <PlayerLookup
          invite={false}
          close={() => setLookup(false)}
          choose={async (p) => {
            try {
              await api("/circles/" + circle.id + "/invite", {
                playerId: p.id,
              });
              setLookup(false);
              notify("Invitation sent to their SHUTTL inbox.");
              refresh();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        />
      )}
    </>
  );
}
export function RankingsPage({
  data,
  category,
  setCategory,
}: {
  data: any;
  category: Category;
  setCategory: (category: Category) => void;
}) {
  const [circle, setCircle] = useState(""),
    [ranking, setRanking] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRanking(null);
    api("/rankings?category=" + category + (circle ? "&circle=" + circle : ""))
      .then((r) => {
        if (active) setRanking(r);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [category, circle, data.me.district, data.me.localOptIn]);
  return (
    <>
      <PageHeading eyebrow="A LEAD WORTH EARNING" title="Your local picture" />
      <p className="page-subtitle">
        Qualified tables compare players in a named SHUTTL pool. A title never
        claims to rank every resident or certify someone’s ability.
      </p>
      <CategoryTabs value={category} onChange={setCategory} />
      <div className="field" style={{ maxWidth: 400 }}>
        <label htmlFor="comparison-pool">Comparison pool</label>
        <select
          id="comparison-pool"
          value={circle}
          onChange={(e) => setCircle(e.target.value)}
        >
          <option value="">
            {data.me.district || "Your district"} · declared district
          </option>
          {data.circles.map((c: any) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <InlineError message={error} />
      {!ranking ? (
        <Spinner />
      ) : (
        <div className="page-grid">
          <section className="panel">
            <SectionHeading title={ranking.name} />
            <p className="form-help">
              {category} · {ranking.total} opted-in or accepted players ·{" "}
              {dateLabel(ranking.asOf)}
            </p>
            {ranking.crownAvailable ? (
              <>
                <div className="notice">
                  <strong>
                    {ranking.eligible} eligible players in your supported
                    comparison pool
                  </strong>
                  <p>
                    Ties share their position and any title. Only supported,
                    recent individual evidence qualifies.
                  </p>
                </div>
                {ranking.players.map((p: any) => (
                  <div className="ranking-row" key={p.id}>
                    <strong>{p.position}</strong>
                    <Avatar player={p} />
                    <div className="ranking-person">
                      <strong>
                        {p.name}
                        {p.id === data.me.id ? " · You" : ""}
                      </strong>
                      <small>
                        {p.top
                          ? "Top-rated in this named pool"
                          : p.rating.status}
                      </small>
                    </div>
                    <Gem league={p.rating.league} />
                    <strong className="ranking-number">{p.rating.score}</strong>
                  </div>
                ))}
              </>
            ) : (
              <Empty
                title={
                  ranking.needsDistrict
                    ? "Choose your local context"
                    : "Your local table is forming"
                }
              >
                Individual titles need enough supported, recent playing evidence
                and a validated comparison policy. No crown has been issued for
                this pool. Your friends and real results still count.
              </Empty>
            )}
          </section>
          <section className="panel">
            <SectionHeading title="Developing player estimates" />
            <p className="form-help">
              These estimates are shown without individual rank. Separate
              playing networks and fixed partners can leave comparisons
              unresolved.
            </p>
            {ranking.developing.length ? (
              ranking.developing.map((p: any) => (
                <div className="ranking-row" key={p.id}>
                  <Avatar player={p} />
                  <div className="ranking-person">
                    <strong>{p.name}</strong>
                    <small>
                      {p.rating.status} · {p.rating.partnerCount} partners
                    </small>
                  </div>
                  <strong className="ranking-number">{p.rating.score}</strong>
                </div>
              ))
            ) : (
              <Empty title="The first chapter is yours">
                Five confirmed results reveal an estimate in this category.
              </Empty>
            )}
          </section>
        </div>
      )}
    </>
  );
}
export function AgreementsPage({
  inbox,
  create,
  refresh,
  notify,
}: {
  inbox: any;
  create: () => void;
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const [error, setError] = useState("");
  async function act(scope: any, action: "accept" | "revoke") {
    try {
      await api("/scopes/" + scope.id + "/" + action, { agree: true });
      refresh();
      notify(
        action === "accept"
          ? "Your own rated consent is recorded."
          : "Future rated play under this agreement has stopped for you.",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeading eyebrow="EVERY PLAYER CHOOSES" title="Rated agreements">
        <button className="button" onClick={create}>
          <Plus size={16} />
          New agreement
        </button>
      </PageHeading>
      <p className="page-subtitle">
        Agree once for a session or up to 30 days with the same players,
        category and format. Each exact result still needs the right score
        approval.
      </p>
      <InlineError message={error} />
      <div className="list-stack">
        {inbox?.agreements.map((s: any) => {
          const accepted = s.accepted.includes(s.ownParticipant),
            revoked = s.revoked.includes(s.ownParticipant),
            expired = s.ends < new Date().toISOString();
          return (
            <section className="scope-card" key={s.id}>
              <div className="result-top">
                <span>
                  {s.category} ·{" "}
                  {FORMATS[s.format as keyof typeof FORMATS].label}
                </span>
                <span className="pill">
                  {expired
                    ? "Expired"
                    : revoked
                      ? "Revoked"
                      : s.accepted.length === s.players.length
                        ? "All players agreed"
                        : "Waiting for agreement"}
                </span>
              </div>
              <div className="scope-people">
                {s.players.map((p: Player) => (
                  <span
                    key={p.id}
                    className={
                      s.revoked.includes(p.id)
                        ? "revoked"
                        : s.accepted.includes(p.id)
                          ? "accepted"
                          : ""
                    }
                  >
                    {p.name}
                    {s.accepted.includes(p.id) ? " ✓" : ""}
                  </span>
                ))}
              </div>
              <p>
                {dateLabel(s.starts)}–{dateLabel(s.ends)} · {s.accepted.length}{" "}
                of {s.players.length} currently agreed
              </p>
              {!expired &&
                !revoked &&
                (accepted ? (
                  <button
                    className="button secondary"
                    onClick={() => act(s, "revoke")}
                  >
                    Stop future rated play
                  </button>
                ) : (
                  <button className="button" onClick={() => act(s, "accept")}>
                    I agree to this exact scope
                    <Check size={15} />
                  </button>
                ))}
              <p>
                Changed people, category or format require a new agreement.
                Silence never starts rated play.
              </p>
            </section>
          );
        })}
      </div>
      {!inbox?.agreements.length && (
        <Empty
          title="Choose before you play"
          action="Create an agreement"
          onClick={create}
        >
          Everyone opts in separately. Existing covered matches remain recorded
          when you stop future rated play.
        </Empty>
      )}
    </>
  );
}
export function InboxPage({
  inbox,
  refresh,
  open,
  notify,
}: {
  inbox: any;
  refresh: () => void;
  open: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [agree, setAgree] = useState(false);
  if (!inbox) return <Spinner />;
  const eligible = inbox.pending
    .filter((r: any) => {
      const size = r.players.length / 2,
        own = r.players.findIndex((p: Player) => p.id === r.ownParticipant),
        author = r.players.findIndex(
          (p: Player) => p.id === (r.authorParticipant || r.author.id),
        );
      return (
        ["pending", "correction_pending"].includes(r.status) &&
        !r.approvals.includes(r.ownParticipant) &&
        (r.retrospective || own < size !== author < size)
      );
    })
    .slice(0, 20);
  async function batch() {
    try {
      await api("/results/batch-approve", {
        agree: true,
        results: eligible
          .filter((r: any) => selected.includes(r.id))
          .map((r: any) => ({ id: r.id, revisionId: r.revisionId })),
      });
      setSelected([]);
      setAgree(false);
      refresh();
      notify("The selected exact approvals are recorded.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeading eyebrow="REAL UPDATES. NOTHING INVENTED." title="Your inbox">
        <button
          className="text-button"
          onClick={async () => {
            await api("/notifications/read", {});
            refresh();
          }}
        >
          Mark updates read
          <Check size={15} />
        </button>
      </PageHeading>
      <InlineError message={error} />
      <div className="page-grid">
        <div>
          <SectionHeading title="Results to review" />
          {eligible.length > 1 && (
            <p className="form-help">
              Read each set of players and every score. You can approve only the
              exact selected revisions.
            </p>
          )}
          {eligible.map((r: any) => (
            <div key={r.id} className="notice neutral">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id),
                    )
                  }
                />
                <span>
                  <strong>
                    {r.players
                      .slice(0, r.players.length / 2)
                      .map((p: Player) => p.name)
                      .join(" + ")}{" "}
                    vs{" "}
                    {r.players
                      .slice(r.players.length / 2)
                      .map((p: Player) => p.name)
                      .join(" + ")}
                  </strong>
                  {r.category} ·{" "}
                  {FORMATS[r.format as keyof typeof FORMATS].label} ·{" "}
                  {dateLabel(r.playedAt)}
                  <br />
                  Exact games:{" "}
                  {r.games.map((g: number[]) => g.join("–")).join(" / ")} ·
                  Revision {r.revisionNumber}
                </span>
              </label>
              <button className="text-button" onClick={() => open(r.id)}>
                Open this exact result
                <ArrowUpRight size={15} />
              </button>
            </div>
          ))}
          {selected.length > 0 && (
            <div className="notice">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>
                  I read every selected score and agree to its exact revision
                  and rated status.
                </span>
              </label>
              <button
                className="button block"
                disabled={!agree}
                onClick={batch}
              >
                Approve {selected.length} exact{" "}
                {selected.length === 1 ? "result" : "results"}
              </button>
            </div>
          )}
          <ResultList results={inbox.pending} open={open} />
          {!inbox.pending.length && (
            <Empty title="No result needs chasing">
              Your confirmed history is here whenever you need it.
            </Empty>
          )}
          {inbox.claims.length > 0 && (
            <section className="panel settings-panel">
              <SectionHeading title="Verify invited players" />
              {inbox.claims.map((c: any) => (
                <div className="notice neutral" key={c.token}>
                  <strong>
                    {c.claimant.name} wants to claim {c.guest.name}
                  </strong>
                  <p>
                    Only verify if you know this is the person who played.
                    Verification alone does not approve a score.
                  </p>
                  <div className="modal-actions">
                    <button
                      className="button secondary"
                      onClick={async () => {
                        await api("/guest-claims/" + c.token + "/verify", {
                          accept: false,
                        });
                        refresh();
                      }}
                    >
                      Wrong person
                    </button>
                    <button
                      className="button"
                      onClick={async () => {
                        try {
                          await api("/guest-claims/" + c.token + "/verify", {
                            accept: true,
                          });
                          refresh();
                          notify(
                            "Identity verified. The player still approves each exact result.",
                          );
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      I know this player
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
        <div>
          <section className="panel">
            <SectionHeading title="Circle invitations" />
            {inbox.friendRequests.map((p: Player) => (
              <div className="ranking-row" key={p.id}>
                <Avatar player={p} />
                <div className="ranking-person">
                  <strong>{p.name}</strong>
                  <small>Wants to compare with you</small>
                </div>
                <button
                  className="button secondary"
                  onClick={async () => {
                    await api("/friends/" + p.id + "/accept", {});
                    refresh();
                  }}
                >
                  Accept
                </button>
              </div>
            ))}
            {inbox.circleInvites.map((c: any) => (
              <div className="ranking-row" key={c.id}>
                <div className="ranking-person">
                  <strong>{c.name}</strong>
                  <small>Existing-group comparison</small>
                </div>
                <button
                  className="button secondary"
                  onClick={async () => {
                    await api("/circles/" + c.id + "/accept", {});
                    refresh();
                  }}
                >
                  Join
                </button>
              </div>
            ))}
            {!inbox.friendRequests.length && !inbox.circleInvites.length && (
              <p className="form-help">No new invitations.</p>
            )}
          </section>
          <section className="panel settings-panel">
            <SectionHeading title="Recent updates" />
            {inbox.notifications.map((n: any) => (
              <div
                key={n.id}
                className={"notification " + (!n.readAt ? "unread" : "")}
              >
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.detail}</p>
                  <small>{dateLabel(n.createdAt)}</small>
                  {n.unitId && (
                    <button
                      className="text-button"
                      onClick={() => open(n.unitId)}
                    >
                      View result
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!inbox.notifications.length && (
              <p className="form-help">
                Updates appear when something actually happens in your circle.
              </p>
            )}
          </section>
          <p className="form-help">
            Your response record stays private. Corrections, disputes and
            cancelled unnecessary requests do not create a penalty to your
            playing rating.
          </p>
        </div>
      </div>
    </>
  );
}
const DISTRICTS = [
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
];
export function ProfilePage({
  data,
  refresh,
  open,
  share,
  notify,
  logout,
}: {
  data: any;
  refresh: () => void;
  open: (id: string) => void;
  share: () => void;
  notify: (message: string) => void;
  logout: () => void;
}) {
  const [form, setForm] = useState({ ...data.me }),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [blocking, setBlocking] = useState(false),
    [blocks, setBlocks] = useState<Player[]>([]),
    [shares, setShares] = useState<any[]>([]),
    [category, setCategory] = useState<Category>("Doubles"),
    [reliability, setReliability] = useState<any>(null),
    [recoveryModal, setRecoveryModal] = useState(false),
    [recoveryPassword, setRecoveryPassword] = useState(""),
    [newRecovery, setNewRecovery] = useState("");
  useEffect(() => {
    api("/account/reliability")
      .then(setReliability)
      .catch(() => {});
  }, [data.me.id]);
  useEffect(() => {
    setForm({ ...data.me });
  }, [data.me.id]);
  useEffect(() => {
    api("/blocks")
      .then((d) => setBlocks(d.players))
      .catch(() => {});
    api("/my-shares")
      .then((d) => setShares(d.shares))
      .catch(() => {});
  }, [data.me]);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const {
        name,
        district,
        publicName,
        publicDistrict,
        publicHistory,
        discoverable,
        localOptIn,
        breakMode,
        timezone,
        goals,
      } = form;
      await api(
        "/profile",
        {
          name,
          district,
          publicName,
          publicDistrict,
          publicHistory,
          discoverable,
          localOptIn,
          breakMode,
          timezone,
          goals,
        },
        "PATCH",
      );
      refresh();
      notify("Your player preferences are saved.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const toggles: [string, string, string][] = [
    [
      "publicName",
      "Public display name",
      "Accepted friends already see your display name. Other players see your username unless you choose this.",
    ],
    [
      "publicDistrict",
      "Public declared district",
      "Share only your selected district, never precise location.",
    ],
    [
      "publicHistory",
      "Public match summaries",
      "Allow your own summaries to be shared. Other people’s private details stay protected.",
    ],
    [
      "discoverable",
      "Discoverable by username",
      "Let other signed-in players find your public player identity.",
    ],
    [
      "localOptIn",
      "Join your declared local pool",
      "Allow your rating estimate to appear in your district’s comparison pool. Titles need qualified evidence.",
    ],
    [
      "breakMode",
      "Take a break",
      "Pause comparison prompts. Your playing rating does not fall just because you take time away.",
    ],
  ];
  return (
    <>
      <PageHeading eyebrow="YOUR GAME. YOUR IDENTITY." title="Player passport">
        <button className="button secondary" onClick={share}>
          <Share2 size={16} />
          Share my progress
        </button>
      </PageHeading>
      <div className="page-grid">
        <div>
          <section className="panel profile-card">
            <div className="profile-identity">
              <Avatar player={data.me} />
              <div>
                <h2>{data.me.name}</h2>
                <p>
                  @{data.me.username}
                  {data.me.district
                    ? " · " + data.me.district + " (declared)"
                    : ""}
                </p>
              </div>
            </div>
            {data.me.ratings.map((r: PublicRating) => (
              <div className="profile-rating-line" key={r.category}>
                <Gem league={r.league} size={30} />
                <div>
                  <strong>{r.category}</strong>
                  <small>
                    {r.status} · {r.count} confirmed results
                  </small>
                </div>
                <b>{r.score ?? "—"}</b>
              </div>
            ))}
            <p className="form-help">
              Five results reveal a developing estimate. Fixed partners,
              disconnected circles and mixed pairing rules can leave individual
              comparisons uncertain.
            </p>
          </section>
          <section className="settings-panel">
            <SectionHeading title="Your actual results" />
            <CategoryTabs value={category} onChange={setCategory} />
            <ResultList
              results={data.results.filter((r: any) => r.category === category)}
              open={open}
            />
            {!data.results.some((r: any) => r.category === category) && (
              <Empty title="No results in this category">
                Your Singles, Doubles and Mixed histories stay separate.
              </Empty>
            )}
          </section>
        </div>
        <div>
          <section className="panel">
            <SectionHeading title="Your choices" />
            <form onSubmit={save}>
              <div className="field">
                <label htmlFor="profile-name">Display name</label>
                <input
                  id="profile-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={60}
                />
              </div>
              <div className="field">
                <label htmlFor="profile-district">Declared district</label>
                <select
                  id="profile-district"
                  value={form.district}
                  onChange={(e) =>
                    setForm({ ...form, district: e.target.value })
                  }
                >
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d || "Keep my district private"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="profile-timezone">Timezone</label>
                <select
                  id="profile-timezone"
                  value={form.timezone}
                  onChange={(e) =>
                    setForm({ ...form, timezone: e.target.value })
                  }
                >
                  {[
                    ...new Set([
                      form.timezone,
                      "Asia/Singapore",
                      "Europe/Berlin",
                      "Europe/London",
                      "America/New_York",
                      "Australia/Sydney",
                    ]),
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              {toggles.map(([key, label, help]) => (
                <div className="field-row" key={key}>
                  <label htmlFor={"profile-" + key}>
                    {label}
                    <small>{help}</small>
                  </label>
                  <input
                    id={"profile-" + key}
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.checked })
                    }
                  />
                </div>
              ))}
              <SectionHeading title="Your own rating goals" />
              {CATEGORIES.map((c) => (
                <div className="field" key={c}>
                  <label htmlFor={"goal-" + c}>{c} · optional</label>
                  <input
                    id={"goal-" + c}
                    type="number"
                    min="0"
                    max="5000"
                    step="1"
                    value={form.goals[c] ?? ""}
                    onChange={(e) => {
                      const goals = { ...form.goals };
                      if (e.target.value === "") delete goals[c];
                      else goals[c] = Number(e.target.value);
                      setForm({ ...form, goals });
                    }}
                    placeholder="No required target"
                  />
                </div>
              ))}
              <InlineError message={error} />
              <button className="button block">
                Save my preferences
                <Check size={16} />
              </button>
            </form>
          </section>
          <section className="panel settings-panel">
            <SectionHeading title="Your public links" />
            {shares
              .filter((s) => !s.revoked)
              .map((s) => (
                <div className="field-row" key={s.id}>
                  <span>
                    <strong style={{ fontSize: 12 }}>
                      {s.category} · {s.score}
                    </strong>
                    <small
                      style={{
                        display: "block",
                        color: "var(--muted)",
                        marginTop: 5,
                      }}
                    >
                      {dateLabel(s.asOf)} snapshot
                    </small>
                  </span>
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      await api("/shares/" + s.id, {}, "DELETE");
                      setShares(
                        shares.map((v) =>
                          v.id === s.id ? { ...v, revoked: true } : v,
                        ),
                      );
                      notify("The public link is revoked.");
                    }}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            <p className="form-help">
              A public link can be revoked. Downloaded or reposted images cannot
              be recalled from someone else’s device.
            </p>
          </section>
          <section className="panel settings-panel">
            <SectionHeading title="Data and connections" />
            <a
              className="text-button"
              href="/api/account/export"
              download="shuttl-account.json"
            >
              <Download size={15} />
              Export my account data
            </a>
            <button
              className="text-button"
              onClick={() => setRecoveryModal(true)}
            >
              Create a new private recovery code
            </button>
            <button className="text-button" onClick={() => setBlocking(true)}>
              Block a player
            </button>
            {blocks.map((p) => (
              <div className="field-row" key={p.id}>
                <span style={{ fontSize: 12 }}>{p.name}</span>
                <button
                  className="text-button"
                  onClick={async () => {
                    await api("/blocks/" + p.id, {}, "DELETE");
                    setBlocks(blocks.filter((b) => b.id !== p.id));
                  }}
                >
                  Unblock
                </button>
              </div>
            ))}
            <button
              className="text-button danger"
              onClick={() => setDeleting(true)}
            >
              Delete my account
            </button>
          </section>
        </div>
      </div>
      {reliability && (
        <section className="panel settings-panel">
          <SectionHeading title="Private response record" />
          <p className="form-help">
            {reliability.total
              ? `${reliability.handled} of ${reliability.total} eligible duties handled within seven days in the last 90 days.`
              : "Your response record begins with eligible delivered requests."}{" "}
            This measures response, not honesty or skill. Cancelled unnecessary
            duties are excluded.
          </p>
          {reliability.consecutiveUnresolved >= 3 && (
            <div className="notice">
              <strong>Some delivered results still need a response</strong>
              <p>
                Confirm, correct or ask for review. Your playing rating is never
                reduced for response speed.
              </p>
            </div>
          )}
        </section>
      )}
      {recoveryModal && (
        <Modal
          title="Create a fresh recovery code"
          close={() => setRecoveryModal(false)}
        >
          <p className="form-help">
            Your earlier recovery code stops working. The new code is shown only
            once.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const result = await api("/account/recovery-code", {
                  password: recoveryPassword,
                });
                setNewRecovery(result.recoveryCode);
                setRecoveryModal(false);
                setRecoveryPassword("");
              } catch (error) {
                setError(errorMessage(error));
              }
            }}
          >
            <div className="field">
              <label htmlFor="rotate-password">Your current password</label>
              <input
                id="rotate-password"
                type="password"
                required
                value={recoveryPassword}
                onChange={(e) => setRecoveryPassword(e.target.value)}
              />
            </div>
            <InlineError message={error} />
            <button className="button block">
              Generate my new recovery code
            </button>
          </form>
        </Modal>
      )}
      {newRecovery && (
        <RecoveryCode code={newRecovery} close={() => setNewRecovery("")} />
      )}
      {blocking && (
        <PlayerLookup
          invite={false}
          close={() => setBlocking(false)}
          choose={async (p) => {
            await api("/blocks", { playerId: p.id });
            setBlocks([...blocks, p]);
            setBlocking(false);
            refresh();
            notify("Player blocked. Valid historical results remain.");
          }}
        />
      )}
      {deleting && (
        <Modal
          title="Delete your player account"
          close={() => setDeleting(false)}
        >
          <p className="form-help">
            Your sign-in, public profile and share links are removed. Necessary
            match history keeps a former-player reference so other players’
            valid results still make sense. Transfer any group ownership first.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/account", { password, confirmation }, "DELETE");
                localStorage.removeItem("shuttl:draft:" + data.me.id);
                logout();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            <div className="field">
              <label htmlFor="delete-password">Your password</label>
              <input
                type="password"
                id="delete-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="delete-confirm">Type DELETE</label>
              <input
                id="delete-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                pattern="DELETE"
              />
            </div>
            <InlineError message={error} />
            <button className="button danger block">
              Delete my account permanently
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function SharePassport({
  me,
  close,
  notify,
}: {
  me: any;
  close: () => void;
  notify: (message: string) => void;
}) {
  const [category, setCategory] = useState<Category>("Doubles"),
    [includeName, setIncludeName] = useState(false),
    [includeDistrict, setIncludeDistrict] = useState(false),
    [shape, setShape] = useState<"feed" | "story">("story"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  const rating = me.ratings.find((r: PublicRating) => r.category === category);
  async function create(download: boolean) {
    setError("");
    setBusy(true);
    try {
      const response = await api("/shares", {
        category,
        includeName,
        includeDistrict,
      });
      setLink(location.origin + response.path);
      if (download) {
        await document.fonts.ready;
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = shape === "story" ? 1920 : 1080;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#F6F7F2";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#14372C";
        ctx.font = "800 45px Manrope";
        ctx.fillText("SHUTTL.", 85, 110);
        const top = shape === "story" ? 450 : 210;
        ctx.fillStyle = "#14372C";
        ctx.beginPath();
        ctx.roundRect(75, top, 930, 620, 42);
        ctx.fill();
        ctx.fillStyle = "#C8DAB4";
        ctx.font = "600 27px Manrope";
        ctx.fillText(category.toUpperCase() + " RATING", 130, top + 80);
        ctx.fillStyle = "#F4F7EC";
        ctx.font = "600 232px Barlow";
        ctx.fillText(String(rating.score), 123, top + 340);
        ctx.font = "600 40px Manrope";
        ctx.fillText(rating.league, 132, top + 430);
        ctx.font = "500 24px Manrope";
        ctx.fillStyle = "#C8DAB4";
        ctx.fillText(
          rating.status + " estimate · Player-confirmed results",
          132,
          top + 510,
        );
        ctx.fillText(
          "Snapshot: " + dateLabel(response.payload.asOf),
          132,
          top + 560,
        );
        ctx.fillStyle = "#14372C";
        ctx.font = "500 27px Manrope";
        if (includeName) ctx.fillText(me.name, 86, top - 38);
        if (includeDistrict)
          ctx.fillText(me.district + " · Declared district", 86, top + 678);
        ctx.fillText("Your game. Your progress.", 86, canvas.height - 110);
        if (response.payload.title) {
          ctx.font = "600 20px Manrope";
          ctx.fillText(
            response.payload.title.label + " · " + response.payload.title.pool,
            86,
            canvas.height - 155,
          );
          ctx.font = "500 18px Manrope";
          ctx.fillText(
            "Among " +
              response.payload.title.eligible +
              " eligible players · dated snapshot",
            86,
            canvas.height - 185,
          );
        }
        if (category === "Mixed") {
          ctx.font = "500 20px Manrope";
          ctx.fillText(
            "Mixed estimate · individual ranking requires supported context",
            86,
            canvas.height - 65,
          );
        }
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("Image could not be created.")),
            "image/png",
          ),
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `shuttl-${category.toLowerCase()}-${shape}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        notify(
          "Your rating snapshot is downloaded. Sharing never earns rating points.",
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A number worth earning" close={close}>
      <CategoryTabs value={category} onChange={setCategory} />
      <RatingCard rating={rating} category={category} compact />
      <div className="field-row">
        <label htmlFor="share-name">
          Include my public name
          <small>
            {me.publicName
              ? "Your public name can appear."
              : "Enable public name in profile first."}
          </small>
        </label>
        <input
          id="share-name"
          type="checkbox"
          disabled={!me.publicName}
          checked={includeName}
          onChange={(e) => setIncludeName(e.target.checked)}
        />
      </div>
      <div className="field-row">
        <label htmlFor="share-district">
          Include my declared district
          <small>
            {me.publicDistrict
              ? "Only your selected district appears."
              : "Enable district sharing in profile first."}
          </small>
        </label>
        <input
          id="share-district"
          type="checkbox"
          disabled={!me.publicDistrict}
          checked={includeDistrict}
          onChange={(e) => setIncludeDistrict(e.target.checked)}
        />
      </div>
      <div className="field" style={{ marginTop: 17 }}>
        <label htmlFor="share-shape">Image shape</label>
        <select
          id="share-shape"
          value={shape}
          onChange={(e) => setShape(e.target.value as "story" | "feed")}
        >
          <option value="story">Story · 1080 × 1920</option>
          <option value="feed">Feed · 1080 × 1080</option>
        </select>
      </div>
      <InlineError message={error} />
      <button
        className="button block"
        disabled={rating.score === null || busy}
        onClick={() => create(true)}
      >
        <Download size={17} />
        {busy ? "Creating your snapshot…" : "Download my rating snapshot"}
      </button>
      <button
        className="button secondary block"
        style={{ marginTop: 10 }}
        disabled={rating.score === null || busy}
        onClick={() => create(false)}
      >
        <Share2 size={16} />
        Create a shareable link
      </button>
      {link && (
        <div className="field" style={{ marginTop: 15 }}>
          <label htmlFor="share-link">Your public snapshot link</label>
          <input
            id="share-link"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                notify("Snapshot link copied.");
              } catch {
                setError("Select the link and copy it manually.");
              }
            }}
          >
            <Copy size={15} />
            Copy link
          </button>
        </div>
      )}
      <p className="form-help">
        This is a dated snapshot, not a promise of a current local lead. Other
        players’ names, contact details and private disputes never appear.
      </p>
    </Modal>
  );
}
export function ReviewerPage({
  refresh,
  notify,
}: {
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [reason, setReason] = useState<Record<string, string>>({});
  const load = () =>
    api("/reviewer")
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="IMPARTIAL REVIEW. ATTRIBUTABLE DECISIONS."
        title="Review desk"
      />
      <InlineError message={error} />
      {data ? (
        <>
          <div className="list-stack">
            {data.reviews.map((r: any) => (
              <section className="panel" key={r.id}>
                <SectionHeading
                  title={r.category + " · " + dateLabel(r.created_at)}
                />
                <p className="form-help">Private report: {r.reason}</p>
                <div className="team-row">
                  <div>
                    {r.result.players
                      .slice(0, r.result.players.length / 2)
                      .map((p: Player) => p.name)
                      .join(" + ")}
                  </div>
                  <div>
                    {r.result.players
                      .slice(r.result.players.length / 2)
                      .map((p: Player) => p.name)
                      .join(" + ")}
                  </div>
                </div>
                <ScoreGames games={r.result.games} />
                <p className="form-help">
                  {r.result.retrospective
                    ? "All-player rated approval required"
                    : "Covered rated scope; opposite-side score approval required"}
                  . {r.result.approvals.length} stored approvals. Current
                  revision {r.result.revisionNumber}.
                </p>
                <div className="field">
                  <label htmlFor={"review-" + r.id}>
                    Recorded decision explanation
                  </label>
                  <textarea
                    id={"review-" + r.id}
                    minLength={10}
                    maxLength={1500}
                    value={reason[r.id] || ""}
                    onChange={(e) =>
                      setReason({ ...reason, [r.id]: e.target.value })
                    }
                  />
                </div>
                <div className="modal-actions">
                  {(["uphold", "void"] as const).map((decision) => (
                    <button
                      className={
                        "button " + (decision === "void" ? "secondary" : "")
                      }
                      key={decision}
                      disabled={(reason[r.id] || "").trim().length < 10}
                      onClick={async () => {
                        try {
                          await api("/reviewer/" + r.id, {
                            decision,
                            reason: reason[r.id],
                          });
                          load();
                          refresh();
                          notify(
                            "Review decision recorded with an audit entry.",
                          );
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      {decision === "uphold"
                        ? "Uphold existing valid approvals"
                        : "Mark this result unrated"}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {!data.reviews.length && (
            <Empty title="No independent review is waiting">
              A reviewer never resolves a result they participated in.
            </Empty>
          )}
          <section className="panel settings-panel">
            <SectionHeading title="Rating processing" />
            {data.jobs.map((j: any) => (
              <p className="form-help" key={j.id}>
                {j.category}: {j.status} · Attempt {j.attempts}
                {j.error ? " · " + j.error : ""}
              </p>
            ))}
            {data.jobs.length > 0 && (
              <button
                className="button secondary"
                onClick={async () => {
                  await api("/reviewer/retry-jobs", {});
                  load();
                }}
              >
                Retry delayed jobs
              </button>
            )}
          </section>
        </>
      ) : (
        <Spinner />
      )}
    </>
  );
}
