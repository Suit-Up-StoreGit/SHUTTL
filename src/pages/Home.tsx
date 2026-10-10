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
import { dateLabel, type Page } from "../api.ts";
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
            From player-confirmed results. Progress has no shortcuts.
          </p>
        </div>
      )}
    </section>
  );
}
function HistoryChart({ values }: { values: number[] }) {
  if (values.length < 2)
    return (
      <div className="chart-empty">
        <Activity size={22} />
        <span>Your progress line begins with confirmed results.</span>
      </div>
    );
  const min = Math.min(...values) - 12,
    max = Math.max(...values) + 12,
    points = values.map((v, i) => [
      12 + i * (296 / (values.length - 1)),
      104 - ((v - min) / (max - min)) * 82,
    ]);
  return (
    <svg
      viewBox="0 0 320 120"
      role="img"
      aria-label={`Rating progress across ${values.length} confirmed results, from ${values[0]} to ${values.at(-1)}`}
    >
      <path className="chart-grid" d="M12 104H308M12 62H308M12 20H308" />
      <path
        className="chart-fill"
        d={
          "M" + points.map((p) => p.join(",")).join(" L") + " L308,112 L12,112Z"
        }
      />
      <path
        className="chart-line"
        d={"M" + points.map((p) => p.join(",")).join(" L")}
      />
      <circle
        className="chart-dot"
        cx={points.at(-1)![0]}
        cy={points.at(-1)![1]}
        r="4"
      />
    </svg>
  );
}
export function Home({
  data,
  category,
  setCategory,
  setPage,
  record,
  addFriend,
  variant = "passport",
  mock = false,
}: {
  data: any;
  category: Category;
  setCategory: (c: Category) => void;
  setPage: (p: Page) => void;
  record: () => void;
  addFriend: () => void;
  variant?: string;
  mock?: boolean;
}) {
  const me = data.me,
    rating: PublicRating = me.ratings.find(
      (r: PublicRating) => r.category === category,
    ),
    friends = data.friends.map((p: any) => ({
      ...p,
      rating: p.ratings.find((r: PublicRating) => r.category === category),
    }));
  const results = data.results.filter(
      (r: any) => r.category === category && r.publishedRevisionId,
    ),
    ownHistory = results
      .filter((r: any) => r.ratingChanges?.[me.id]?.count >= 5)
      .sort((a: any, b: any) => a.playedAt.localeCompare(b.playedAt))
      .map((r: any) => r.ratingChanges[me.id].after);
  const values = mock
    ? category === "Mixed"
      ? []
      : category === "Singles"
        ? [1410, 1432, 1424, 1451, 1439, 1458, 1471, 1469, 1486]
        : [
            1502, 1493, 1526, 1517, 1548, 1579, 1561, 1588, 1596, 1581, 1620,
            1628,
          ]
    : ownHistory.slice(-12);
  const total = me.ratings.reduce(
      (n: number, r: PublicRating) => n + r.count,
      0,
    ),
    pending = data.results.filter(
      (r: any) =>
        ["pending", "correction_pending"].includes(r.status) &&
        !r.approvals.includes(r.ownParticipant),
    );
  const feed = data.feed
      .filter((f: any) => f.category === category)
      .slice(0, 3),
    goal = me.goals?.[category],
    gap =
      rating.score !== null && goal ? Math.max(0, goal - rating.score) : null;
  return (
    <div className={"home-view concept-" + variant}>
      <header className="home-heading">
        <div>
          <div className="eyebrow greeting-label">
            {new Intl.DateTimeFormat("en-SG", {
              timeZone: me.timezone || "Asia/Singapore",
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </div>
          <h1>
            {variant === "editorial" ? (
              <>
                A little better.
                <br />
                <em>Every match.</em>
              </>
            ) : variant === "arena" ? (
              <>
                Make your
                <br />
                <span>next move.</span>
              </>
            ) : variant === "circle" ? (
              <>
                Your people.
                <br />
                <span>Your next level.</span>
              </>
            ) : (
              <>
                Your game.
                <br />
                <span>Worth measuring.</span>
              </>
            )}
          </h1>
          <p>
            {me.breakMode
              ? "Your court will be here when you are ready."
              : `Good to see you, ${me.name.split(" ")[0]}. Let your results do the talking.`}
          </p>
        </div>
        <button className="button record-button" onClick={record}>
          <Plus size={18} />
          Record a result
          <span className="button-arrow">
            <ArrowUpRight size={16} />
          </span>
        </button>
      </header>
      <CategoryTabs value={category} onChange={setCategory} />
      {pending.length > 0 && (
        <button className="pending-banner" onClick={() => setPage("inbox")}>
          <span className="pending-icon">
            <Check size={18} />
          </span>
          <span>
            <strong>
              {pending.length}{" "}
              {pending.length === 1 ? "result needs" : "results need"} your
              review
            </strong>
            <small>Confirm the exact score before any rating changes.</small>
          </span>
          <ArrowRight size={19} />
        </button>
      )}
      <div className="home-grid">
        <div className="home-main">
          {variant === "circle" && (
            <section className="circle-spotlight">
              <span className="eyebrow">THE PEOPLE WHO PUSH YOU</span>
              <div className="avatar-stack">
                {friends.slice(0, 4).map((p: any) => (
                  <Avatar key={p.id} player={p} />
                ))}
              </div>
              <h2>
                {friends.length
                  ? `${friends.length} players. One stronger circle.`
                  : "Good rivals make better games."}
              </h2>
              <p>Real matches. Shared progress. A reason to play again.</p>
              <button className="text-button" onClick={addFriend}>
                Build your circle
                <ArrowUpRight size={16} />
              </button>
            </section>
          )}
          <RatingCard rating={rating} category={category} />
          <div className="home-stats">
            <div>
              <span className="eyebrow">CONFIRMED PLAY</span>
              <strong>
                {rating.count}
                <small> {rating.count === 1 ? "result" : "results"}</small>
              </strong>
            </div>
            <div>
              <span className="eyebrow">PERSONAL BEST</span>
              <strong>
                {rating.peak === null ? "—" : rating.peak}
                <small>
                  {" "}
                  {rating.peak === null ? "building history" : "points"}
                </small>
              </strong>
            </div>
            <div>
              <span className="eyebrow">YOUR CIRCLE</span>
              <strong>
                {friends.length}
                <small> {friends.length === 1 ? "player" : "players"}</small>
              </strong>
            </div>
          </div>
          <section className="panel progress-panel">
            <SectionHeading
              title="Your progress"
              action="See history"
              onClick={() => setPage("profile")}
            />
            <div className="progress-caption">
              <span>Every result is part of the story.</span>
              <span className="pill">{category}</span>
            </div>
            <HistoryChart values={values} />
            <div className="chart-labels">
              <span>
                {values.length ? "Earlier results" : "Your first chapter"}
              </span>
              <span>
                {values.length ? "Latest result" : "No invented trends"}
              </span>
            </div>
          </section>
          {variant === "arena" && rating.score !== null && (
            <section className="league-strip" aria-label="Next leagues">
              {["Ruby", "Obsidian", "Diamond", "Master"].map((l) => (
                <div className={l === rating.league ? "current" : ""} key={l}>
                  <Gem league={l} size={30} />
                  <strong>{l}</strong>
                  <span>
                    {l === rating.league ? "YOUR LEAGUE" : "NEXT CHAPTER"}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
        <aside className="home-aside">
          <section className="panel circle-panel">
            <SectionHeading
              title="Your circle"
              action="View all"
              onClick={() => setPage("friends")}
            />
            <p className="panel-intro">
              A little friendly competition goes a long way.
            </p>
            {friends.length ? (
              friends.slice(0, 3).map((p: any) => (
                <div className="friend-line" key={p.id}>
                  <Avatar player={p} />
                  <div className="friend-text">
                    <strong>{p.name}</strong>
                    <span>
                      {p.rating.score !== null && rating.score !== null
                        ? `${Math.abs(p.rating.score - rating.score)} rating points ${p.rating.score > rating.score ? "ahead" : p.rating.score < rating.score ? "behind" : "apart"}`
                        : p.rating.status === "Unrated"
                          ? "Waiting for a first result"
                          : `${p.rating.count} confirmed results`}
                    </span>
                  </div>
                  <div className="friend-score">
                    <strong>{p.rating.score ?? "—"}</strong>
                    <small>
                      {p.rating.status === "Established"
                        ? "Established"
                        : p.rating.status}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="Find your people"
                action="Add a friend"
                onClick={addFriend}
              >
                Invite a player you already share a court with.
              </Empty>
            )}
            <button className="invite-link" onClick={addFriend}>
              <Plus size={16} />
              Add a player to your circle
              <ArrowUpRight size={16} />
            </button>
          </section>
          <section className="panel activity-panel">
            <SectionHeading title="Around your court" />
            {feed.length ? (
              feed.map((f: any) => (
                <div className="activity-row" key={f.id}>
                  <span className="activity-dot">
                    <MoveUpRight size={16} />
                  </span>
                  <div>
                    <p>
                      <strong>{f.player.name}</strong>{" "}
                      {f.won ? "won a match" : "recorded a result"}
                    </p>
                    <span>
                      {f.category} · {dateLabel(f.playedAt, me.timezone)} ·
                      Player-confirmed
                    </span>
                  </div>
                  {f.delta !== null && (
                    <strong className={f.delta >= 0 ? "positive" : "negative"}>
                      {f.delta >= 0 ? "+" : ""}
                      {f.delta}
                    </strong>
                  )}
                </div>
              ))
            ) : (
              <div className="quiet-state">
                <Sparkles size={20} />
                <strong>You are up to date.</strong>
                <p>
                  No confirmed results in your circle yet. Nothing needs chasing
                  today.
                </p>
              </div>
            )}
          </section>
          <section className="next-step">
            <span className="next-step-icon">
              {gap !== null ? <Target size={20} /> : <UsersRound size={20} />}
            </span>
            <span className="eyebrow">
              {gap !== null ? "YOUR OWN NEXT MILESTONE" : "BETTER TOGETHER"}
            </span>
            <h3>
              {gap !== null
                ? gap === 0
                  ? "Your goal is reached."
                  : `${gap} points to your goal.`
                : "Same court. A clearer picture."}
            </h3>
            <p>
              {gap !== null
                ? "Progress at your pace. No required streak, no promised win count."
                : "Agree to rated play once for your session. Each exact result still needs the right approval."}
            </p>
            <button
              className="text-button"
              onClick={() => setPage(gap !== null ? "profile" : "agreements")}
            >
              {gap !== null ? "Manage your goal" : "Rated agreements"}
              <ArrowUpRight size={16} />
            </button>
          </section>
          <div className="court-footnote">
            <span className="tiny-shuttle">S.</span>
            <p>
              {total
                ? `${total} confirmed results in your badminton story.`
                : "Your badminton story starts on the court."}
              <br />
              Singles, Doubles and Mixed stay separate.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
export function mockDashboard() {
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
  return {
    me: {
      id: "sample",
      name: "Simon",
      username: "featherballer",
      district: "Tampines",
      timezone: "Asia/Singapore",
      goals: { Doubles: 1700 },
      ratings: ratings(1628),
    },
    friends,
    results: [],
    circles: [],
    unread: 2,
    feed: friends.slice(0, 2).map((p, i) => ({
      id: p.id,
      player: p,
      category: "Doubles",
      playedAt: new Date(Date.now() - i * 86400000).toISOString(),
      score: 1642,
      delta: i ? -6 : 12,
      won: !i,
    })),
  };
}
