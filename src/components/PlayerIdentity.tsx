import type { CSSProperties, ReactNode } from "react";
import { MapPin } from "lucide-react";
import { dateLabel } from "../api.ts";
import {
  CATEGORIES,
  LEAGUES,
  leagueFor,
  type Category,
  type Player,
  type PublicRating,
} from "../domain.ts";
import { localityLabel } from "../location.ts";
import { Avatar, Gem } from "./UI.tsx";

type IdentityPlayer = Player & {
  ratings: PublicRating[];
  country?: string;
  city?: string;
};

function DisciplineCard({
  rating,
  preferred,
}: {
  rating: PublicRating;
  preferred: boolean;
}) {
  const revealed = rating.score !== null;
  const league = revealed
    ? LEAGUES.find((item) => item.name === rating.league)
    : null;
  const nextLeague =
    league && Number.isFinite(league.next) ? leagueFor(league.next) : null;
  const withinLeague =
    league && Number.isFinite(league.floor) && Number.isFinite(league.next)
      ? Math.max(
          0,
          Math.min(
            100,
            ((rating.score! - league.floor) / (league.next - league.floor)) *
              100,
          ),
        )
      : null;
  const score = revealed ? rating.score!.toLocaleString("en") : "—";
  const remaining = Math.max(0, 5 - rating.count);
  const placement = !revealed && rating.count < 5;
  const caption = (
    <p className="player-rating-caption">
      {revealed
        ? "Player-confirmed estimate"
        : rating.count === 0
          ? "Your next chapter starts here"
          : "Your starting point is taking shape"}
    </p>
  );
  const playingProgress = placement ? (
    <div className="player-placement">
      <div
        className="player-placement-track"
        role="progressbar"
        aria-label={`${rating.category} placement progress`}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={Math.max(0, rating.count)}
        aria-valuetext={`${rating.count} of 5 confirmed results`}
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className={index < rating.count ? "is-filled" : ""}
          />
        ))}
      </div>
      <p>
        {rating.count === 0
          ? "Five confirmed results reveal this rating."
          : `${remaining} more confirmed ${remaining === 1 ? "result" : "results"} to your reveal.`}
      </p>
    </div>
  ) : revealed && league ? (
    <div className="player-league-progress">
      <div className="player-league-next">
        <span>
          {nextLeague
            ? `${Math.max(0, league.next - rating.score!)} points to ${nextLeague.name}`
            : "Highest current SHUTTL league"}
        </span>
        {nextLeague && <span>{league.next.toLocaleString("en")}</span>}
      </div>
      {withinLeague !== null && (
        <div
          className="player-league-track"
          role="progressbar"
          aria-label={`${rating.category} rating within ${league.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(withinLeague)}
        >
          <span style={{ width: withinLeague + "%" }} />
        </div>
      )}
    </div>
  ) : (
    <p className="player-rating-unavailable">
      Your rating is not available yet.
    </p>
  );
  const personalBest =
    revealed && rating.peak !== null ? (
      <span>
        <strong>{rating.peak.toLocaleString("en")}</strong>{" "}
        <small>personal best</small>
      </span>
    ) : null;
  const partnerNote =
    rating.status === "Pair-linked" ? (
      <p className="player-discipline-note player-partner-note">
        Regular partners limit individual comparisons.
      </p>
    ) : null;
  const lastPlayed = rating.lastPlayed ? (
    <p className="player-discipline-note">
      Last rated match · {dateLabel(rating.lastPlayed)}
    </p>
  ) : null;

  return (
    <article
      className="profile-rating-line player-discipline"
      data-category={rating.category}
      data-focus={preferred ? "true" : "false"}
      aria-label={`${rating.category} rating`}
      style={
        {
          "--profile-number-ratio": Math.max(2.4, score.length * 0.48),
        } as CSSProperties
      }
    >
      <div className="player-discipline-heading">
        <div>
          <span className="player-discipline-code">
            0{CATEGORIES.indexOf(rating.category) + 1} /{" "}
            {preferred ? "YOUR FOCUS" : "YOUR GAME"}
          </span>
          <h3>{rating.category}</h3>
        </div>
        {revealed && league && (
          <div className="player-discipline-seal">
            <Gem league={league.name} size={preferred ? 46 : 32} />
            <span>{league.name}</span>
          </div>
        )}
      </div>
      <div className="player-discipline-value">
        <b className="player-rating-number">{score}</b>
        <span className="player-rating-evidence">{rating.status}</span>
      </div>
      {preferred ? (
        <>
          {caption}
          {playingProgress}
          <div className="player-discipline-facts">
            <span className="player-confirmed-count">
              <strong>{rating.count.toLocaleString("en")}</strong>{" "}
              <small>
                {rating.count === 1 ? "confirmed result" : "confirmed results"}
              </small>
            </span>
            {personalBest}
          </div>
          {partnerNote || lastPlayed}
        </>
      ) : (
        <>
          <p className="player-secondary-count">
            <strong>{rating.count.toLocaleString("en")}</strong>{" "}
            {rating.count === 1 ? "confirmed result" : "confirmed results"}
          </p>
          {partnerNote}
          <details className="player-playing-context">
            <summary>{rating.category} playing context</summary>
            <div className="player-playing-context-body">
              {revealed && league && (
                <p className="player-secondary-league">
                  <Gem league={league.name} size={30} /> {league.name} · SHUTTL
                  league
                </p>
              )}
              {caption}
              {playingProgress}
              {personalBest && (
                <div className="player-discipline-facts">{personalBest}</div>
              )}
              {lastPlayed}
            </div>
          </details>
        </>
      )}
    </article>
  );
}

export function PlayerIdentity({
  me,
  preferredCategory,
  actions,
}: {
  me: IdentityPlayer;
  preferredCategory: Category;
  actions: ReactNode;
}) {
  const confirmed = me.ratings.reduce((sum, rating) => sum + rating.count, 0);
  const focusedRating = me.ratings.find(
    (rating) => rating.category === preferredCategory,
  );
  const focusedScore =
    focusedRating?.score == null
      ? "—"
      : focusedRating.score.toLocaleString("en");
  const focusedContext = !focusedRating
    ? "Rating not available"
    : focusedRating.score === null
      ? focusedRating.count < 5
        ? `${focusedRating.count} of 5 confirmed results`
        : "Rating not available"
      : [focusedRating.league, focusedRating.status]
          .filter(Boolean)
          .join(" · ");
  const orderedRatings = [...me.ratings].sort((a, b) => {
    const order = (category: Category) =>
      category === preferredCategory ? -1 : CATEGORIES.indexOf(category);
    return order(a.category) - order(b.category);
  });
  const area = me.district
    ? localityLabel(me.country || "", me.city || "", me.district)
    : "";

  return (
    <section className="panel profile-card player-identity-passport">
      <header className="player-passport-cover">
        <svg
          className="player-passport-court"
          viewBox="0 0 440 280"
          aria-hidden="true"
        >
          <path d="M220 4 428 268H12L220 4Zm0 0v264M65 200h310M102 150h236M148 92h144M170 69 82 268M270 69l88 199" />
        </svg>
        <div className="player-passport-kicker">
          <span>YOUR PLAYER PASSPORT</span>
          <span>SHUTTL.</span>
        </div>
        <div className="profile-identity">
          <div className="player-portrait-frame">
            <Avatar player={me} />
          </div>
          <div className="player-identity-copy">
            <h2>{me.name}</h2>
            <p className="player-username">@{me.username}</p>
            {area && (
              <p className="player-declared-area">
                <MapPin size={14} aria-hidden="true" /> {area}{" "}
                <span>· declared</span>
              </p>
            )}
          </div>
        </div>
        <div className="player-passport-summary">
          <div>
            <strong>{confirmed.toLocaleString("en")}</strong>
            <span>
              confirmed {confirmed === 1 ? "result" : "results"} across your
              game
            </span>
          </div>
          <div
            className="player-focus-summary"
            data-focus-category={preferredCategory}
          >
            <span>{preferredCategory} · your focus</span>
            <strong>{focusedScore}</strong>
            <span>{focusedContext}</span>
          </div>
        </div>
      </header>
      <div className="player-passport-actions">{actions}</div>
      <div className="player-disciplines-heading">
        <div>
          <span className="eyebrow">THREE CATEGORIES. YOUR OWN PROGRESS.</span>
          <h3>Your game, in detail.</h3>
        </div>
      </div>
      <div className="player-discipline-grid">
        {orderedRatings.map((rating) => (
          <DisciplineCard
            key={rating.category}
            rating={rating}
            preferred={rating.category === preferredCategory}
          />
        ))}
      </div>
      <p className="player-passport-explanation">
        Each category has its own estimate. Five results reveal a starting
        point; regular partnerships can make individual comparisons uncertain.
      </p>
    </section>
  );
}
