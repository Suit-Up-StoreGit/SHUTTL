import { useEffect, useState, type CSSProperties } from "react";
import { comparable, comparisonCopy, periodSummary } from "../experience.ts";
import {
  RatingGuide,
  ProgressChart,
  ResultReward,
} from "../components/Progress.tsx";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  MoveUpRight,
  Check,
  UsersRound,
  Target,
  Activity,
  ChevronRight,
} from "lucide-react";
import {
  CategoryTabs,
  Gem,
  Evidence,
  Avatar,
  SectionHeading,
  Empty,
} from "../components/UI.tsx";
import { api, dateLabel, type Page } from "../api.ts";
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
}: {
  rating: PublicRating;
  category: Category;
  compact?: boolean;
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
      className={"rating-passport " + (compact ? "compact" : "")}
      style={
        {
          "--rating-number-ratio": Math.max(
            2.4,
            (rating.score === null ? "—" : rating.score.toLocaleString("en-SG"))
              .length * 0.48,
          ),
        } as CSSProperties
      }
      aria-label={`${category} player passport`}
    >
      <div className="passport-top">
        <span className="eyebrow">{category} rating</span>
        <span className="passport-code">
          S /{" "}
          {category === "Singles" ? "01" : category === "Doubles" ? "02" : "03"}
        </span>
      </div>
      <div className="passport-number-row">
        <strong className="rating-number">
          {rating.score === null ? "—" : rating.score.toLocaleString("en-SG")}
        </strong>
        {rating.score !== null && (
          <div className="passport-seal">
            <Gem league={rating.league} size={58} />
            <span>{rating.league}</span>
          </div>
        )}
      </div>
      <div className="passport-status">
        <span>
          <span className="status-dot" />
          {rating.status === "Unrated"
            ? "Your next chapter starts here"
            : rating.status === "Placement"
              ? "Finding your starting point"
              : rating.status === "Established"
                ? "Independent playing evidence"
                : "Your developing estimate"}
        </span>
        <Evidence rating={rating} />
      </div>
      {rating.score === null ? (
        <div className="placement-progress">
          <div
            className="placement-pips"
            aria-label={`${rating.count} of five confirmed results`}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span className={i < rating.count ? "filled" : ""} key={i}>
                {i < rating.count ? <Check size={12} /> : i + 1}
              </span>
            ))}
          </div>
          <p>
            {rating.count === 0
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
          <p className="passport-footnote">
            Earned on court. Player-confirmed.
          </p>
        </div>
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
  open = () => {},
  compare = () => {},
  variant = "passport",
  mock = false,
}: {
  data: any;
  category: Category;
  setCategory: (c: Category) => void;
  setPage: (p: Page, profileTab?: "history" | "settings") => void;
  record: () => void;
  addFriend: () => void;
  open?: (id: string) => void;
  compare?: (id: string) => void;
  variant?: string;
  mock?: boolean;
}) {
  const me = data.me,
    rating: PublicRating = me.ratings.find(
      (r: PublicRating) => r.category === category,
    );
  const friends = data.friends.map((p: any) => ({
    ...p,
    rating: p.ratings.find((r: PublicRating) => r.category === category),
  }));
  const supported = friends
    .filter((p: any) => comparable(rating, p.rating))
    .sort(
      (a: any, b: any) =>
        Math.abs(a.rating.score - rating.score!) -
        Math.abs(b.rating.score - rating.score!),
    );
  const [pinned, setPinned] = useState<string | null>(null);
  const rival = supported.find((p: any) => p.id === pinned) || supported[0];
  useEffect(() => {
    try {
      setPinned(localStorage.getItem(`shuttl:rival:${me.id}:${category}`));
    } catch {}
  }, [me.id, category]);
  const results = data.results.filter((r: any) => r.category === category);
  const latest = [...results]
    .filter((r: any) => r.publishedRevisionId)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))[0];
  const pending = data.results.filter(
    (r: any) =>
      ["pending", "correction_pending"].includes(r.status) &&
      !r.approvals.includes(r.ownParticipant),
  );
  const groups = new Map<string, any[]>();
  for (const f of data.feed.filter((f: any) => f.category === category)) {
    const key = f.unitId || f.id;
    groups.set(key, [...(groups.get(key) || []), f]);
  }
  const feed = [...groups.values()].slice(0, 3);
  const [week, setWeek] = useState<any>(null);
  useEffect(() => {
    if (mock) return;
    let active = true;
    setWeek(null);
    api(`/insights?category=${category}&period=7`)
      .then((v) => {
        if (active) setWeek(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [me.id, category, rating.count, rating.score, mock]);
  const summary =
    week?.category === category ? week : periodSummary(data.results, category);
  const goal = me.goals?.[category],
    goalGap =
      rating.score !== null && goal !== undefined
        ? Math.max(0, goal - rating.score)
        : null;
  const draft = (() => {
    try {
      const d = JSON.parse(
        localStorage.getItem("shuttl:draft:" + me.id) || "null",
      );
      return d && Date.now() - d.savedAt < 7 * 86400000;
    } catch {
      return false;
    }
  })();
  const rivalry = !me.breakMode && (
    <section className="rival-strip" aria-label="Closest supported comparison">
      {rival ? (
        <>
          <div className="rival-kicker">
            <span className="eyebrow">
              {pinned === rival.id
                ? "YOUR CHOSEN COMPARISON"
                : "CLOSEST SUPPORTED RIVAL"}
            </span>
            <span className="pill">{category}</span>
          </div>
          <button className="rival-content" onClick={() => compare(rival.id)}>
            <Avatar player={rival} />
            <div>
              <strong>{rival.name}</strong>
              <p>{comparisonCopy(rating, rival.rating)}</p>
            </div>
            <b>{rival.rating.score}</b>
            <ChevronRight size={18} />
          </button>
          <p className="rival-note">From shared playing evidence.</p>
        </>
      ) : (
        <>
          <span className="eyebrow">GOOD RIVALS START WITH REAL PLAY</span>
          <h2>
            {friends.length
              ? "Build a shared playing picture."
              : "Bring your court with you."}
          </h2>
          <p>
            {friends.length
              ? "Your circle’s estimates are visible. A precise lead needs supported shared evidence."
              : "Add the people you already play with. Compare progress as your results build."}
          </p>
          <button
            className="text-button"
            onClick={friends.length ? () => setPage("friends") : addFriend}
          >
            {friends.length ? "See your circle" : "Find a player"}
            <ArrowUpRight size={16} />
          </button>
        </>
      )}
    </section>
  );
  const weeklyRecap = (
    <section className="panel weekly-panel">
      <SectionHeading title="Your last seven days" />
      <div className="weekly-facts">
        <div>
          <strong>{summary.count}</strong>
          <span>confirmed results</span>
        </div>
        <div>
          <strong>{summary.count ? summary.wins : "—"}</strong>
          <span>recorded wins</span>
        </div>
        <div>
          <strong>
            {summary.delta === null
              ? "—"
              : `${summary.delta >= 0 ? "+" : ""}${summary.delta}`}
          </strong>
          <span>visible rating change</span>
        </div>
      </div>
      <p className="form-help">
        {summary.count
          ? week
            ? week.limited
              ? "Based on your latest 2,000 published results in this period."
              : "Based on your published history for this period."
            : "Every result adds context. This recap covers the recent history loaded here."
          : "A quiet week is okay. Your rating does not decay for taking time away."}
      </p>
    </section>
  );
  return (
    <div className={`home-view experience-home concept-${variant}`}>
      <header className="home-heading">
        <div>
          <span className="eyebrow">
            {me.breakMode ? "AT YOUR PACE" : "YOUR COURT / YOUR PROGRESS"}
          </span>
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
              : `Welcome back, ${me.name.split(" ")[0]}.`}
          </p>
        </div>
        <button
          className="button record-button"
          aria-label={draft ? "Continue your draft" : "Record a result"}
          onClick={record}
        >
          <Plus size={18} />
          {draft ? "Continue draft" : "Record result"}
          <ArrowUpRight size={17} />
        </button>
      </header>
      <CategoryTabs value={category} onChange={setCategory} />
      {pending.length > 0 && (
        <button className="pending-banner" onClick={() => setPage("inbox")}>
          <Check size={20} />
          <span>
            <strong>
              {pending.length}{" "}
              {pending.length === 1 ? "result needs" : "results need"} your
              review
            </strong>
            <small>Read the score. Confirm, correct or ask for review.</small>
          </span>
          <ArrowRight size={18} />
        </button>
      )}
      <div className="home-grid">
        <div className="home-main">
          {variant === "circle" && rivalry}
          {variant === "court" && weeklyRecap}
          <RatingCard rating={rating} category={category} />
          <RatingGuide category={category} />
          {!me.breakMode && data.competitionUpdate && (
            <button className="lead-update" onClick={() => setPage("friends")}>
              <MoveUpRight size={20} />
              <span>
                <strong>{data.competitionUpdate.title}</strong>
                <small>
                  {data.competitionUpdate.detail} ·{" "}
                  {dateLabel(data.competitionUpdate.createdAt, me.timezone)}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          )}
          {variant !== "circle" && rivalry}
          {!me.breakMode && feed.length > 0 && (
            <a className="activity-peek" href="#court-activity">
              <Activity size={20} />
              <span>
                <strong>
                  {feed[0].map((f: any) => f.player.name).join(" & ")} added a
                  confirmed result
                </strong>
                <small>
                  {category} · {dateLabel(feed[0][0].playedAt, me.timezone)} ·
                  See shared activity
                </small>
              </span>
              <ChevronRight size={17} />
            </a>
          )}
          {latest && (
            <section className="latest-result">
              <SectionHeading
                title="Your latest chapter"
                action="Open result"
                onClick={() => open(latest.id)}
              />
              <ResultReward result={latest} small />
              <p className="form-help">
                {dateLabel(latest.playedAt, me.timezone)} ·{" "}
                {(latest.publishedResult?.games || latest.games)
                  .map((g: number[]) => g.join("–"))
                  .join(" / ")}{" "}
                ·{" "}
                {latest.status === "rated"
                  ? "Published"
                  : "Published history has a pending change"}
              </p>
            </section>
          )}
          {rating.count === 0 && (
            <section className="first-court">
              <span className="eyebrow">THREE STEPS TO A CLEARER PICTURE</span>
              <ol>
                <li>
                  <b>Find your regular players</b>
                  <span>
                    Add friends or create a private nickname invitation when
                    recording.
                  </span>
                </li>
                <li>
                  <b>Make rated play a choice</b>
                  <span>
                    Agree before your session, or have everyone approve
                    afterward.
                  </span>
                </li>
                <li>
                  <b>Record a completed match</b>
                  <span>
                    Your fifth confirmed result reveals a starting estimate.
                  </span>
                </li>
              </ol>
              <button
                className="text-button"
                onClick={() => setPage("agreements")}
              >
                Set up your rated session <ArrowUpRight size={16} />
              </button>
            </section>
          )}
          {variant !== "court" && weeklyRecap}
          <section className="panel progress-panel">
            <SectionHeading
              title="Your progress"
              action="Full history"
              onClick={() => setPage("profile", "history")}
            />
            <ProgressChart
              results={results}
              timezone={me.timezone}
              rating={rating}
            />
            {mock && results.length === 0 && rating.score !== null && (
              <p className="form-help">
                Design sample: no invented history line.
              </p>
            )}
          </section>
        </div>
        <aside className="home-aside">
          <section className="panel circle-panel">
            <SectionHeading
              title="Your circle"
              action="View all"
              onClick={() => setPage("friends")}
            />
            {friends.length ? (
              friends.slice(0, 3).map((p: any) => (
                <button
                  className="friend-line friend-open"
                  key={p.id}
                  onClick={() => compare(p.id)}
                >
                  <Avatar player={p} />
                  <div className="friend-text">
                    <strong>{p.name}</strong>
                    <span>{comparisonCopy(rating, p.rating)}</span>
                  </div>
                  <div className="friend-score">
                    <strong>{p.rating.score ?? "—"}</strong>
                    <small>{p.rating.status}</small>
                  </div>
                </button>
              ))
            ) : (
              <Empty
                title="Find your people"
                action="Add a friend"
                onClick={addFriend}
              >
                Start with someone you already share a court with.
              </Empty>
            )}
            <button className="invite-link" onClick={addFriend}>
              <Plus size={16} /> Add a player <ArrowUpRight size={16} />
            </button>
          </section>
          <section
            className="panel activity-panel"
            id="court-activity"
            tabIndex={-1}
          >
            <SectionHeading title="Around your court" />
            {feed.length ? (
              feed.map((group: any[]) => (
                <div
                  className="activity-row"
                  key={group[0].unitId || group[0].id}
                >
                  <span className="activity-dot">
                    <Activity size={16} />
                  </span>
                  <div>
                    <p>
                      <strong>
                        {group.map((f) => f.player.name).join(" & ")}
                      </strong>{" "}
                      {group.length > 1
                        ? "played the same match"
                        : group[0].milestone === "reveal"
                          ? "revealed a starting rating"
                          : group[0].milestone === "best"
                            ? "reached a personal best"
                            : group[0].won
                              ? "won a match"
                              : "added a confirmed result"}
                    </p>
                    <span>
                      {category} · {dateLabel(group[0].playedAt, me.timezone)}
                    </span>
                    <div className="feed-changes">
                      {group.map(
                        (f) =>
                          f.delta !== null && (
                            <span key={f.id}>
                              {group.length > 1 ? f.player.name + ": " : ""}
                              {f.delta >= 0 ? "+" : ""}
                              {f.delta} points
                            </span>
                          ),
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="quiet-state">
                <Sparkles size={20} />
                <strong>You are up to date.</strong>
                <p>
                  Real changes appear here after your friends’ confirmed
                  results.
                </p>
              </div>
            )}
          </section>
          <section className="next-step">
            <span className="eyebrow">YOUR NEXT MILESTONE</span>
            <h3>
              {goalGap === null
                ? rating.score === null
                  ? `${Math.max(0, 5 - rating.count)} results to your reveal.`
                  : "Set a goal that matters to you."
                : goalGap === 0
                  ? "Your goal is reached."
                  : `${goalGap} points to your goal.`}
            </h3>
            <p>
              {rating.status === "Pair-linked"
                ? "Your doubles estimate is linked to your partnership. Naturally varied partners add useful evidence."
                : "Progress at your pace. A target is an aspiration, not a promised number of wins."}
            </p>
            <button
              className="text-button"
              onClick={() => setPage("profile", "settings")}
            >
              Manage your goals <ArrowUpRight size={16} />
            </button>
          </section>
          <div className="court-footnote">
            <span className="tiny-shuttle">S.</span>
            <p>
              Built for the players who keep coming back to court.
              <br />
              Founded by Featherballer.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function mockDashboard(doublesScore = 1628) {
  const ratings = (d: number, s = 1486) =>
    CATEGORIES.map((category) => ({
      category,
      score: category === "Mixed" ? null : category === "Singles" ? s : d,
      count: category === "Mixed" ? 0 : 38,
      peak: category === "Mixed" ? null : category === "Singles" ? 1532 : 1664,
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
      timezone: "Asia/Singapore",
      goals: { Doubles: 1700 },
      ratings: ratings(doublesScore),
    },
    friends,
    results: samples,
    circles: [],
    unread: 2,
    feed: friends.slice(0, 2).map((p, i) => ({
      id: p.id,
      unitId: "sample-circle-match",
      player: p,
      category: "Doubles",
      playedAt: new Date(Date.now() - i * 86400000).toISOString(),
      score: 1642,
      delta: i ? -6 : 12,
      won: !i,
    })),
  };
}
