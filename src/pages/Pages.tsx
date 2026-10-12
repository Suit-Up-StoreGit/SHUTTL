import { useEffect, useState, useRef, type FormEvent } from "react";
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
import {
  api,
  ApiError,
  dateLabel,
  dateTimeLabel,
  errorMessage,
} from "../api.ts";
import {
  preferenceValues,
  preferenceSnapshot,
  preferenceDraftKey,
  readPreferenceDraft,
  clearPreferenceDraft,
} from "../preference-draft.ts";
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
import {
  RatingGuide,
  ResultReward,
  ProgressChart,
} from "../components/Progress.tsx";
import {
  comparable,
  comparisonCopy,
  ownChange,
  sharedHistory,
  canReviewResult,
} from "../experience.ts";
import { ratingImage } from "../share-image.ts";
import { PlayingInsights } from "../components/Insights.tsx";
import { DeviceNotifications } from "../components/Notifications.tsx";
import { PlayerIdentity } from "../components/PlayerIdentity.tsx";
import { GroupRecap, PlayerCode } from "../components/Community.tsx";
import {
  AppearanceChoices,
  PortraitChoice,
  PasskeyChoices,
  ResearchChoice,
  recordResearch,
} from "../components/Preferences.tsx";
import { countryOptions } from "../location.ts";
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
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [removing, setRemoving] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    setLoaded(null);
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
  }, [playerId, attempt]);
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
      dismissible={!removing}
      wide
    >
      <InlineError message={error} />
      {error && !loaded && (
        <button
          className="button secondary"
          onClick={() => setAttempt((v) => v + 1)}
        >
          Retry player comparison
        </button>
      )}
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
                  : own.score === null || peer.score === null
                    ? "Each category reveals a rating after five player-confirmed results. Until then, follow each player’s placement progress."
                    : own.status === "Pair-linked" ||
                        peer.status === "Pair-linked"
                      ? "Results with different partners help distinguish each player’s contribution. You can still follow both players’ progress separately."
                      : "Results connecting your playing groups can support a comparison. For now, follow each player’s progress separately."}
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
                  disabled={removing}
                  onClick={async () => {
                    if (removing) return;
                    setRemoving(true);
                    setError("");
                    try {
                      await api("/friends/" + playerId, {}, "DELETE");
                      refresh();
                      close();
                      notify("Connection removed. Valid match history stays.");
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setRemoving(false);
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
  rating,
  timezone,
}: {
  category: Category;
  setCategory: (c: Category) => void;
  open: (id: string) => void;
  rating: PublicRating;
  timezone: string;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [historyAttempt, setHistoryAttempt] = useState(0);
  const historyGeneration = useRef(0);
  useEffect(() => {
    let active = true;
    const generation = ++historyGeneration.current;
    setBusy(true);
    setError("");
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
      if (historyGeneration.current === generation) historyGeneration.current++;
    };
  }, [category, historyAttempt]);
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
      {!busy && !error && (
        <section className="panel progress-panel">
          <SectionHeading title="Your progress" />
          <ProgressChart results={rows} timezone={timezone} rating={rating} />
          {next && (
            <p className="form-help">
              Based on the results loaded below. Load older results to include
              earlier history.
            </p>
          )}
        </section>
      )}
      <div className="history-filters">
        <div className="field">
          <label htmlFor="history-search">
            Find a player in loaded results
          </label>
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or username"
            aria-describedby="history-search-scope"
          />
          {!busy && !error && (
            <p className="form-help" id="history-search-scope">
              Searches {rows.length} loaded {category} results.{" "}
              {next
                ? "Load older history below to search earlier matches."
                : "All history in this category is loaded."}
            </p>
          )}
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
      {error && !rows.length && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setHistoryAttempt((v) => v + 1)}
        >
          Retry match history
        </button>
      )}
      <ResultList results={shown} open={open} />
      {busy && <Spinner />}
      {!busy && !error && !shown.length && (
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
              const generation = historyGeneration.current;
              setBusy(true);
              setError("");
              try {
                const v = await api(
                  "/history?category=" + category + "&before=" + next,
                );
                if (generation !== historyGeneration.current) return;
                setRows((previous) => [
                  ...previous,
                  ...v.results.filter(
                    (r: any) => !previous.some((p) => p.id === r.id),
                  ),
                ]);
                setNext(v.next);
              } catch (e) {
                if (generation === historyGeneration.current)
                  setError(errorMessage(e));
              } finally {
                if (generation === historyGeneration.current) setBusy(false);
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
  open,
}: {
  data: any;
  refresh: () => void;
  add: () => void;
  notify: (message: string) => void;
  compare: (id: string) => void;
  category: Category;
  setCategory: (c: Category) => void;
  open: (id: string) => void;
}) {
  const [circle, setCircle] = useState<any>(null),
    [circleId, setCircleId] = useState(
      () => new URLSearchParams(location.search).get("circle") || "",
    ),
    [circleLoading, setCircleLoading] = useState(false),
    [leaving, setLeaving] = useState(false),
    [createBusy, setCreateBusy] = useState(false),
    [nextOwner, setNextOwner] = useState(""),
    [confirmOwner, setConfirmOwner] = useState(false),
    [ownerBusy, setOwnerBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [creationAttempt, setCreationAttempt] = useState<{
      owner: string;
      name: string;
      requestId: string;
    } | null>(() => {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("shuttl:pending-circle:" + data.me.id) ||
            "null",
        );
        if (
          saved?.owner === data.me.id &&
          typeof saved.name === "string" &&
          saved.name.trim().length >= 3 &&
          saved.name.length <= 60 &&
          /^[a-f0-9-]{36}$/.test(saved.requestId)
        )
          return saved;
      } catch {}
      return null;
    }),
    [name, setName] = useState(() => creationAttempt?.name || ""),
    [creationSaved, setCreationSaved] = useState(!!creationAttempt),
    [lookup, setLookup] = useState(false),
    [error, setError] = useState("");
  const circleGeneration = useRef(0);
  const creationRunning = useRef(false);
  function selectCircle(id: string) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("circle", id);
    else url.searchParams.delete("circle");
    history.pushState({}, "", url.pathname + url.search);
    setCircleId(id);
    setNextOwner("");
    setConfirmOwner(false);
    window.scrollTo({ top: 0 });
  }
  const loadCircle = async (id: string) => {
    const generation = ++circleGeneration.current;
    setCircle(null);
    setCircleLoading(true);
    setError("");
    try {
      const value = await api("/circles/" + id);
      if (generation === circleGeneration.current) setCircle(value);
    } catch (e) {
      if (generation === circleGeneration.current) setError(errorMessage(e));
    } finally {
      if (generation === circleGeneration.current) setCircleLoading(false);
    }
  };
  useEffect(() => {
    if (circleId) void loadCircle(circleId);
    else {
      circleGeneration.current++;
      setCircle(null);
      setCircleLoading(false);
      setError("");
    }
    return () => {
      circleGeneration.current++;
    };
  }, [circleId, data.me.id]);
  useEffect(() => {
    const back = () =>
      setCircleId(new URLSearchParams(location.search).get("circle") || "");
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (creationRunning.current) return;
    creationRunning.current = true;
    setCreateBusy(true);
    setError("");
    const attempt = creationAttempt || {
      owner: data.me.id,
      name: name.trim(),
      requestId: crypto.randomUUID(),
    };
    setCreationAttempt(attempt);
    try {
      sessionStorage.setItem(
        "shuttl:pending-circle:" + data.me.id,
        JSON.stringify(attempt),
      );
      setCreationSaved(true);
    } catch {
      setCreationSaved(false);
    }
    try {
      const response = await api(
        "/circles",
        { name: attempt.name },
        "POST",
        attempt.requestId,
      );
      setCreationAttempt(null);
      try {
        sessionStorage.removeItem("shuttl:pending-circle:" + data.me.id);
      } catch {}
      setCreating(false);
      setName("");
      refresh();
      selectCircle(response.id);
      notify("Your comparison circle is ready.");
    } catch (e) {
      if (
        e instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(e.status)
      ) {
        setCreationAttempt(null);
        try {
          sessionStorage.removeItem("shuttl:pending-circle:" + data.me.id);
        } catch {}
      }
      setError(errorMessage(e));
    } finally {
      creationRunning.current = false;
      setCreateBusy(false);
    }
  }
  if (circleId && !circle)
    return (
      <>
        <PageHeading eyebrow="YOUR EXISTING GROUP" title="Your group" />
        <button className="text-button" onClick={() => selectCircle("")}>
          ← Back to your friends
        </button>
        <InlineError message={error} />
        {circleLoading || !error ? (
          <Spinner />
        ) : (
          <button
            className="button secondary"
            onClick={() => loadCircle(circleId)}
          >
            Retry loading this group
          </button>
        )}
      </>
    );
  const players = circle
    ? circle.members.filter((p: Player) => p.id !== data.me.id)
    : data.friends;
  const acceptedCount = circle
    ? (circle.acceptedCount ??
      data.circles.find((c: any) => c.id === circle.id)?.members ??
      circle.members.length)
    : 0;
  const mustTransfer = circle?.owner === data.me.id && acceptedCount > 1;
  return (
    <>
      <PageHeading
        eyebrow={circle ? "YOUR EXISTING GROUP" : "FRIENDS & EXISTING GROUPS"}
        title={circle ? circle.name : "Your circle"}
      >
        {(!circle || circle.owner === data.me.id) && (
          <button
            className="button"
            onClick={circle ? () => setLookup(true) : add}
          >
            <Plus size={16} />
            {circle ? "Invite to group" : "Add a player"}
          </button>
        )}
      </PageHeading>
      <p className="page-subtitle">
        {circle
          ? `${acceptedCount} accepted ${acceptedCount === 1 ? "member" : "members"}, including you · ${circle.owner === data.me.id ? "You own this group" : "You joined this group"}. Compare the progress of the players in this group.`
          : "Your friends are personal connections. Your existing groups are separate memberships, joined by invitation."}
      </p>
      {circle && (
        <button className="text-button" onClick={() => selectCircle("")}>
          ← Back to your friends
        </button>
      )}
      <CategoryTabs value={category} onChange={setCategory} />
      <InlineError message={error} />
      {circle && (
        <GroupRecap
          circle={circle}
          category={category}
          me={data.me}
          open={open}
          refresh={refresh}
          inNamedGroup
        />
      )}
      <div className="page-grid">
        <section className="panel">
          <SectionHeading
            title={circle ? "Other group members" : "Your friends"}
          />
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
          ) : circle ? (
            <Empty
              title="Your group starts here"
              action={
                circle.owner === data.me.id
                  ? "Invite a group member"
                  : undefined
              }
              onClick={() => setLookup(true)}
            >
              {circle.owner === data.me.id
                ? "Invite a player from your existing group. They appear here after accepting."
                : "No other group members are visible here yet. The group owner can invite players."}
            </Empty>
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
            partnerships can leave individual comparisons unclear. Ratings are
            developing estimates, not certified skill levels.
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
              Adding a friend does not join a group. Group members can compare
              ratings here without becoming friends.
            </p>
            <div className="list-stack" style={{ marginTop: 15 }}>
              {data.circles.map((c: any) => (
                <button
                  key={c.id}
                  className="circle-tile"
                  onClick={() =>
                    circleId === c.id ? loadCircle(c.id) : selectCircle(c.id)
                  }
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
              <p className="form-help">
                Group membership creates no friendship and approves no rated
                play or scores.
              </p>
              {circle.owner === data.me.id && (
                <>
                  {mustTransfer && (
                    <p className="form-help" id="circle-leave-guidance">
                      Transfer ownership to another accepted member before
                      leaving this group.
                      {!players.length &&
                        " Invite a new member if no one is available to choose here."}
                    </p>
                  )}
                  <div className="field">
                    <label htmlFor="next-owner">Transfer ownership</label>
                    <select
                      id="next-owner"
                      value={nextOwner}
                      onChange={(e) => setNextOwner(e.target.value)}
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
                    <button
                      className="button secondary"
                      disabled={!nextOwner}
                      onClick={() => setConfirmOwner(true)}
                    >
                      Review ownership transfer
                    </button>
                  </div>
                </>
              )}
              <button
                className="text-button danger"
                disabled={leaving || mustTransfer}
                aria-describedby={
                  mustTransfer ? "circle-leave-guidance" : undefined
                }
                onClick={async () => {
                  if (leaving) return;
                  setLeaving(true);
                  setError("");
                  try {
                    await api(
                      "/circles/" + circle.id + "/membership",
                      {},
                      "DELETE",
                    );
                    selectCircle("");
                    refresh();
                    notify("You left this circle.");
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setLeaving(false);
                  }
                }}
              >
                Leave this circle
              </button>
              {circle.owner === data.me.id && acceptedCount === 1 && (
                <p className="form-help">
                  Leaving as the last member closes this group and removes its
                  pending invitations. Recorded matches remain.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
      {creating && (
        <Modal
          title="A circle for your group"
          close={() => setCreating(false)}
          dismissible={!createBusy}
        >
          <p className="form-help">
            Compare the players in an existing badminton group. This creates no
            games, bookings or tournaments. Invite members after creating it;
            your friends do not join automatically.
          </p>
          {creationAttempt && !createBusy && (
            <p className="notice">
              This circle request has not been confirmed. Recover it to return
              the same group, even if the earlier request arrived. Its name is
              kept unchanged until confirmation.{" "}
              {creationSaved
                ? "The retry stays in this browser tab through navigation and reload, until confirmation or sign-out."
                : "Keep this circle page open: this browser could not save its retry for navigation or reload."}
            </p>
          )}
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
                disabled={createBusy || !!creationAttempt}
                placeholder="Tampines Tuesday crew"
              />
            </div>
            <InlineError message={error} />
            <button className="button block" disabled={createBusy}>
              {createBusy
                ? "Creating your circle…"
                : creationAttempt
                  ? "Recover this circle"
                  : "Create comparison circle"}
              <Plus size={16} />
            </button>
          </form>
        </Modal>
      )}
      {confirmOwner && circle && (
        <Modal
          title="Transfer circle ownership"
          close={() => setConfirmOwner(false)}
          dismissible={!ownerBusy}
        >
          <p>
            <strong>
              {circle.members.find((p: Player) => p.id === nextOwner)?.name}
            </strong>{" "}
            will manage this group. You will remain a member and give up
            ownership controls.
          </p>
          <InlineError message={error} />
          <button
            className="button"
            disabled={ownerBusy}
            onClick={async () => {
              setOwnerBusy(true);
              setError("");
              try {
                await api("/circles/" + circle.id + "/owner", {
                  playerId: nextOwner,
                });
                setConfirmOwner(false);
                setNextOwner("");
                void loadCircle(circle.id);
                refresh();
                notify("Circle ownership transferred.");
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setOwnerBusy(false);
              }
            }}
          >
            Confirm ownership transfer
          </button>
        </Modal>
      )}
      {lookup && circle && (
        <PlayerLookup
          invite={false}
          title={"Invite to " + circle.name}
          intro="This sends a group invitation. They join after accepting in their inbox; friendship and rated-play consent stay separate."
          excludeIds={[data.me.id, ...circle.members.map((p: Player) => p.id)]}
          close={() => setLookup(false)}
          choose={async (p) => {
            await api("/circles/" + circle.id + "/invite", {
              playerId: p.id,
            });
            setLookup(false);
            notify("Invitation sent to their SHUTTL inbox.");
            refresh();
          }}
        />
      )}
    </>
  );
}
export { RankingsPage } from "./Rankings.tsx";
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
  const [acting, setActing] = useState("");
  if (!inbox) return <Spinner />;
  async function act(scope: any, action: "accept" | "revoke") {
    if (acting) return;
    setActing(scope.id);
    setError("");
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
      notify(errorMessage(e));
    } finally {
      setActing("");
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
                    disabled={!!acting}
                    onClick={() => act(s, "revoke")}
                  >
                    Stop future rated play
                  </button>
                ) : (
                  <button
                    className="button"
                    disabled={!!acting}
                    onClick={() => act(s, "accept")}
                  >
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
    [batchBusy, setBatchBusy] = useState(false),
    [actionBusy, setActionBusy] = useState("");
  const actionLock = useRef(false);
  async function action(
    key: string,
    path: string,
    payload: any = {},
    method = "POST",
    message = "Your choice is recorded.",
  ) {
    if (actionLock.current || batchBusy) return;
    actionLock.current = true;
    setActionBusy(key);
    setError("");
    try {
      await api(path, payload, method);
      refresh();
      notify(message);
    } catch (e) {
      setError(errorMessage(e));
      notify(errorMessage(e));
      if (e instanceof ApiError && [404, 409].includes(e.status)) refresh();
    } finally {
      actionLock.current = false;
      setActionBusy("");
    }
  }
  if (!inbox) return <Spinner />;
  const eligible = inbox.pending.filter(canReviewResult).slice(0, 20);
  const revisionKey = (r: any) => r.id + ":" + r.revisionId;
  const chosen = eligible.filter((r: any) => selected.includes(revisionKey(r)));
  const batchKey = chosen.map(revisionKey).sort().join("|");
  const agree = !!batchKey && acknowledgedBatch === batchKey;
  async function batch() {
    if (!agree || batchBusy || actionBusy) return;
    setBatchBusy(true);
    setError("");
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
          disabled={!!actionBusy || batchBusy}
          onClick={() =>
            action(
              "read",
              "/notifications/read",
              {},
              "POST",
              "Updates marked read.",
            )
          }
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
                  disabled={batchBusy}
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
                  disabled={batchBusy}
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
                disabled={!agree || batchBusy || !!actionBusy}
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
                      disabled={!!actionBusy || batchBusy}
                      onClick={() =>
                        action(
                          c.token,
                          "/guest-claims/" + c.token + "/verify",
                          { accept: false },
                          "POST",
                          "The identity claim was rejected.",
                        )
                      }
                    >
                      Wrong person
                    </button>
                    <button
                      className="button"
                      disabled={!!actionBusy || batchBusy}
                      onClick={() =>
                        action(
                          c.token,
                          "/guest-claims/" + c.token + "/verify",
                          { accept: true },
                          "POST",
                          "Identity verified. The player still approves each exact result.",
                        )
                      }
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
            <SectionHeading title="Player and group invitations" />
            {inbox.friendRequests.map((p: Player) => (
              <div className="ranking-row invitation-row" key={p.id}>
                <Avatar player={p} />
                <div className="ranking-person">
                  <strong>{p.name}</strong>
                  <small>Wants to compare with you</small>
                </div>
                <button
                  className="button secondary"
                  disabled={!!actionBusy || batchBusy}
                  onClick={() =>
                    action(
                      p.id,
                      "/friends/" + p.id + "/accept",
                      {},
                      "POST",
                      "Friend request accepted.",
                    )
                  }
                >
                  Accept
                </button>
                <button
                  className="text-button"
                  disabled={!!actionBusy || batchBusy}
                  onClick={() =>
                    action(
                      p.id,
                      "/friends/" + p.id,
                      { pendingOnly: true },
                      "DELETE",
                      "Friend request declined.",
                    )
                  }
                >
                  Decline friend request
                </button>
              </div>
            ))}
            {inbox.circleInvites.map((c: any) => (
              <div className="ranking-row invitation-row" key={c.id}>
                <div className="ranking-person">
                  <strong>{c.name}</strong>
                  <small>Existing-group comparison</small>
                </div>
                <button
                  className="button secondary"
                  disabled={!!actionBusy || batchBusy}
                  onClick={() =>
                    action(
                      c.id,
                      "/circles/" + c.id + "/accept",
                      {},
                      "POST",
                      "Group invitation accepted.",
                    )
                  }
                >
                  Join
                </button>
                <button
                  className="text-button"
                  disabled={!!actionBusy || batchBusy}
                  onClick={() =>
                    action(
                      c.id,
                      "/circles/" + c.id + "/membership",
                      { pendingOnly: true },
                      "DELETE",
                      "Group invitation declined.",
                    )
                  }
                >
                  Decline group invitation
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
  shareRefresh = 0,
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
  shareRefresh?: number;
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
  const [restoredPreferences] = useState(() => readPreferenceDraft(data.me));
  const [form, setForm] = useState({
      ...data.me,
      ...restoredPreferences?.values,
    }),
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
    [newRecovery, setNewRecovery] = useState(""),
    [saving, setSaving] = useState(false),
    [privateError, setPrivateError] = useState(""),
    [privateLoading, setPrivateLoading] = useState(false),
    [privateAttempt, setPrivateAttempt] = useState(0),
    [privateAction, setPrivateAction] = useState(""),
    [accountBusy, setAccountBusy] = useState(false),
    [draftWarning, setDraftWarning] = useState("");
  const [savedPreferences, setSavedPreferences] = useState(() =>
    preferenceSnapshot(data.me),
  );
  const [latestSavedPreferences, setLatestSavedPreferences] = useState({
    ...data.me,
  });
  const [preferenceBase, setPreferenceBase] = useState(() =>
    restoredPreferences &&
    preferenceSnapshot(restoredPreferences.values) !==
      preferenceSnapshot(data.me)
      ? restoredPreferences.base
      : preferenceSnapshot(data.me),
  );
  const serverPreferences = preferenceSnapshot(data.me);
  const preferencesDirty = preferenceSnapshot(form) !== savedPreferences;
  const preferencesStale =
    preferencesDirty && preferenceBase !== savedPreferences;
  useEffect(() => {
    if (
      tab !== "settings" ||
      !/^#goal-(Singles|Doubles|Mixed)$/.test(location.hash)
    )
      return;
    const input = document.getElementById(location.hash.slice(1));
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [tab]);
  useEffect(() => {
    if (tab === "history" || tab === "insights")
      recordResearch(
        tab === "history" ? "history-view" : "insight-view",
        data.me.id,
      );
  }, [tab, data.me.id]);
  useEffect(() => {
    if (serverPreferences === savedPreferences) return;
    setLatestSavedPreferences({ ...data.me });
    if (!preferencesDirty || preferenceSnapshot(form) === serverPreferences) {
      setForm({ ...data.me });
      setPreferenceBase(serverPreferences);
    }
    setSavedPreferences(serverPreferences);
  }, [serverPreferences]);
  useEffect(() => {
    try {
      if (!preferencesDirty) clearPreferenceDraft(data.me.id);
      else
        sessionStorage.setItem(
          preferenceDraftKey(data.me.id),
          JSON.stringify({
            version: 1,
            owner: data.me.id,
            savedAt: Date.now(),
            base: preferenceBase,
            values: preferenceValues(form),
          }),
        );
      setDraftWarning("");
    } catch {
      setDraftWarning(
        "This tab cannot keep unsaved preferences after you leave. Save or discard them before navigating away.",
      );
    }
  }, [preferenceSnapshot(form), preferenceBase, savedPreferences, data.me.id]);
  useEffect(() => {
    let active = true;
    setPrivateLoading(true);
    setPrivateError("");
    setShares([]);
    Promise.allSettled([
      api("/blocks"),
      api("/my-shares"),
      api("/account/reliability"),
    ]).then((results) => {
      if (!active) return;
      if (results[0].status === "fulfilled")
        setBlocks(results[0].value.players);
      if (results[1].status === "fulfilled") setShares(results[1].value.shares);
      if (results[2].status === "fulfilled") setReliability(results[2].value);
      const failed = results.find((r) => r.status === "rejected");
      if (failed?.status === "rejected")
        setPrivateError(
          "Some account controls couldn’t be loaded. " +
            errorMessage(failed.reason),
        );
      setPrivateLoading(false);
    });
    return () => {
      active = false;
    };
  }, [
    data.me.id,
    privateAttempt,
    data.me.publicName,
    data.me.publicDistrict,
    shareRefresh,
  ]);
  async function privateMutation(
    key: string,
    path: string,
    method: "POST" | "DELETE",
    payload: any,
    success: () => void,
  ) {
    if (privateAction) return;
    if (privateLoading) {
      const message =
        "Your account controls are being checked. Try again when loading finishes.";
      setPrivateError(message);
      throw new Error(message);
    }
    setPrivateAction(key);
    setPrivateError("");
    try {
      await api(path, payload, method);
      success();
      setPrivateAttempt((value) => value + 1);
    } catch (e) {
      setPrivateError(errorMessage(e));
      throw e;
    } finally {
      setPrivateAction("");
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving || preferencesStale) return;
    setSaving(true);
    setError("");
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
        country,
        city,
        publicPortrait,
      } = form;
      const updated = await api(
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
          country,
          city,
          publicPortrait,
          expectedPreferences: preferenceBase,
        },
        "PATCH",
      );
      const snapshot = preferenceSnapshot(updated);
      setForm({ ...updated });
      setLatestSavedPreferences({ ...updated });
      setSavedPreferences(snapshot);
      setPreferenceBase(snapshot);
      clearPreferenceDraft(data.me.id);
      refresh();
      notify("Your player preferences are saved.");
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        try {
          const latest = await api("/me");
          setLatestSavedPreferences({ ...latest });
          setSavedPreferences(preferenceSnapshot(latest));
        } catch {}
      }
    } finally {
      setSaving(false);
    }
  }
  const toggles: [string, string, string][] = [
    [
      "publicPortrait",
      "Public portrait",
      "Let other signed-in players see your optional portrait. Accepted friends already see it.",
    ],
    [
      "publicName",
      "Public display name",
      "Accepted friends already see your display name. Other signed-in players see your username unless you choose this. Turning this off also revokes all existing public share links when you save.",
    ],
    [
      "publicDistrict",
      "Public declared district",
      "Show your declared playing area on your player identity. No GPS is collected. Turning this off also revokes all existing public share links when you save.",
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
      <div className="section-tabs" role="group" aria-label="Profile sections">
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
              <PlayerIdentity
                me={data.me}
                preferredCategory={preferredCategory}
                actions={
                  <div className="profile-actions">
                    <PlayerCode me={data.me} notify={notify} />
                    <button
                      className="text-button"
                      onClick={() => setTab("history")}
                    >
                      Explore your match history
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setTab("settings")}
                    >
                      Manage goals and settings <Settings size={16} />
                    </button>
                  </div>
                }
              />
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
                rating={data.me.ratings.find(
                  (r: PublicRating) => r.category === category,
                )}
                timezone={data.me.timezone}
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
              <fieldset disabled={saving} className="form-lock">
                {preferencesDirty && (
                  <div className="notice neutral preferences-draft-notice">
                    <strong>
                      {preferencesStale
                        ? "Your saved preferences changed elsewhere."
                        : draftWarning
                          ? "Unsaved preferences are only on this page."
                          : "Unsaved account choices"}
                    </strong>
                    <p>
                      {preferencesStale
                        ? "Review the latest saved choices before replacing them with this draft."
                        : "Save to apply these account choices. Your draft stays in this tab for up to one day; signing out here clears it."}
                    </p>
                    <InlineError message={draftWarning} />
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        const snapshot = preferenceSnapshot(
                          latestSavedPreferences,
                        );
                        setForm({ ...latestSavedPreferences });
                        setSavedPreferences(snapshot);
                        setPreferenceBase(snapshot);
                        clearPreferenceDraft(data.me.id);
                        setError("");
                      }}
                    >
                      Discard unsaved preferences
                    </button>
                    {preferencesStale && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={async () => {
                          try {
                            const latest = await api("/me");
                            const snapshot = preferenceSnapshot(latest);
                            setLatestSavedPreferences({ ...latest });
                            setSavedPreferences(snapshot);
                            setPreferenceBase(snapshot);
                            setForm({ ...latest });
                            clearPreferenceDraft(data.me.id);
                            setError("");
                          } catch (e) {
                            setError(errorMessage(e));
                          }
                        }}
                      >
                        Use latest saved preferences
                      </button>
                    )}
                  </div>
                )}
                <div className="field">
                  <label htmlFor="preferred-category">
                    Preferred category on this device
                  </label>
                  <select
                    id="preferred-category"
                    aria-describedby="preferred-category-help"
                    value={preferredCategory}
                    onChange={(e) =>
                      setPreferredCategory(e.target.value as Category)
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <p className="form-help" id="preferred-category-help">
                    Applies immediately on this device.
                  </p>
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
                  <label htmlFor="profile-country">
                    Country or territory · optional
                  </label>
                  <select
                    id="profile-country"
                    value={form.country || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        country: e.target.value,
                        city: e.target.value === "SG" ? "Singapore" : "",
                        district: "",
                        localOptIn: false,
                      })
                    }
                  >
                    <option value="">Keep my local context private</option>
                    {countryOptions.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {form.country && (
                  <div className="field">
                    <label htmlFor="profile-city">
                      City or town · declared
                    </label>
                    <input
                      id="profile-city"
                      maxLength={80}
                      value={form.city || ""}
                      onChange={(e) =>
                        setForm({ ...form, city: e.target.value })
                      }
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="profile-district">Declared district</label>
                  {!form.country || form.country === "SG" ? (
                    <select
                      id="profile-district"
                      value={form.district}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          district: e.target.value,
                          country: e.target.value
                            ? form.country || "SG"
                            : form.country,
                          city: e.target.value
                            ? form.city || "Singapore"
                            : form.city,
                        })
                      }
                    >
                      {DISTRICTS.map((d) => (
                        <option key={d} value={d}>
                          {d || "Keep my district private"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="profile-district"
                      maxLength={60}
                      value={form.district}
                      onChange={(e) =>
                        setForm({ ...form, district: e.target.value })
                      }
                      placeholder="Your usual playing area"
                    />
                  )}
                  <p className="form-help">
                    Country, city and area identify a declared SHUTTL pool. No
                    GPS is collected. Matching text does not verify residence;
                    spelling variants can split a pool.
                  </p>
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
                <div
                  className={
                    "preferences-save-bar " +
                    (preferencesDirty || saving ? "has-changes" : "")
                  }
                >
                  <InlineError message={error} />
                  <p className="form-help" role="status">
                    {saving
                      ? "Saving your preferences…"
                      : preferencesDirty
                        ? "You have unsaved preferences."
                        : "Your preferences are saved."}
                  </p>
                  <button
                    className="button block"
                    disabled={saving || !preferencesDirty || preferencesStale}
                  >
                    {saving ? "Saving preferences…" : "Save my preferences"}
                    <Check size={16} />
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
          <DeviceNotifications
            owner={data.me.id}
            timezone={data.me.timezone}
            notify={notify}
          />
          <section className="panel settings-panel">
            <AppearanceChoices />
            <PortraitChoice me={data.me} refresh={refresh} notify={notify} />
            <PasskeyChoices notify={notify} />
            <ResearchChoice />
          </section>
          <section className="panel settings-panel">
            <SectionHeading title="Your public links" />
            <p className="form-help" id="public-links-policy">
              Shared snapshots do not update when your rating or profile details
              change. Turning off Public display name or Public declared
              district automatically revokes all existing share links when you
              save. You can also revoke one link below.
            </p>
            {privateLoading && (
              <p className="form-help" role="status">
                Loading private account controls…
              </p>
            )}
            <InlineError message={privateError} />
            {privateError && (
              <button
                className="button secondary"
                disabled={privateLoading || !!privateAction}
                onClick={() => setPrivateAttempt((v) => v + 1)}
              >
                Retry account controls
              </button>
            )}
            {shares
              .filter((s) => !s.revoked)
              .map((s, index) => {
                const template =
                  (
                    {
                      passport: "Player passport",
                      reveal: "First rating",
                      promotion: "League reached",
                      best: "Personal best",
                    } as Record<string, string>
                  )[s.template] || "Rating snapshot";
                const sharedAt = s.createdAt || s.asOf;
                return (
                  <div
                    className="field-row public-share-entry"
                    key={s.id}
                    data-share-id={s.id}
                  >
                    <span>
                      <strong style={{ fontSize: 12 }}>
                        {template} · {s.category} · {s.score}
                      </strong>
                      <small
                        style={{
                          display: "block",
                          color: "var(--muted)",
                          marginTop: 5,
                        }}
                      >
                        Rating snapshot: {dateTimeLabel(s.asOf)}
                      </small>
                      {s.createdAt && (
                        <small
                          style={{
                            display: "block",
                            color: "var(--muted)",
                            marginTop: 5,
                          }}
                        >
                          Shared: {dateTimeLabel(s.createdAt)}
                        </small>
                      )}
                      <small
                        className="public-share-inclusions"
                        style={{
                          display: "block",
                          color: "var(--muted)",
                          marginTop: 5,
                        }}
                      >
                        {Object.hasOwn(s, "name")
                          ? `Name: ${s.name}`
                          : "Name omitted"}
                        {" · "}
                        {Object.hasOwn(s, "district")
                          ? `Area: ${s.district || "No area entered"}`
                          : "Area omitted"}
                      </small>
                    </span>
                    <button
                      className="text-button danger"
                      aria-label={`Revoke ${template} ${s.category} link ${index + 1}, ${dateTimeLabel(sharedAt)}`}
                      aria-describedby="public-links-policy"
                      disabled={privateLoading || !!privateAction}
                      onClick={async () => {
                        try {
                          await privateMutation(
                            "share:" + s.id,
                            "/shares/" + s.id,
                            "DELETE",
                            {},
                            () => {
                              setShares((previous) =>
                                previous.map((v) =>
                                  v.id === s.id ? { ...v, revoked: true } : v,
                                ),
                              );
                              notify("The public link is revoked.");
                            },
                          );
                        } catch (e) {
                          notify(errorMessage(e));
                        }
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                );
              })}
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
            <button
              className="text-button"
              disabled={privateLoading || !!privateAction}
              onClick={() => setBlocking(true)}
            >
              Block a player
            </button>
            {blocks.map((p) => (
              <div className="field-row" key={p.id}>
                <span style={{ fontSize: 12 }}>{p.name}</span>
                <button
                  className="text-button"
                  disabled={privateLoading || !!privateAction}
                  onClick={async () => {
                    try {
                      await privateMutation(
                        "block:" + p.id,
                        "/blocks/" + p.id,
                        "DELETE",
                        {},
                        () => {
                          setBlocks((previous) =>
                            previous.filter((b) => b.id !== p.id),
                          );
                          notify("Player unblocked.");
                        },
                      );
                    } catch (e) {
                      notify(errorMessage(e));
                    }
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
          dismissible={!accountBusy}
          close={() => setRecoveryModal(false)}
        >
          <p className="form-help">
            Your earlier recovery code stops working. The new code is shown only
            once.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (accountBusy) return;
              setAccountBusy(true);
              setError("");
              try {
                const result = await api("/account/recovery-code", {
                  password: recoveryPassword,
                });
                setNewRecovery(result.recoveryCode);
                setRecoveryModal(false);
                setRecoveryPassword("");
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setAccountBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="rotate-password">Your current password</label>
              <input
                id="rotate-password"
                type="password"
                required
                disabled={accountBusy}
                value={recoveryPassword}
                onChange={(e) => setRecoveryPassword(e.target.value)}
              />
            </div>
            <InlineError message={error} />
            <button className="button block" disabled={accountBusy}>
              {accountBusy
                ? "Generating recovery code…"
                : "Generate my new recovery code"}
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
          excludeIds={[data.me.id, ...blocks.map((p) => p.id)]}
          close={() => setBlocking(false)}
          choose={async (p) => {
            await privateMutation(
              "block:" + p.id,
              "/blocks",
              "POST",
              { playerId: p.id },
              () => {
                setBlocks((previous) => [...previous, p]);
                setBlocking(false);
                refresh();
                notify("Player blocked. Valid historical results remain.");
              },
            );
          }}
        />
      )}
      {deleting && (
        <Modal
          title="Delete your player account"
          dismissible={!accountBusy}
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
              if (accountBusy) return;
              setAccountBusy(true);
              setError("");
              try {
                await api("/account", { password, confirmation }, "DELETE");
                try {
                  localStorage.removeItem("shuttl:draft:" + data.me.id);
                } catch {}
                try {
                  sessionStorage.removeItem(
                    "shuttl:guest-attempt:" + data.me.id,
                  );
                  sessionStorage.removeItem(
                    "shuttl:agreement-attempt:" + data.me.id,
                  );
                } catch {}
                deleted();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setAccountBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="delete-password">Your password</label>
              <input
                type="password"
                id="delete-password"
                disabled={accountBusy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="delete-confirm">Type DELETE</label>
              <input
                id="delete-confirm"
                disabled={accountBusy}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                pattern="DELETE"
              />
            </div>
            <InlineError message={error} />
            <button className="button danger block" disabled={accountBusy}>
              {accountBusy
                ? "Deleting account…"
                : "Delete my account permanently"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
type PendingShare = {
  owner: string;
  key: string;
  started: number;
  selection: {
    category: Category;
    includeName: boolean;
    includeDistrict: boolean;
    template: "passport" | "reveal" | "best" | "promotion";
    shape: "feed" | "story";
  };
};
function readPendingShare(owner: string): PendingShare | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem("shuttl:pending-share:" + owner) || "null",
    );
    const s = stored?.selection;
    return stored?.owner === owner &&
      typeof stored.key === "string" &&
      /^[a-f0-9-]{36}$/.test(stored.key) &&
      typeof stored.started === "number" &&
      Number.isFinite(stored.started) &&
      stored.started > 0 &&
      CATEGORIES.includes(s?.category) &&
      typeof s.includeName === "boolean" &&
      typeof s.includeDistrict === "boolean" &&
      ["passport", "reveal", "best", "promotion"].includes(s.template) &&
      ["feed", "story"].includes(s.shape)
      ? stored
      : null;
  } catch {
    return null;
  }
}
export function SharePassport({
  me,
  close,
  notify,
  initialCategory = "Doubles",
  onCreated,
}: {
  me: any;
  close: () => void;
  notify: (message: string) => void;
  initialCategory?: Category;
  onCreated?: () => void;
}) {
  const [pendingShare, setPendingShare] = useState(() =>
    readPendingShare(me.id),
  );
  const [createdShare, setCreatedShare] = useState<any>(null);
  const shareRunning = useRef(false);
  const shareMounted = useRef(true);
  useEffect(() => {
    shareMounted.current = true;
    return () => {
      shareMounted.current = false;
    };
  }, [me.id]);
  const [category, setCategory] = useState<Category>(
      pendingShare?.selection.category || initialCategory,
    ),
    [includeName, setIncludeName] = useState(
      pendingShare?.selection.includeName || false,
    ),
    [includeDistrict, setIncludeDistrict] = useState(
      pendingShare?.selection.includeDistrict || false,
    ),
    [shape, setShape] = useState<"feed" | "story">(
      pendingShare?.selection.shape || "story",
    ),
    [error, setError] = useState(""),
    [milestoneError, setMilestoneError] = useState(""),
    [milestoneLoading, setMilestoneLoading] = useState(true),
    [milestoneAttempt, setMilestoneAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  const [template, setTemplate] = useState<
      "passport" | "reveal" | "best" | "promotion"
    >(pendingShare?.selection.template || "passport"),
    [milestones, setMilestones] = useState<any>(null);
  useEffect(() => {
    let active = true;
    setMilestones(null);
    setMilestoneError("");
    setMilestoneLoading(true);
    api("/milestones?category=" + category)
      .then((v) => {
        if (active) {
          setMilestones(v);
          setMilestoneError("");
        }
      })
      .catch((e) => {
        if (active) setMilestoneError(errorMessage(e));
      })
      .finally(() => {
        if (active) setMilestoneLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, milestoneAttempt]);
  useEffect(() => {
    setLink("");
    setCreatedShare(null);
    setError("");
  }, [category, template, includeName, includeDistrict]);
  const rating = me.ratings.find((r: PublicRating) => r.category === category);
  const milestone = template === "passport" ? null : milestones?.[template];
  const storyReady =
    template === "passport" || (!milestoneLoading && !!milestone);
  const snapshotReady =
    !!pendingShare || !!createdShare || (rating.score !== null && storyReady);
  const showPreview = !!createdShare?.payload || (!pendingShare && storyReady);
  const preview = createdShare?.payload
    ? { ...rating, ...createdShare.payload }
    : milestone
      ? { ...rating, ...milestone }
      : rating;
  useEffect(() => {
    if (!me.publicName) setIncludeName(false);
    if (!me.publicDistrict) setIncludeDistrict(false);
  }, [me.publicName, me.publicDistrict]);
  async function create(download: boolean) {
    if (shareRunning.current || !snapshotReady) return;
    shareRunning.current = true;
    setError("");
    setBusy(true);
    const selection = pendingShare?.selection || {
      category,
      includeName,
      includeDistrict,
      template,
      shape,
    };
    const attempt: PendingShare = pendingShare || {
      owner: me.id,
      key: crypto.randomUUID(),
      started: Date.now(),
      selection,
    };
    try {
      let response = createdShare;
      if (!response) {
        setPendingShare(attempt);
        try {
          localStorage.setItem(
            "shuttl:pending-share:" + me.id,
            JSON.stringify(attempt),
          );
        } catch {
          setError(
            "This browser can keep this retry only while this dialog stays open.",
          );
        }
        response = await api(
          "/shares",
          {
            category: selection.category,
            includeName: selection.includeName,
            includeDistrict: selection.includeDistrict,
            template: selection.template,
          },
          "POST",
          attempt.key,
        );
        if (!shareMounted.current) return;
        setCreatedShare(response);
        onCreated?.();
        setPendingShare(null);
        try {
          localStorage.removeItem("shuttl:pending-share:" + me.id);
        } catch {}
      }
      setLink(location.origin + response.path);
      if (download) {
        try {
          const blob = await ratingImage(response.payload, selection.shape);
          if (!shareMounted.current) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `shuttl-${selection.category.toLowerCase()}-${selection.shape}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          notify(
            "Image download requested. Check your Downloads, or use the snapshot link below. Sharing never earns rating points.",
          );
        } catch {
          setError(
            "Your public snapshot link was created, but the image could not be prepared. Use the link below or try downloading again.",
          );
        }
      }
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setPendingShare(null);
        try {
          localStorage.removeItem("shuttl:pending-share:" + me.id);
        } catch {}
      }
    } finally {
      setBusy(false);
      shareRunning.current = false;
    }
  }
  return (
    <Modal title="A number worth earning" close={close} dismissible={!busy}>
      {pendingShare && !busy && (
        <div className="notice neutral">
          <strong>Recover your earlier snapshot request.</strong>
          <p>
            Its outcome is unconfirmed. Retry the same category and privacy
            choices to retrieve the original link without creating another
            snapshot.
          </p>
          <InlineError message={error} />
          <button className="button secondary" onClick={() => create(false)}>
            Recover this snapshot link
          </button>
        </div>
      )}
      <fieldset
        disabled={busy || !!pendingShare}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
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
            <option value="promotion" disabled={!milestones?.promotion}>
              My latest league milestone
            </option>
          </select>
          {milestoneLoading && (
            <p className="form-help" role="status">
              Checking your available stories…
            </p>
          )}
          <InlineError message={milestoneError} />
          {(milestoneError || (milestoneLoading && milestoneAttempt > 0)) && (
            <button
              type="button"
              className="button secondary"
              disabled={busy || !!pendingShare || milestoneLoading}
              onClick={() => {
                if (busy || pendingShare || milestoneLoading) return;
                setMilestoneAttempt((value) => value + 1);
              }}
            >
              Retry available stories
            </button>
          )}
        </div>
        {showPreview && (
          <RatingCard
            rating={preview}
            category={category}
            compact
            showHistoryContext={false}
          />
        )}
        {milestone && (
          <p className="form-help">
            {template === "best"
              ? "Personal best"
              : template === "promotion"
                ? `${milestone.previousLeague} → ${milestone.league}`
                : "Starting point"}{" "}
            · match played {dateLabel(milestone.asOf)} · a dated milestone; your
            current rating may differ.
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
            disabled={busy || !me.publicName}
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
            disabled={busy || !me.publicDistrict}
            checked={includeDistrict}
            onChange={(e) => setIncludeDistrict(e.target.checked)}
          />
        </div>
        <div className="field" style={{ marginTop: 17 }}>
          <label htmlFor="share-shape">Image shape</label>
          <select
            id="share-shape"
            value={shape}
            disabled={busy}
            onChange={(e) => setShape(e.target.value as "story" | "feed")}
          >
            <option value="story">Story · 1080 × 1920</option>
            <option value="feed">Feed · 1080 × 1080</option>
          </select>
        </div>
        <InlineError message={error} />
        <button
          className="button block"
          disabled={!snapshotReady || busy}
          onClick={() => create(true)}
        >
          <Download size={17} />
          {busy ? "Creating your snapshot…" : "Download my rating snapshot"}
        </button>
        <button
          className="button secondary block"
          style={{ marginTop: 10 }}
          disabled={!snapshotReady || busy}
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
                  setError("");
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
      </fieldset>
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
    [acting, setActing] = useState(false),
    [reason, setReason] = useState<Record<string, string>>({});
  const load = async () => {
    setError("");
    try {
      setData(await api("/reviewer"));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
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
      {error && (
        <button className="button secondary" disabled={acting} onClick={load}>
          Retry review desk
        </button>
      )}
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
                    disabled={acting}
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
                      disabled={
                        acting || (reason[r.id] || "").trim().length < 10
                      }
                      onClick={async () => {
                        if (acting) return;
                        setActing(true);
                        setError("");
                        try {
                          await api("/reviewer/" + r.id, {
                            decision,
                            reason: reason[r.id],
                          });
                          await load();
                          refresh();
                          notify(
                            "Review decision recorded with an audit entry.",
                          );
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setActing(false);
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
                disabled={acting}
                onClick={async () => {
                  if (acting) return;
                  setActing(true);
                  setError("");
                  try {
                    await api("/reviewer/retry-jobs", {});
                    await load();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setActing(false);
                  }
                }}
              >
                Retry delayed jobs
              </button>
            )}
          </section>
        </>
      ) : !error ? (
        <Spinner />
      ) : null}
    </>
  );
}
