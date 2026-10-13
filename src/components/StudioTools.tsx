import { useEffect, useState } from "react";
import { ArrowUpRight, Flag, LockKeyhole, Trophy } from "lucide-react";
import { dateLabel } from "../api.ts";
import { LEAGUES, leagueFor, type Category } from "../domain.ts";
import { comparable, comparisonCopy } from "../experience.ts";
import { Avatar, Gem } from "./UI.tsx";

export function PeriodComparison({ studio }: { studio: any }) {
  const comparison = studio?.comparison;
  if (!comparison) return null;
  const { current, previous, days } = comparison;
  return (
    <section className="studio-period" aria-label="Period comparison">
      <span className="eyebrow">YOUR PLAY / IN PERSPECTIVE</span>
      <h3>This chapter. The one before.</h3>
      <p>Two consecutive {days}-day windows of your recorded play.</p>
      <div className="studio-period-grid">
        {[
          { ...current, label: "Selected period" },
          { ...previous, label: "Previous period" },
        ].map((p) => (
          <div key={p.label}>
            <span>{p.label}</span>
            <strong>{p.count}</strong>
            <span>confirmed matches</span>
            <b>
              {p.count ? `${p.wins}–${p.count - p.wins}` : "—"}{" "}
              <small>wins / losses</small>
            </b>
            <b>
              {p.delta === null ? "—" : `${p.delta > 0 ? "+" : ""}${p.delta}`}{" "}
              <small>visible rating change</small>
            </b>
          </div>
        ))}
      </div>
      <p>
        {studio.limited
          ? "A limited career snapshot; older periods may be incomplete. "
          : ""}
        {comparison.smallSample ? "A small sample, not a trend verdict. " : ""}
        Different opponents and partners can change these outcomes. More matches
        are not automatically better play.
      </p>
    </section>
  );
}

export function GoalRoadmap({
  rating,
  goal,
  goals,
  disabled = false,
}: {
  rating: any;
  goal: number | undefined;
  goals: () => void;
  disabled?: boolean;
}) {
  const league = rating.score === null ? null : leagueFor(rating.score),
    target =
      goal ?? (league && Number.isFinite(league.next) ? league.next : null);
  const reached =
    target !== null && rating.score !== null && rating.score >= target;
  return (
    <section className="studio-roadmap" aria-label="Your next marker">
      <div className="studio-roadmap-icon">
        <Flag size={20} />
      </div>
      <div>
        <span className="eyebrow">YOUR NEXT MARKER</span>
        <h3>
          {rating.score === null
            ? "Your first rating."
            : reached
              ? "Your marker, reached."
              : goal !== undefined
                ? "A goal you chose."
                : `The path to ${target === null ? "your next chapter" : leagueFor(target).name}.`}
        </h3>
        <p>
          {rating.score === null
            ? `${Math.max(0, 5 - rating.count)} more confirmed results to your reveal. Wins and losses both count.`
            : target === null
              ? "Keep shaping your personal history."
              : reached
                ? `Your current ${rating.score} estimate meets your ${target} goal.`
                : `${target - rating.score} rating points to ${target}. Your next result can move either way.`}
        </p>
        {rating.score !== null && target !== null && !reached && (
          <div className="studio-goal-distance">
            <span>{rating.score}</span>
            <span className="studio-goal-line" aria-hidden="true" />
            <strong>{target}</strong>
          </div>
        )}
        <button className="text-button" disabled={disabled} onClick={goals}>
          {goal === undefined ? "Choose your own goal" : "Review your goal"}
          <ArrowUpRight size={15} />
        </button>
      </div>
    </section>
  );
}

