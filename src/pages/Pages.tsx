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
  Settings,
  LogOut,
} from "lucide-react";
import { api, dateLabel, errorMessage } from "../api.ts";
import {
  CATEGORIES,
  FORMATS,
  LEAGUES,
  type Category,
  type Player,
  type PublicRating,
  validateGames,
  type Format,
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
import { RatingGuide, ResultReward } from "../components/Progress.tsx";
import {
  comparable,
  comparisonCopy,
  ownChange,
  sharedHistory,
} from "../experience.ts";
import { ratingImage } from "../share-image.ts";
import { PlayingInsights } from "../components/Insights.tsx";
import { DeviceNotifications } from "../components/Notifications.tsx";
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
              {ownChange(r)?.count === 5
                ? "Starting rating revealed"
                : ownChange(r)
                  ? `Your rating: ${ownChange(r).before} → ${ownChange(r).after}`
                  : `${r.ownProgress?.count || 0} confirmed placement results`}
            </span>
            <ArrowUpRight size={15} />
          </div>
        </button>
      ))}
    </div>
  );
}
export function ComparisonDialog({
  data,
  playerId,
  category: initialCategory,
  close,
  open,
  notify,
  refresh,
}: {
  data: any;
  playerId: string;
  category: Category;
  close: () => void;
  open: (id: string) => void;
  notify: (message: string) => void;
  refresh: () => void;
}) {
  const [loaded, setLoaded] = useState<any>(null),
    [category, setCategory] = useState(initialCategory),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("/comparisons/" + playerId)
      .then((v) => {
        if (active) setLoaded(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [playerId]);
  const player = loaded?.player;
  const own = data.me.ratings.find(
      (r: PublicRating) => r.category === category,
    ),
    peer = player?.ratings.find((r: PublicRating) => r.category === category);
  const rows = loaded ? sharedHistory(loaded.results, playerId, category) : [];
  const against = rows.filter((r) => {
    const size = r.players.length / 2,
      self = r.players.findIndex((p: Player) => p.id === r.ownParticipant),
      other = r.players.findIndex(
        (p: Player) => (p.canonicalId || p.id) === playerId,
      );
    return self < size !== other < size;
  });
  const wins = against.filter(
    (r) => (ownChange(r) || r.ownProgress)?.won,
  ).length;
  const together = rows.filter((r) => !against.includes(r));
  const isFriend = data.friends.some((p: Player) => p.id === playerId);
  return (
    <Modal
      title={
        player
          ? `${player.name} / your comparison`
          : "Your shared playing picture"
      }
      close={close}
      wide
    >
      <InlineError message={error} />
      {!loaded && !error ? (
        <Spinner />
      ) : (
        loaded && (
          <>
            <CategoryTabs value={category} onChange={setCategory} />
            <div className="comparison-score">
              <div>
                <Avatar player={data.me} />
                <strong>You</strong>
                <b>{own.score ?? "—"}</b>
                <span>{own.status}</span>
              </div>
              <span>vs</span>
              <div>
                <Avatar player={player} />
                <strong>{player.name}</strong>
                <b>{peer.score ?? "—"}</b>
                <span>{peer.status}</span>
              </div>
            </div>
            <div className="notice">
              <strong>{comparisonCopy(own, peer)}</strong>
              <p>
                {comparable(own, peer)
                  ? "A shared playing picture supports this comparison. It remains an estimate, not a certified level or a prediction of your next match."
                  : "See each player’s progress independently. Fixed partnerships and disconnected playing groups can leave a direct comparison unclear."}
              </p>
            </div>
            {isFriend && comparable(own, peer) && (
              <button
                className="button secondary block"
                onClick={() => {
                  try {
                    localStorage.setItem(
                      `shuttl:rival:${data.me.id}:${category}`,
                      playerId,
                    );
                    notify("Your home comparison is pinned on this device.");
                    close();
                  } catch {
                    setError(
                      "This device cannot save your preferred comparison.",
                    );
                  }
                }}
              >
                Keep this comparison on home
              </button>
            )}
            <div className="weekly-facts">
              <div>
                <strong>
                  {against.length ? wins + "–" + (against.length - wins) : "—"}
                </strong>
                <span>your wins / losses against them</span>
              </div>
              <div>
                <strong>{together.length}</strong>
                <span>matches on the same side</span>
              </div>
            </div>
            <p className="form-help">
              {category === "Singles"
                ? "Your confirmed shared Singles results."
                : "These are team outcomes with your recorded partners; they do not isolate either player’s ability."}
              {loaded.limited
                ? " Showing the latest 200 shared published results across categories."
                : " Only published shared results are included."}
            </p>
            <SectionHeading title="Your shared history" />
            <ResultList results={rows.slice(0, 10)} open={open} />
            {rows.length > 10 && (
              <p className="form-help">
                Showing the latest ten. Your full history is in Profile.
              </p>
            )}
            {!rows.length && (
              <p className="form-help">
                No published shared matches in this category yet.
              </p>
            )}
            <RatingGuide category={category} />
            {isFriend && (
              <details className="guide-details">
                <summary>Manage this connection</summary>
                <p>Removing the connection keeps valid match history intact.</p>
                <button
                  className="text-button danger"
                  onClick={async () => {
                    try {
                      await api("/friends/" + playerId, {}, "DELETE");
                      refresh();
                      close();
                      notify("Connection removed. Valid match history stays.");
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  Remove connection
                </button>
              </details>
            )}
          </>
        )
      )}
    </Modal>
  );
}

function CareerHistory({
  category,
  setCategory,
  open,
}: {
  category: Category;
  setCategory: (c: Category) => void;
  open: (id: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setRows([]);
    setNext(null);
    api("/history?category=" + category)
      .then((v) => {
        if (active) {
          setRows(v.results);
          setNext(v.next);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [category]);
  const shown = rows.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      r.players.some((p: Player) =>
        (p.name + " " + p.username).toLowerCase().includes(query.toLowerCase()),
      ),
  );
  return (
    <>
      <CategoryTabs value={category} onChange={setCategory} />
      <div className="history-filters">
        <div className="field">
          <label htmlFor="history-search">Find a player in your history</label>
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or username"
          />
        </div>
        <div className="field">
          <label htmlFor="history-state">Result status</label>
          <select
            id="history-state"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All results</option>
            <option value="rated">Published</option>
            <option value="pending">Awaiting approval</option>
            <option value="correction_pending">Correction pending</option>
            <option value="disputed">Under review</option>
          </select>
        </div>
      </div>
      <InlineError message={error} />
      <ResultList results={shown} open={open} />
      {busy && <Spinner />}
      {!busy && !shown.length && (
        <Empty title="No matching results">
          Try another player or category.
        </Empty>
      )}
      {next && (
        <>
          <p className="form-help">
            Filters apply to {rows.length} loaded results. Load older history to
            keep searching.
          </p>
          <button
            className="button secondary block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const v = await api(
                  "/history?category=" + category + "&before=" + next,
                );
                setRows((previous) => [
                  ...previous,
                  ...v.results.filter(
                    (r: any) => !previous.some((p) => p.id === r.id),
                  ),
                ]);
                setNext(v.next);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Load older results
          </button>
        </>
      )}
    </>
  );
}
export function FriendsPage({
  data,
  refresh,
  add,
  notify,
  compare,
  category,
  setCategory,
}: {
  data: any;
  refresh: () => void;
  add: () => void;
  notify: (message: string) => void;
  compare: (id: string) => void;
  category: Category;
  setCategory: (c: Category) => void;
}) {
  const [circle, setCircle] = useState<any>(null),
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
                  <button className="text-button" onClick={() => compare(p.id)}>
                    Compare <ChevronRight size={16} />
                  </button>
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
    [acknowledgedBatch, setAcknowledgedBatch] = useState(""),
    [batchBusy, setBatchBusy] = useState(false);
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
  const revisionKey = (r: any) => r.id + ":" + r.revisionId;
  const chosen = eligible.filter((r: any) => selected.includes(revisionKey(r)));
  const batchKey = chosen.map(revisionKey).sort().join("|");
  const agree = !!batchKey && acknowledgedBatch === batchKey;
  async function batch() {
    if (!agree || batchBusy) return;
    setBatchBusy(true);
    try {
      await api("/results/batch-approve", {
        agree: true,
        results: chosen.map((r: any) => ({
          id: r.id,
          revisionId: r.revisionId,
        })),
      });
      setSelected([]);
      setAcknowledgedBatch("");
      refresh();
      notify("The selected exact approvals are recorded.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBatchBusy(false);
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
                  checked={selected.includes(revisionKey(r))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, revisionKey(r)]
                        : selected.filter((id) => id !== revisionKey(r)),
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
          {chosen.length > 0 && (
            <div className="notice">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) =>
                    setAcknowledgedBatch(e.target.checked ? batchKey : "")
                  }
                />
                <span>
                  I read every selected score and agree to its exact revision
                  and rated status.
                </span>
              </label>
              <button
                className="button block"
                disabled={!agree || batchBusy}
                onClick={batch}
              >
                Approve {chosen.length} exact{" "}
                {chosen.length === 1 ? "result" : "results"}
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
                  {n.unitId && n.kind !== "comparison" && (
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
  deleted,
  signOut,
  preferredCategory,
  setPreferredCategory,
}: {
  data: any;
  refresh: () => void;
  open: (id: string) => void;
  share: () => void;
  notify: (message: string) => void;
  deleted: () => void;
  signOut: () => void;
  preferredCategory: Category;
  setPreferredCategory: (c: Category) => void;
}) {
  const [tab, setTabState] = useState(() => {
    const value = new URLSearchParams(location.search).get("tab");
    return ["overview", "history", "insights", "settings"].includes(value || "")
      ? value!
      : "overview";
  });
  function setTab(value: string) {
    setTabState(value);
    const url = new URL(location.href);
    url.searchParams.set("tab", value);
    history.replaceState({}, "", url.pathname + url.search);
  }
  const [form, setForm] = useState({ ...data.me }),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [blocking, setBlocking] = useState(false),
    [blocks, setBlocks] = useState<Player[]>([]),
    [shares, setShares] = useState<any[]>([]),
    [category, setCategory] = useState<Category>(preferredCategory),
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
      <div className="section-tabs" aria-label="Profile sections">
        {[
          ["overview", "Passport"],
          ["insights", "Insights"],
          ["history", "History"],
          ["settings", "Settings"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {key === "settings" && <Settings size={16} />} {label}
          </button>
        ))}
      </div>
      <div className={"page-grid profile-layout profile-" + tab}>
        <div hidden={tab === "settings"}>
          {tab === "overview" && (
            <>
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
                  disconnected circles and mixed pairing rules can leave
                  individual comparisons uncertain.
                </p>
              </section>
              <div className="profile-actions">
                <button
                  className="button secondary"
                  onClick={() => setTab("history")}
                >
                  Explore your match history
                </button>
                <button
                  className="button secondary"
                  onClick={() => setTab("settings")}
                >
                  Manage goals and settings <Settings size={16} />
                </button>
              </div>
              <RatingGuide category={preferredCategory} />
            </>
          )}
          {tab === "history" && (
            <section className="settings-panel">
              <SectionHeading title="Your actual results" />
              <CareerHistory
                category={category}
                setCategory={setCategory}
                open={open}
              />
            </section>
          )}
          {tab === "insights" && (
            <PlayingInsights category={category} setCategory={setCategory} />
          )}
        </div>
        <div hidden={tab !== "settings"}>
          <section className="account-menu">
            <button className="button secondary" onClick={signOut}>
              <LogOut size={17} /> Sign out
            </button>
            <a className="text-button" href="/agreements">
              Rated agreements
            </a>
            {data.me.role === "reviewer" && (
              <a className="text-button" href="/reviewer">
                Review desk
              </a>
            )}
          </section>
          <section className="panel">
            <SectionHeading title="Your choices" />
            <form onSubmit={save}>
              <div className="field">
                <label htmlFor="preferred-category">
                  Preferred category on this device
                </label>
                <select
                  id="preferred-category"
                  value={preferredCategory}
                  onChange={(e) =>
                    setPreferredCategory(e.target.value as Category)
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
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
                      ...(typeof Intl.supportedValuesOf === "function"
                        ? Intl.supportedValuesOf("timeZone")
                        : []),
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
          <DeviceNotifications
            owner={data.me.id}
            timezone={data.me.timezone}
            notify={notify}
          />
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
      {reliability && tab === "settings" && (
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
                deleted();
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
  initialCategory = "Doubles",
}: {
  me: any;
  close: () => void;
  notify: (message: string) => void;
  initialCategory?: Category;
}) {
  const [category, setCategory] = useState<Category>(initialCategory),
    [includeName, setIncludeName] = useState(false),
    [includeDistrict, setIncludeDistrict] = useState(false),
    [shape, setShape] = useState<"feed" | "story">("story"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  const [template, setTemplate] = useState<"passport" | "reveal" | "best">(
      "passport",
    ),
    [milestones, setMilestones] = useState<any>(null);
  useEffect(() => {
    let active = true;
    setMilestones(null);
    api("/milestones?category=" + category)
      .then((v) => {
        if (active) setMilestones(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [category]);
  useEffect(() => {
    setLink("");
  }, [category, template, includeName, includeDistrict]);
  const rating = me.ratings.find((r: PublicRating) => r.category === category);
  const milestone = template === "passport" ? null : milestones?.[template];
  const preview = milestone ? { ...rating, ...milestone } : rating;
  async function create(download: boolean) {
    setError("");
    setBusy(true);
    try {
      const response = await api("/shares", {
        category,
        includeName,
        includeDistrict,
        template,
      });
      setLink(location.origin + response.path);
      if (download) {
        const blob = await ratingImage(response.payload, shape);
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
      <CategoryTabs
        value={category}
        onChange={(c) => {
          if (!busy) {
            setCategory(c);
            setTemplate("passport");
          }
        }}
      />
      <div className="field">
        <label htmlFor="share-template">Your story</label>
        <select
          id="share-template"
          value={template}
          disabled={busy}
          onChange={(e) => setTemplate(e.target.value as typeof template)}
        >
          <option value="passport">My current rating</option>
          <option value="reveal" disabled={!milestones?.reveal}>
            My first rating reveal
          </option>
          <option value="best" disabled={!milestones?.best}>
            My personal best
          </option>
        </select>
      </div>
      <RatingCard rating={preview} category={category} compact />
      {milestone && (
        <p className="form-help">
          {template === "best" ? "Personal best" : "Starting point"} · match
          played {dateLabel(milestone.asOf)} · a dated milestone; your current
          rating may differ.
        </p>
      )}
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
