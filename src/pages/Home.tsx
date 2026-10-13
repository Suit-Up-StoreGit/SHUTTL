import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  homeCheck,
  readHomeCheck,
  returnSummary,
  comparisonMovement,
  activityChange,
  activityDateLabel,
  type HomeCheck,
} from "../home-context.ts";
import { Crest } from "../components/Community.tsx";
import {
  ShuttleMark,
  HomeEarnedMoment,
  CongratulateFriend,
  ReceivedRespect,
  LocalCourtLink,
  HomeNextStep,
} from "../components/HomeGrowth.tsx";
import ProgressBrief from "../components/ProgressBrief.tsx";
import {
  comparable,
  comparisonCopy,
  canReviewResult,
  resultMoment,
  publishedPlayedAt,
} from "../experience.ts";
import { RatingGuide } from "../components/Progress.tsx";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  MoveUpRight,
  Check,
  UsersRound,
  Trophy,
  X,
  Activity,
  ChevronRight,
  ChevronDown,
  Share2,
  MapPin,
  Heart,
  RefreshCw,
} from "lucide-react";
import { CategoryTabs, Gem, Evidence, Avatar } from "../components/UI.tsx";
import {
  api,
  ApiError,
  dateLabel,
  dateTimeLabel,
  errorMessage,
  type Page,
} from "../api.ts";
import {
  CATEGORIES,
  leagueFor,
  type Category,
  type PublicRating,
} from "../domain.ts";
export const HOME_CONCEPTS = [
  {
    id: "passport",
    name: "Player passport",
    description: "A calm, premium identity with your rating at the center.",
  },
  {
    id: "court",
    name: "On the court",
    description: "Fresh greens, court geometry and a clear next milestone.",
  },
  {
    id: "circle",
    name: "Circle first",
    description: "Your friends and their real results lead the experience.",
  },
  {
    id: "arena",
    name: "After hours",
    description: "A dark sporting identity with a sharper competitive edge.",
  },
  {
    id: "editorial",
    name: "Quiet confidence",
    description: "Airy editorial typography and understated progress.",
  },
];
export function RatingCard({
  rating,
  category,
  compact = false,
  showHistoryContext = true,
  opening = false,
  comparison,
}: {
  rating: PublicRating;
  category: Category;
  compact?: boolean;
  showHistoryContext?: boolean;
  opening?: boolean;
  comparison?: { player: any; detail: string; onSelect: () => void };
}) {
  const league = rating.score === null ? null : leagueFor(rating.score),
    gap =
      league && Number.isFinite(league.next)
        ? league.next - rating.score!
        : null;
  const progress =
    league && Number.isFinite(league.floor)
      ? Math.max(
          0,
          Math.min(
            100,
            ((rating.score! - league.floor) / (league.next - league.floor)) *
              100,
          ),
        )
      : null;
  return (
    <section
      key={
        opening
          ? category
          : `${category}:${rating.score ?? "placement"}:${rating.count}`
      }
      className={
        "rating-passport passport-settle " + (compact ? "compact" : "")
      }
      data-rating-state={rating.score === null ? "placement" : "published"}
      style={
        {
          "--passport-league-light": (league?.color || "#d4e8ab") + "18",
          "--rating-number-ratio": Math.max(
            2.4,
            (rating.score === null ? "—" : rating.score.toLocaleString("en-SG"))
              .length * 0.48,
          ),
        } as CSSProperties
      }
      aria-label={`${category} player passport`}
    >
      <svg
        className="passport-court-detail"
        viewBox="0 0 244 400"
        aria-hidden="true"
        focusable="false"
        fill="none"
      >
        <path
          className="passport-court-boundary"
          d="M49 38H195V360H49Z M49 199H195"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="passport-court-service"
          d="M60 38V360M184 38V360M49 56H195M49 342H195M49 151H195M49 247H195M122 56V151M122 247V342"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {opening && <ShuttleMark className="passport-shuttle-mark" />}
      <div className="passport-top">
        <span className="eyebrow">{category} rating</span>
        <span className="passport-code">
          S /{" "}
          {category === "Singles" ? "01" : category === "Doubles" ? "02" : "03"}
        </span>
      </div>
      {opening && rating.score === null ? (
        <div className="passport-placement-intro">
          <strong>
            {rating.count === 0
              ? "Your first rating."
              : rating.count === 4
                ? "One result to go."
                : rating.count >= 5
                  ? "Five results confirmed."
                  : "You’re on your way."}
          </strong>
          <span>Earned on court. Built from real matches.</span>
        </div>
      ) : (
        <div className="passport-number-row">
          <strong
            className="rating-number number-settle"
            key={`${category}:${rating.score}`}
          >
            {rating.score === null ? "—" : rating.score.toLocaleString("en-SG")}
          </strong>
          {rating.score !== null && (
            <div className="passport-seal">
              <div className="passport-seal-mark">
                <Gem league={rating.league} size={58} />
              </div>
              <span>{rating.league}</span>
            </div>
          )}
        </div>
      )}
      <div className="passport-status">
        <span>
          <span className="status-dot" />
          {opening && rating.score === null
            ? "Player-confirmed results"
            : rating.status === "Unrated"
              ? "Your next chapter starts here"
              : rating.status === "Placement"
                ? "Finding your starting point"
                : "Player-confirmed estimate"}
        </span>
        <Evidence rating={rating} />
      </div>
      {rating.score === null ? (
        <div className="placement-progress">
          <div
            className="placement-pips"
            aria-label={`${rating.count} of five confirmed results`}
            role="img"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span className={i < rating.count ? "filled" : ""} key={i}>
                {i < rating.count ? <Check size={12} /> : i + 1}
              </span>
            ))}
          </div>
          <p>
            {rating.count >= 5
              ? "Your estimate is being prepared."
              : rating.count === 0
                ? "Five confirmed results reveal your rating."
                : `${5 - rating.count} more confirmed ${category.toLowerCase()} ${5 - rating.count === 1 ? "result" : "results"} to reveal your estimate.`}
          </p>
        </div>
      ) : (
        <div className="passport-bottom">
          <div className="passport-progress-label">
            <span>
              {gap !== null
                ? `${gap} points to ${leagueFor(league!.next).name}`
                : "Grandmaster · keep growing your game"}
            </span>
            <span>{gap !== null ? league!.next : "Your personal best"}</span>
          </div>
          {progress !== null && Number.isFinite(progress) && (
            <div
              className="rating-progress"
              role="progressbar"
              aria-label="Rating within current league"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <span style={{ width: progress + "%" }} />
            </div>
          )}
          {showHistoryContext ? (
            <div className="passport-evidence-line">
              <span>
                Personal best <b>{rating.peak?.toLocaleString("en") ?? "—"}</b>
              </span>
              <span>
                <b>{rating.count}</b> confirmed results
              </span>
            </div>
          ) : (
            <p className="passport-footnote">
              Earned on court. Player-confirmed.
            </p>
          )}
        </div>
      )}
      {comparison && rating.score !== null && (
        <button className="passport-comparison" onClick={comparison.onSelect}>
          <Avatar player={comparison.player} small />
          <span>
            <small>IN YOUR CIRCLE · {category.toUpperCase()}</small>
            <strong>{comparison.player.name}</strong>
            <span>{comparison.detail}</span>
          </span>
          <ArrowUpRight size={18} />
        </button>
      )}
    </section>
  );
}
export function Home({
  data,
  category,
  setCategory,
  setPage,
  record,
  addFriend,
  share,
  open = () => {},
  compare = () => {},
  variant = "passport",
  mock = false,
  group,
  sync,
}: {
  data: any;
  category: Category;
  setCategory: (c: Category) => void;
  setPage: (
    p: Page,
    profileTab?: "history" | "settings" | "insights" | "goals",
  ) => void;
  record: () => void;
  addFriend: () => void;
  share?: () => void;
  open?: (id: string) => void;
  compare?: (id: string, category?: Category) => void;
  variant?: string;
  mock?: boolean;
  group?: (id: string) => void;
  sync?: { at: number | null; error: string; retry: () => void };
}) {
  const me = data.me,
    rating: PublicRating = me.ratings.find(
      (r: PublicRating) => r.category === category,
    );
  const friends = data.friends.map((p: any) => ({
    ...p,
    rating: p.ratings.find((r: PublicRating) => r.category === category),
  }));
  // A friends-only estimate order never awards a local title or includes
  // disconnected / pair-linked estimates in a direct comparison.
  const supported = friends.filter(
    (p: any) =>
      p.rating &&
      comparable(rating, p.rating) &&
      rating.status !== "Pair-linked" &&
      p.rating.status !== "Pair-linked",
  );
  const circle = supported.length
    ? [...supported, { ...me, rating }].sort(
        (a: any, b: any) =>
          b.rating.score - a.rating.score || a.id.localeCompare(b.id),
      )
    : [];
  const place =
    1 + supported.filter((p: any) => p.rating.score > rating.score!).length;
  const ownIndex = circle.findIndex((p: any) => p.id === me.id);
  const circleStart = Math.max(0, Math.min(ownIndex - 1, circle.length - 3));
  const circlePreview = circle.slice(circleStart, circleStart + 3);
  const [pinned, setPinned] = useState<{
    owner: string;
    category: Category;
    id: string | null;
  } | null>(null);
  useEffect(() => {
    try {
      setPinned({
        owner: me.id,
        category,
        id: localStorage.getItem(`shuttl:rival:${me.id}:${category}`),
      });
    } catch {
      setPinned(null);
    }
  }, [me.id, category]);
  const chosen =
    pinned && pinned.owner === me.id && pinned.category === category
      ? friends.find((p: any) => p.id === pinned.id)
      : null;
  const pending = (data.reviewResults || data.results).filter(canReviewResult);
  const results = data.results.filter((r: any) => r.category === category);
  const earned = [...results]
    .filter((r: any) => r.publishedRevisionId)
    .sort((a, b) => publishedPlayedAt(b).localeCompare(publishedPlayedAt(a)))
    .find(
      (r) =>
        ["reveal", "promotion", "best"].includes(resultMoment(r)?.kind || "") &&
        Date.parse(publishedPlayedAt(r)) >= Date.now() - 7 * 86400000 &&
        Date.parse(publishedPlayedAt(r)) <= Date.now(),
    );
  const moment = earned && resultMoment(earned);
  const recentEarnedMoment =
    moment &&
    ["reveal", "promotion", "best"].includes(moment.kind) &&
    Date.parse(publishedPlayedAt(earned)) >= Date.now() - 7 * 86400000 &&
    Date.parse(publishedPlayedAt(earned)) <= Date.now();
  const competition =
    data.competitionUpdates?.find(
      (update: any) =>
        update.category === category &&
        (!update.peerId ||
          supported.some(
            (p: any) =>
              p.id === update.peerId && p.rating.score > rating.score!,
          )),
    ) ||
    (data.competitionUpdate?.category === category
      ? data.competitionUpdate
      : null);
  const [feedScope, setFeedScope] = useState("all");
  const [briefOwner, setBriefOwner] = useState<string | null>(null);
  const [circleExpanded, setCircleExpanded] = useState(false);
  const [feedLimit, setFeedLimit] = useState(3);
  const [older, setOlder] = useState<any[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feedNeedsRefresh, setFeedNeedsRefresh] = useState(false);
  const [visitNotice, setVisitNotice] = useState("");
  const feedRequest = useRef(0),
    feedLoading = useRef(false);
  const currentOwner = useRef(me.id);
  currentOwner.current = me.id;
  const [visit, setVisit] = useState<{
    owner: string;
    check: HomeCheck | null;
    available: boolean;
  }>(() => {
    const saved = mock
      ? { check: null, available: false }
      : readHomeCheck(me.id);
    return { owner: me.id, ...saved };
  });
  useEffect(() => {
    const saved = mock
      ? { check: null, available: false }
      : readHomeCheck(me.id);
    const initial = saved.check || homeCheck(data);
    let available = saved.available;
    if (!mock && available && !saved.check)
      try {
        localStorage.setItem(
          `shuttl:home-check:${me.id}`,
          JSON.stringify(initial),
        );
      } catch {
        available = false;
      }
    setVisit({ owner: me.id, check: available ? initial : null, available });
    setOlder([]);
    setOlderCursor(undefined);
    setFeedError("");
    setVisitNotice("");
    setFeedNeedsRefresh(false);
    setFeedBusy(false);
    feedLoading.current = false;
    return () => {
      feedRequest.current++;
    };
  }, [me.id, mock]);
  const check = visit.owner === me.id ? visit.check : null;
  const returning = returnSummary(data, check);
  const newActivity =
    returning.newMatches + returning.updatedMatches + returning.comparisons;
  function caughtUp() {
    const next = homeCheck(data);
    next.items = Object.fromEntries(
      [
        ...Object.entries(next.items),
        ...Object.entries(check?.items || {}).filter(([id]) => !next.items[id]),
      ].slice(0, 400),
    );
    next.notifications = [
      ...new Set([...next.notifications, ...(check?.notifications || [])]),
    ].slice(0, 1000);
    try {
      localStorage.setItem(`shuttl:home-check:${me.id}`, JSON.stringify(next));
      setVisit({ owner: me.id, check: next, available: true });
      setVisitNotice("Current activity marked as seen on this device.");
    } catch {
      setVisit({ owner: me.id, check: null, available: false });
      setVisitNotice(
        "This browser could not save your check. Current activity is still available.",
      );
    }
    requestAnimationFrame(() =>
      document
        .getElementById("home-activity-title")
        ?.focus({ preventScroll: true }),
    );
  }
  async function loadOlder() {
    const cursor = olderCursor === undefined ? data.feedNext : olderCursor;
    if (!cursor || feedLoading.current) return;
    const owner = me.id,
      sequence = ++feedRequest.current;
    feedLoading.current = true;
    setFeedBusy(true);
    setFeedError("");
    try {
      const page = await api(`/activity?before=${encodeURIComponent(cursor)}`);
      if (owner !== currentOwner.current || sequence !== feedRequest.current)
        return;
      setOlder((entries) => [...entries, ...page.feed]);
      setOlderCursor(page.next);
      setFeedLimit((n) => n + 20);
    } catch (e) {
      if (owner === currentOwner.current && sequence === feedRequest.current) {
        setFeedError(errorMessage(e));
        setFeedNeedsRefresh(e instanceof ApiError && e.status === 404);
      }
    } finally {
      if (owner === currentOwner.current && sequence === feedRequest.current) {
        feedLoading.current = false;
        setFeedBusy(false);
      }
    }
  }
  const liveUnits = new Set(data.feed.map((f: any) => f.unitId || f.id));
  const acceptedIds = new Set(friends.map((p: any) => p.id));
  const entries = [
    ...data.feed,
    ...older.filter(
      (f) => !liveUnits.has(f.unitId || f.id) && acceptedIds.has(f.player.id),
    ),
  ];
  const groups = new Map<string, any[]>();
  for (const f of entries.sort((a: any, b: any) =>
    b.playedAt.localeCompare(a.playedAt),
  )) {
    if (feedScope === "category" && f.category !== category) continue;
    const key = f.unitId || f.id;
    groups.set(key, [...(groups.get(key) || []), f]);
  }
  const allFeed = [...groups.values()].filter(
    (group) =>
      feedScope !== "milestones" ||
      group.some((f) => f.score !== null && f.milestone),
  );
  const feed = allFeed.slice(0, feedLimit);
  useEffect(() => {
    setFeedLimit(3);
  }, [me.id, category, feedScope]);
  useEffect(() => {
    setCircleExpanded(false);
  }, [me.id, category]);
  const draft = (() => {
    try {
      const d = JSON.parse(
        localStorage.getItem("shuttl:draft:" + me.id) || "null",
      );
      return (
        d && (d.submissionUncertain || Date.now() - d.savedAt < 7 * 86400000)
      );
    } catch {
      return false;
    }
  })();
  const goal = me.goals?.[category];
  const goalReached =
    rating.score !== null && goal !== undefined && rating.score >= goal;
  const nextAbove = supported
    .filter((p: any) => p.rating.score > rating.score!)
    .sort((a: any, b: any) => a.rating.score - b.rating.score)[0];
  const nextAtOrBelow = supported
    .filter((p: any) => p.rating.score <= rating.score!)
    .sort((a: any, b: any) => b.rating.score - a.rating.score)[0];
  const openingFriend = !me.breakMode
    ? chosen && supported.some((p: any) => p.id === chosen.id)
      ? chosen
      : nextAbove || nextAtOrBelow
    : null;
  const openingGap = openingFriend
    ? openingFriend.rating.score - rating.score!
    : 0;
  const movement =
    !me.breakMode && comparisonMovement(check, rating, openingFriend, category);
  const firstVisit = me.ratings.every((r: PublicRating) => r.count === 0);
  return (
    <div className={`home-view experience-home home-focus concept-${variant}`}>
      <header className="home-heading">
        <div>
          <h1>
            {variant === "editorial"
              ? "Every match matters."
              : variant === "arena"
                ? "Make your next move."
                : "Your game."}
          </h1>
          <p>
            {me.breakMode
              ? "Your rating stays here while you take time away."
              : firstVisit
                ? "See your level. Follow your friends."
                : `Welcome back, ${me.name.split(" ")[0]}.`}
          </p>
        </div>
        <button
          className="button record-button"
          aria-label={draft ? "Continue your draft" : "Record a match"}
          onClick={record}
        >
          <span className="record-action-icon">
            <Plus size={19} />
          </span>
          <span>{draft ? "Continue draft" : "Record a match"}</span>
          <ArrowUpRight size={18} />
        </button>
      </header>
      <CategoryTabs value={category} onChange={setCategory} />
      {newActivity > 0 && !me.breakMode && (
        <section className="home-return" aria-label="Since your last check">
          <span className="home-return-mark">
            <Activity size={18} />
          </span>
          <div>
            <strong>Since your last check</strong>
            <p>
              {returning.newMatches > 0 &&
                `${returning.newMatches} new ${returning.newMatches === 1 ? "match" : "matches"}`}
              {returning.updatedMatches > 0 &&
                `${returning.newMatches ? " · " : ""}${returning.updatedMatches} updated`}
              {returning.milestones > 0 &&
                ` · ${returning.milestones} earned ${returning.milestones === 1 ? "milestone" : "milestones"}`}
              {returning.comparisons > 0 &&
                `${returning.newMatches || returning.updatedMatches ? " · " : ""}${returning.comparisons} comparison ${returning.comparisons === 1 ? "update" : "updates"}`}
            </p>
            <small>Compared with your previous check on this device.</small>
          </div>
          <button className="text-button" onClick={caughtUp}>
            Caught up <Check size={16} />
          </button>
        </section>
      )}
      {sync?.error && (
        <section className="home-sync-error" role="status">
          <div>
            <strong>Showing your last loaded court.</strong>
            <p>{sync.error}</p>
          </div>
          <button className="text-button" onClick={sync.retry}>
            <RefreshCw size={16} /> Refresh court
          </button>
        </section>
      )}
      {pending.length > 0 && (
        <button className="pending-banner" onClick={() => setPage("inbox")}>
          <Check size={19} />
          <span>
            <strong>
              {pending.length}{" "}
              {pending.length === 1 ? "result needs" : "results need"} your
              review
            </strong>
            <small>Check the score before it counts.</small>
          </span>
          <ArrowRight size={18} />
        </button>
      )}
      <div className="home-grid">
        <div className="home-main">
          <RatingCard
            rating={rating}
            category={category}
            opening
            comparison={
              openingFriend
                ? {
                    player: openingFriend,
                    detail:
                      movement ||
                      (openingGap === 0
                        ? "Level with your estimate"
                        : `${Math.abs(openingGap).toLocaleString("en")} points ${openingGap > 0 ? "ahead of" : "behind"} your estimate`),
                    onSelect: () => compare(openingFriend.id),
                  }
                : undefined
            }
          />
          <div className="home-passport-tools">
            <RatingGuide category={category} />
            <button
              className="text-button"
              onClick={() => setPage("profile", "history")}
            >
              History <ArrowUpRight size={15} />
            </button>
            {share && rating.score !== null && (
              <button className="text-button" onClick={share}>
                <Share2 size={15} /> Share passport
              </button>
            )}
          </div>
          {!me.breakMode && friends.length > 0 && (
            <section
              className="home-competition"
              aria-label="Your circle estimates"
              data-expanded={circleExpanded}
            >
              <div className="home-section-title">
                <h2>Your circle</h2>
                <button
                  className="text-button"
                  onClick={() => setPage("friends")}
                >
                  Compare friends <ArrowUpRight size={16} />
                </button>
              </div>
              <button
                className="home-circle-toggle"
                aria-expanded={circleExpanded}
                aria-controls="home-circle-detail"
                onClick={() => setCircleExpanded((expanded) => !expanded)}
              >
                <span>Your circle</span>
                <span>
                  {circle.length
                    ? `${circle.filter((p: any) => p.rating.score === rating.score).length > 1 ? "Tied " : ""}#${place} / ${circle.length}`
                    : "View friends"}
                </span>
                <ChevronDown size={18} />
              </button>
              {competition && (
                <button
                  className="lead-update"
                  onClick={() => setPage("friends")}
                >
                  <MoveUpRight size={19} />
                  <span>
                    <strong>{competition.title}</strong>
                    <small>
                      {competition.peerId
                        ? `Current gap: ${supported.find((p: any) => p.id === competition.peerId)!.rating.score - rating.score!} points`
                        : competition.detail}{" "}
                      · {dateTimeLabel(competition.createdAt, me.timezone)}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              )}
              <div id="home-circle-detail" className="home-circle-detail">
                {circle.length ? (
                  <>
                    <div className="circle-position">
                      <strong>
                        {circle.filter(
                          (p: any) => p.rating.score === rating.score,
                        ).length > 1
                          ? "Tied "
                          : ""}
                        #{place}
                        <span> / {circle.length}</span>
                      </strong>
                      <p>
                        You + {supported.length} comparable{" "}
                        {supported.length === 1 ? "friend" : "friends"}
                        <span>
                          {category} estimates · shared playing evidence
                        </span>
                      </p>
                    </div>
                    <ol
                      className="home-circle-list"
                      aria-label="Friends-only estimate snapshot"
                    >
                      {circlePreview.map((p: any) => (
                        <li key={p.id} data-own={p.id === me.id}>
                          <span className="circle-order">
                            {1 +
                              circle.filter(
                                (other: any) =>
                                  other.rating.score > p.rating.score,
                              ).length}
                          </span>
                          <button
                            onClick={
                              p.id === me.id
                                ? () => setPage("profile")
                                : () => compare(p.id)
                            }
                            aria-label={
                              p.id === me.id
                                ? "Open your player passport"
                                : `Compare with ${p.name}`
                            }
                          >
                            <Avatar player={p} small />
                            <span className="circle-player-name">
                              {p.id === me.id ? "You" : p.name}
                            </span>
                            <strong>
                              {p.rating.score.toLocaleString("en")}
                            </strong>
                            <ChevronRight size={15} />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <p className="home-scope-note">
                      Accepted friends with comparable estimates. A developing
                      comparison, not a local title.
                    </p>
                  </>
                ) : (
                  <div className="home-circle-empty">
                    <UsersRound size={23} />
                    <div>
                      <strong>
                        {friends.length
                          ? rating.score === null
                            ? "Reveal your rating to compare."
                            : rating.status === "Pair-linked"
                              ? "A partnership estimate, for now."
                              : "Your playing groups aren’t connected yet."
                          : "Bring your court with you."}
                      </strong>
                      <p>
                        {friends.length
                          ? rating.score === null
                            ? `Five confirmed ${category.toLowerCase()} matches reveal your estimate. Direct comparisons appear when the evidence supports them.`
                            : rating.status === "Pair-linked"
                              ? "Playing with one regular partner makes each person’s contribution hard to separate. Different partners help build an individual estimate; you can still follow your friends’ progress."
                              : "Matches linking your playing groups can support a comparison. Follow each player’s progress while those connections grow."
                          : "Add the people you play with. Their real progress belongs here."}
                      </p>
                      <button
                        className="text-button"
                        onClick={
                          friends.length ? () => setPage("friends") : addFriend
                        }
                      >
                        {friends.length ? "See your friends" : "Add a friend"}{" "}
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
                {chosen && (
                  <div className="rival-strip home-pinned">
                    <span className="eyebrow">YOUR CHOSEN COMPARISON</span>
                    <div>
                      <button
                        className="home-pinned-player"
                        onClick={() => compare(chosen.id)}
                      >
                        <Avatar player={chosen} small />
                        <span>
                          <strong>{chosen.name}</strong>
                          <small>{comparisonCopy(rating, chosen.rating)}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Unpin home comparison"
                        onClick={() => {
                          try {
                            localStorage.removeItem(
                              `shuttl:rival:${me.id}:${category}`,
                            );
                          } catch {}
                          setPinned(null);
                        }}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          {recentEarnedMoment && (
            <HomeEarnedMoment
              earned={earned}
              moment={moment}
              timezone={me.timezone}
              open={() => open(earned.id)}
            />
          )}
          {rating.count === 0 && (
            <div className="home-start-note">
              <Check size={17} />
              <p>
                Agree before playing, or confirm the exact result with everyone
                afterward.
              </p>
              <button
                className="text-button"
                onClick={() => setPage("agreements")}
              >
                Rated agreements <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          <div className="home-personal-links">
            <button
              className="text-button"
              onClick={() => setPage("profile", "insights")}
            >
              <Activity size={16} />
              Playing insights
            </button>
            <LocalCourtLink
              me={me}
              friends={friends}
              compare={(id) => compare(id, category)}
              court={data.localCourt}
              category={category}
              open={() => setPage("rankings")}
            />
            {sync?.at && !sync.error && (
              <span className="home-last-sync">
                Updated{" "}
                {new Intl.DateTimeFormat("en", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: me.timezone,
                }).format(new Date(sync.at))}
              </span>
            )}
            {!mock && !visit.available && (
              <span className="home-last-sync">
                This browser cannot remember your previous check. Current
                activity is still available.
              </span>
            )}
            <button
              className="text-button"
              onClick={() => setPage("profile", "goals")}
            >
              <Sparkles size={16} />
              {goal === undefined
                ? "Set rating goal"
                : goalReached
                  ? "Goal reached · next target"
                  : `Your goal · ${goal}`}
            </button>
          </div>
          <HomeNextStep
            results={results}
            rating={rating}
            category={category}
            brief={() => setBriefOwner(me.id)}
            open={open}
          />
        </div>
        <section
          className="home-social"
          id="court-activity"
          aria-labelledby="home-activity-title"
        >
          <div className="home-section-title">
            <div>
              <span className="eyebrow">FROM YOUR COURT</span>
              <h2 id="home-activity-title" tabIndex={-1}>
                Friends’ activity
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="Add a player"
              onClick={addFriend}
            >
              <Plus size={19} />
            </button>
          </div>
          {visitNotice && (
            <p className="home-last-sync" role="status">
              {visitNotice}
            </p>
          )}
          <div
            className="home-feed-tabs"
            role="group"
            aria-label="Activity categories"
          >
            <button
              aria-pressed={feedScope === "all"}
              onClick={() => setFeedScope("all")}
            >
              All play
            </button>
            <button
              aria-label={`${category} activity`}
              aria-pressed={feedScope === "category"}
              onClick={() => setFeedScope("category")}
            >
              {category}
            </button>
            <button
              aria-pressed={feedScope === "milestones"}
              aria-label="Milestone activity, all categories"
              onClick={() => setFeedScope("milestones")}
            >
              Milestones
            </button>
          </div>
          {data.circles?.length > 0 && (
            <div
              className="home-group-links"
              aria-label="Your badminton groups"
            >
              {data.circles.slice(0, 3).map((circle: any) => (
                <button
                  key={circle.id}
                  onClick={() =>
                    group ? group(circle.id) : setPage("friends")
                  }
                >
                  <Crest kind={circle.crest || "shuttle"} />
                  <span>
                    {circle.name}
                    <small>
                      {circle.members} accepted{" "}
                      {circle.members === 1 ? "member" : "members"}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          )}
          <ReceivedRespect items={data.receivedRespect || []} open={open} />
          {feed.length ? (
            <div className="home-feed-list">
              {feed.map((group: any[]) => {
                const first = group[0],
                  shared = data.results.find((r: any) => r.id === first.unitId);
                const isShared = !!shared || first.shared === true;
                const highlight =
                  group.find(
                    (f) => f.score !== null && f.milestone === "promotion",
                  ) ||
                  group.find(
                    (f) => f.score !== null && f.milestone === "reveal",
                  ) ||
                  group.find((f) => f.score !== null && f.milestone === "best");
                const change = liveUnits.has(first.unitId || first.id)
                  ? activityChange(group, check)
                  : null;
                return (
                  <article
                    className="home-feed-card"
                    key={first.unitId || first.id}
                    data-new={change || undefined}
                    data-moment={highlight?.milestone || "match"}
                  >
                    <div className="home-feed-people">
                      <div className="home-feed-avatars">
                        {group.slice(0, 3).map((f) => (
                          <Avatar key={f.id} player={f.player} small />
                        ))}
                      </div>
                      <div>
                        <strong>
                          {first.category} ·{" "}
                          {activityDateLabel(first.playedAt, me.timezone)}
                        </strong>
                        <span>
                          {group.length > 1
                            ? `${group.length} friends · same confirmed match`
                            : "Player-confirmed match"}
                        </span>
                      </div>
                      {change && (
                        <span className="home-new-label">
                          {change === "new" ? "New" : "Updated"}
                        </span>
                      )}
                    </div>
                    {highlight && (
                      <h3>
                        <Gem
                          league={
                            highlight.league || leagueFor(highlight.score).name
                          }
                          size={22}
                        />
                        {highlight.milestone === "reveal"
                          ? "A starting rating, revealed."
                          : highlight.milestone === "best"
                            ? "A new personal best."
                            : `${highlight.league || leagueFor(highlight.score).name} reached.`}
                      </h3>
                    )}
                    <div className="home-feed-facts">
                      {group.map((f) => (
                        <div key={f.id}>
                          <button
                            className="feed-player-label"
                            onClick={() => {
                              compare(f.player.id, f.category);
                            }}
                            aria-label={`View ${f.player.name}'s ${f.category.toLowerCase()} progress`}
                          >
                            {f.player.name} <ArrowUpRight size={13} />
                          </button>
                          <div className="feed-numbers">
                            <strong>
                              {f.score === null
                                ? "—"
                                : f.score.toLocaleString("en")}
                            </strong>
                            {f.delta !== null && (
                              <span
                                className={
                                  f.delta > 0
                                    ? "feed-gain"
                                    : f.delta < 0
                                      ? "feed-loss"
                                      : "feed-level"
                                }
                              >
                                {f.delta > 0 ? "+" : ""}
                                {f.delta}
                                <span className="sr-only"> rating points</span>
                              </span>
                            )}
                          </div>
                          <span>
                            {f.score === null
                              ? "Building a starting rating"
                              : `${f.won ? "Win" : "Loss"} · rating after this result`}
                          </span>
                          {f.milestone && f.score !== null && (
                            <span className="feed-earned">
                              <Sparkles size={12} />
                              {f.milestone === "reveal"
                                ? "First rating"
                                : f.milestone === "promotion"
                                  ? `${f.league || leagueFor(f.score).name} reached`
                                  : "Personal best"}
                            </span>
                          )}
                          <CongratulateFriend
                            key={`${me.id}:${f.unitId}:${f.revisionId}:${f.player.id}:${f.milestone}:${f.score}`}
                            entry={f}
                            mock={mock}
                            refresh={sync?.retry}
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      className="text-button feed-open"
                      onClick={() => {
                        if (isShared) open(first.unitId);
                        else {
                          compare(first.player.id, first.category);
                        }
                      }}
                    >
                      {isShared ? "Open shared result" : "View player progress"}
                      <ArrowUpRight size={16} />
                    </button>
                    {isShared && (
                      <button
                        className="text-button home-respect"
                        onClick={() => open(first.unitId)}
                      >
                        <Heart size={15} /> Acknowledge players{" "}
                        <ArrowUpRight size={15} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="home-feed-empty">
              <Activity size={27} />
              <h3>
                {friends.length
                  ? "The next match starts the story."
                  : "Your court, connected."}
              </h3>
              <p>
                {friends.length
                  ? feedScope === "milestones"
                    ? "No earned milestones in the loaded activity yet. Keep following your friends’ genuine progress, or explore older matches."
                    : `No recent ${feedScope === "all" ? "confirmed play" : category.toLowerCase() + " activity"} is loaded. Your friends’ results will appear here once confirmed.`
                  : "Find your friends. Follow their matches, rating changes and earned milestones."}
              </p>
              <button
                className="button secondary"
                onClick={friends.length ? () => setPage("friends") : addFriend}
              >
                {friends.length ? "See your circle" : "Find a player"}
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          {allFeed.length > feedLimit && (
            <button
              className="button secondary home-feed-more"
              onClick={() => setFeedLimit((n) => n + 3)}
            >
              Show more activity <ArrowRight size={16} />
            </button>
          )}
          {allFeed.length <= feedLimit &&
            (olderCursor === undefined ? data.feedNext : olderCursor) && (
              <button
                className="button secondary home-feed-more"
                disabled={feedBusy}
                onClick={loadOlder}
              >
                {feedBusy
                  ? "Loading older matches…"
                  : feedError
                    ? "Retry older activity"
                    : "Load older matches"}{" "}
                <ArrowRight size={16} />
              </button>
            )}
          {feedError && (
            <p className="home-feed-error" role="alert">
              {feedError}
            </p>
          )}
          {feedNeedsRefresh && sync && (
            <button
              className="text-button"
              onClick={() => {
                setFeedError("");
                setFeedNeedsRefresh(false);
                setOlder([]);
                setOlderCursor(undefined);
                sync.retry();
              }}
            >
              Refresh activity <RefreshCw size={16} />
            </button>
          )}
          {feed.length > 0 && (
            <p className="home-scope-note home-feed-footnote">
              Recent player-confirmed activity. This is a snapshot, not complete
              match history. Only accepted friends are shown.
            </p>
          )}
        </section>
      </div>
      {briefOwner === me.id && (
        <ProgressBrief
          key={me.id}
          me={me}
          category={category}
          results={data.results}
          mock={mock}
          close={() => setBriefOwner(null)}
          goals={() => {
            setBriefOwner(null);
            setPage("profile", "goals");
          }}
          insights={() => {
            setBriefOwner(null);
            setPage("profile", "insights");
          }}
          openResult={(id) => {
            setBriefOwner(null);
            open(id);
          }}
        />
      )}
    </div>
  );
}

export function mockDashboard(doublesScore = 1628) {
  const ratings = (d: number, s = 1486) =>
    CATEGORIES.map((category) => ({
      category,
      score: category === "Mixed" ? null : category === "Singles" ? s : d,
      count: category === "Mixed" ? 0 : 38,
      peak:
        category === "Mixed"
          ? null
          : category === "Singles"
            ? Math.max(1532, s)
            : Math.max(1664, d),
      status: category === "Mixed" ? "Unrated" : "Developing",
      league:
        category === "Mixed"
          ? null
          : leagueFor(category === "Singles" ? s : d).name,
      partnerCount: 4,
      comparisonClass: "sample",
      lastPlayed: new Date().toISOString(),
    }));
  const friends = [
    {
      id: "p",
      name: "Priya Lim",
      username: "priyalim",
      ratings: ratings(1642, 1532),
    },
    {
      id: "c",
      name: "Chloe Tan",
      username: "chloetan",
      ratings: ratings(1620, 1450),
    },
    {
      id: "k",
      name: "Kai Lee",
      username: "kailee",
      ratings: ratings(1664, 1570),
    },
  ];
  const meSample = { id: "sample", name: "Simon", username: "featherballer" };
  const samples = CATEGORIES.flatMap((category) => {
    if (category === "Mixed") return [];
    const values =
      category === "Singles"
        ? [1410, 1432, 1424, 1451, 1439, 1458, 1471, 1469, 1486]
        : [
            1502,
            1493,
            1526,
            1517,
            1548,
            1579,
            1561,
            1588,
            1596,
            1581,
            1620,
            doublesScore,
          ];
    return values.map((after, i) => {
      const before = values[i - 1] || after - 12,
        won = after > before;
      return {
        id: "sample-" + category + "-" + i,
        category,
        status: "rated",
        format: "ONE_21",
        playedAt: new Date(
          Date.now() - (values.length - i) * 86400000,
        ).toISOString(),
        players:
          category === "Singles"
            ? [meSample, friends[0]]
            : [meSample, friends[2], friends[0], friends[1]],
        games: won ? [[21, 17]] : [[17, 21]],
        ownParticipant: "sample",
        publishedRevisionId: "sample-published",
        revisionId: "sample-published",
        revisionNumber: 1,
        approvals: [],
        ratingChanges: {
          sample: {
            before,
            after,
            delta: after - before,
            count: 39 - values.length + i,
            won,
            peakBefore: Math.max(1664, before),
          },
        },
        ownProgress: { count: 39 - values.length + i, won },
      };
    });
  });
  return {
    me: {
      id: "sample",
      name: "Simon",
      username: "featherballer",
      district: "Tampines",
      country: "SG",
      city: "Singapore",
      localOptIn: true,
      timezone: "Asia/Singapore",
      goals: { Doubles: 1700 },
      ratings: ratings(doublesScore),
    },
    friends,
    results: samples,
    circles: [],
    unread: 2,
    localCourt: {
      label: "Tampines · Singapore",
      count: 4,
      sampled: false,
      active: 4,
      published: { Singles: 4, Doubles: 4, Mixed: 0 },
      people: friends,
    },
    receivedRespect: [],
    feed: [
      {
        id: "sample-priya-doubles",
        unitId: "sample-circle-match",
        player: friends[0],
        category: "Doubles",
        playedAt: new Date(Date.now() - 3600000).toISOString(),
        score: 1642,
        delta: 12,
        won: true,
      },
      {
        id: "sample-chloe-doubles",
        unitId: "sample-circle-match",
        player: friends[1],
        category: "Doubles",
        playedAt: new Date(Date.now() - 3600000).toISOString(),
        score: 1620,
        delta: -6,
        won: false,
      },
      {
        id: "sample-kai-singles",
        unitId: "sample-kai-match",
        player: friends[2],
        category: "Singles",
        playedAt: new Date(Date.now() - 10800000).toISOString(),
        score: 1570,
        delta: 12,
        milestone: "best",
        canCongratulate: true,
        revisionId: "sample-kai-published",
        won: true,
      },
      {
        id: "sample-chloe-previous",
        unitId: "sample-chloe-match",
        player: friends[1],
        category: "Doubles",
        playedAt: new Date(Date.now() - 86400000).toISOString(),
        score: 1626,
        delta: 8,
        won: true,
      },
    ],
  };
}