export function EarnedCollection({
  studio,
  rating,
  timezone,
  open,
  disabled = false,
}: {
  studio: any;
  rating: any;
  timezone: string;
  open: (id: string) => void;
  disabled?: boolean;
}) {
  const earned = studio?.collection || [],
    reveal = studio?.reveal,
    peak = studio?.peak;
  return (
    <section className="studio-collection" aria-label="Your earned collection">
      <div className="studio-collection-heading">
        <Trophy size={22} />
        <div>
          <span className="eyebrow">EARNED ON COURT</span>
          <h3>Your league collection</h3>
        </div>
        <span>
          {earned.length} earned {earned.length === 1 ? "seal" : "seals"}
        </span>
      </div>
      <p>
        Every seal links to a published result. They are SHUTTL milestones, not
        certified skill levels. A correction can revise the collection.
      </p>
      {reveal && (
        <button
          className="studio-reveal-token"
          disabled={disabled}
          onClick={() => open(reveal.unitId)}
        >
          <Gem league={leagueFor(reveal.score).name} size={30} />
          <span>
            <strong>Your rating, revealed</strong>
            <small>
              {dateLabel(reveal.playedAt, timezone)} · five confirmed results
            </small>
          </span>
          <ArrowUpRight size={16} />
        </button>
      )}
      <div className="studio-seal-grid">
        {LEAGUES.map((league) => {
          const item = earned.find((e: any) => e.league === league.name);
          const belowStart =
            studio?.startingLeague &&
            LEAGUES.findIndex((l) => l.name === league.name) <
              LEAGUES.findIndex((l) => l.name === studio.startingLeague);
          return item ? (
            <button
              className="studio-seal earned"
              disabled={disabled}
              key={league.name}
              onClick={() => open(item.unitId)}
              aria-label={`View earned ${league.name} result`}
            >
              <Gem league={league.name} size={54} />
              <strong>{league.name}</strong>
              <small>{item.kind}</small>
              <span>{dateLabel(item.playedAt, timezone)}</span>
            </button>
          ) : (
            <div className="studio-seal locked" key={league.name}>
              <span className="studio-locked-gem">
                <Gem league={league.name} size={54} />
                {!belowStart && <LockKeyhole size={15} />}
              </span>
              <strong>{league.name}</strong>
              <small>
                {belowStart
                  ? studio?.limited
                    ? "Earlier path not in snapshot"
                    : "Below your starting tier"
                  : `Not recorded${studio?.limited ? " in this snapshot" : " yet"}`}
              </small>
              <span>
                {Number.isFinite(league.floor)
                  ? `${league.floor}+`
                  : `Below ${league.next}`}
              </span>
            </div>
          );
        })}
      </div>
      {peak && (
        <button
          className="studio-peak"
          disabled={disabled}
          onClick={() => open(peak.unitId)}
        >
          <span>
            <span className="eyebrow">
              {studio?.limited
                ? "HIGH / AVAILABLE SNAPSHOT"
                : "PERSONAL HIGH / PUBLISHED HISTORY"}
            </span>
            <strong>{peak.score.toLocaleString("en")}</strong>
            <small>
              {dateLabel(peak.playedAt, timezone)} · Open the result
            </small>
          </span>
          <Gem league={leagueFor(peak.score).name} size={46} />
        </button>
      )}
      {!earned.length && (
        <p>
          {rating.score === null
            ? `${Math.max(0, 5 - rating.count)} more confirmed results to reveal your first seal.`
            : "No league entries in the available published history."}{" "}
          Your collection is built from real outcomes.
        </p>
      )}
      {studio?.limited && (
        <p>
          Your latest 2,000 career results are included. Earlier earned seals
          may be outside this snapshot.
        </p>
      )}
    </section>
  );
}

export function MatchupExplorer({
  data,
  category,
  timezone,
  open,
  disabled = false,
  mode,
  setMode,
  player,
  setPlayer,
}: {
  data: any;
  category: Category;
  timezone: string;
  open: (id: string) => void;
  disabled?: boolean;
  mode: string;
  setMode: (value: string) => void;
  player: string;
  setPlayer: (value: string) => void;
}) {
  const entries = data[mode] || [],
    selected = player
      ? entries.find((e: any) => e.player.id === player)
      : entries[0];
  return (
    <section className="studio-matchups" aria-label="Matchup explorer">
      <span className="eyebrow">THE PEOPLE / THE PATTERNS</span>
      <h3>Your matchup explorer</h3>
      <p>
        Explore outcomes with each recorded partner or opponent, then open the
        exact match behind them.
      </p>
      <div
        className="studio-mode"
        role="group"
        aria-label="Playing relationship"
      >
        {["opponents", "partners"].map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            disabled={
              disabled || (value === "partners" && category === "Singles")
            }
            onClick={() => {
              setMode(value);
              setPlayer("");
            }}
          >
            {value === "partners" ? "Together" : "Against"}
          </button>
        ))}
      </div>
      {entries.length ? (
        <>
          <label htmlFor="studio-player">
            {mode === "partners" ? "Choose a partner" : "Choose an opponent"}
          </label>
          <select
            disabled={disabled}
            id="studio-player"
            value={selected?.player.id || player || ""}
            onChange={(e) => setPlayer(e.target.value)}
          >
            {player && !selected && (
              <option value={player}>
                Chosen player · not in this snapshot
              </option>
            )}
            {entries.map((entry: any) => (
              <option key={entry.player.id} value={entry.player.id}>
                {entry.player.name} · {entry.count}{" "}
                {entry.count === 1 ? "match" : "matches"}
              </option>
            ))}
          </select>
          {selected ? (
            <>
              <div className="studio-matchup-record">
                <Avatar player={selected.player} />
                <div>
                  <strong>{selected.player.name}</strong>
                  <span>
                    {mode === "partners"
                      ? "Your side, playing together"
                      : "Your side, playing against them"}
                  </span>
                </div>
                <b>
                  {selected.wins}–{selected.count - selected.wins}
                </b>
              </div>
              <p>
                {selected.count < 5 ? "A small sample. " : ""}
                {category === "Singles"
                  ? "Your actual singles outcomes."
                  : "These are team outcomes; the record does not isolate this player’s contribution."}
              </p>
              <div className="studio-matchup-history">
                {[...(selected.matches || [])].reverse().map((match: any) => (
                  <button
                    key={match.unitId}
                    disabled={disabled}
                    onClick={() => open(match.unitId)}
                  >
                    <span>
                      <strong>
                        {match.won ? "Your side won" : "Your side lost"}
                      </strong>
                      <small>{dateLabel(match.playedAt, timezone)}</small>
                    </span>
                    <span>
                      {match.score === null
                        ? "Before your reveal"
                        : match.score.toLocaleString("en")}
                      <small>
                        {match.delta === null
                          ? "Published result"
                          : `${match.delta > 0 ? "+" : ""}${match.delta} points`}
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
              {selected.count > (selected.matches?.length || 0) && (
                <p>
                  Showing the latest {selected.matches.length} of{" "}
                  {selected.count} recorded matches in this period.
                </p>
              )}
            </>
          ) : (
            <p>
              Your chosen player has no recorded results in this period’s
              snapshot. Choose another player or a longer period.
            </p>
          )}
        </>
      ) : (
        <p>
          No recorded {mode} in this period. Choose a longer period to explore
          earlier play.
        </p>
      )}
    </section>
  );
}

export function RivalryLens({
  me,
  friends,
  category,
  compare,
  disabled = false,
  player,
  setPlayer,
}: {
  me: any;
  friends: any[];
  category: Category;
  compare: (id: string) => void;
  disabled?: boolean;
  player: string;
  setPlayer: (value: string) => void;
}) {
  if (me.breakMode || !friends.length) return null;
  const own = me.ratings.find((r: any) => r.category === category),
    peer = friends.find((f) => f.id === player),
    rating = peer?.ratings.find((r: any) => r.category === category);
  const supported =
    rating &&
    comparable(own, rating) &&
    own.status !== "Pair-linked" &&
    rating.status !== "Pair-linked";
  return (
    <section className="studio-rivalry" aria-label="Your rivalry lens">
      <span className="eyebrow">YOUR CIRCLE / YOUR CHOICE</span>
      <h3>A comparison that matters to you.</h3>
      <label htmlFor="studio-rival">Choose an accepted friend</label>
      <select
        id="studio-rival"
        disabled={disabled}
        value={player}
        onChange={(e) => setPlayer(e.target.value)}
      >
        <option value="">Choose your comparison</option>
        {friends.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {peer && (
        <>
          <div className="studio-rival-pair">
            <span>
              You<strong>{own.score ?? "—"}</strong>
            </span>
            <span>
              {peer.name}
              <strong>{rating?.score ?? "—"}</strong>
            </span>
          </div>
          <p>{comparisonCopy(own, rating)}</p>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => compare(peer.id)}
          >
            Explore shared results <ArrowUpRight size={15} />
          </button>
          <p>
            {supported
              ? "A developing comparison supported by shared playing evidence. A match is never guaranteed to close the gap."
              : "Follow progress separately until evidence supports comparing estimates."}
          </p>
        </>
      )}
    </section>
  );
}
