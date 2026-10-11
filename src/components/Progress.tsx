import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Info, Trophy } from "lucide-react";
import {
  LEAGUES,
  leagueFor,
  type Category,
  type PublicRating,
} from "../domain.ts";
import { dateLabel } from "../api.ts";
import { ownChange, publishedPlayedAt, resultMoment } from "../experience.ts";
import { Gem, Modal } from "./UI.tsx";
import { RatingMotion } from "./RatingMotion.tsx";

const viewedMoments = new Set<string>();

export function RatingGuide({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="text-button rating-help" onClick={() => setOpen(true)}>
        <Info size={16} /> What this rating means
      </button>
      {open && (
        <Modal
          title="A clearer picture of your game"
          close={() => setOpen(false)}
        >
          <p className="guide-lead">
            A SHUTTL rating estimates playing strength from confirmed wins and
            losses. It is a starting point for your group’s level conversation.
          </p>
          <div className="guide-steps">
            <section>
              <b>01 / Three separate games</b>
              <p>
                Singles, Doubles and Mixed have independent ratings. A result
                affects only its category.
              </p>
            </section>
            <section>
              <b>02 / Five results reveal a starting point</b>
              <p>
                The first four build your estimate privately. Your fifth
                confirmed result reveals it. Five results do not certify your
                skill.
              </p>
            </section>
            <section>
              <b>03 / Difficulty and uncertainty matter</b>
              <p>
                The model compares the strengths of both sides. An unexpected
                outcome usually carries more information. Early estimates can
                move more while the model learns.
              </p>
            </section>
            {category !== "Singles" && (
              <section>
                <b>04 / Your partner matters too</b>
                <p>
                  Both partners and both opponents contribute to the expected
                  outcome. Playing only with one partner cannot fully separate
                  your individual strengths. Vary partners naturally; additional
                  matches alone do not guarantee individual comparability.
                </p>
              </section>
            )}
            <section>
              <b>Shared evidence before rivalry</b>
              <p>
                Direct gaps appear only when the playing evidence supports
                comparing the two players. Two numbers from disconnected groups
                are not a reliable ranking. A developing comparison still has
                uncertainty.
              </p>
            </section>
            <section>
              <b>Time off is yours</b>
              <p>
                Your rating mean does not fall because you take a break.
                Uncertainty can widen. You can pause comparison prompts in
                Settings.
              </p>
            </section>
          </div>
          <details className="guide-details">
            <summary>The league collection</summary>
            <p>
              These are SHUTTL milestones, not certified badminton levels or
              population percentiles. Boundaries remain subject to badminton
              calibration.
            </p>
            <div className="league-guide">
              {LEAGUES.map((l) => (
                <div key={l.name}>
                  <Gem league={l.name} size={34} />
                  <strong>{l.name}</strong>
                  <span>
                    {Number.isFinite(l.floor)
                      ? `${l.floor}+`
                      : `Below ${l.next}`}
                  </span>
                </div>
              ))}
            </div>
          </details>
          <p className="form-help">
            Player-confirmed results are not independently officiated.
            Corrections and reviews can change published history.
          </p>
        </Modal>
      )}
    </>
  );
}

export function ResultReward({
  result,
  share,
  small = false,
}: {
  result: any;
  share?: () => void;
  small?: boolean;
}) {
  const moment = resultMoment(result);
  const progress = result.ownProgress;
  const celebrationKey =
    moment && ["reveal", "best", "promotion"].includes(moment.kind)
      ? `${result.ownParticipant}:${result.id}:${result.publishedRevisionId}:${moment.kind}`
      : null;
  const [firstViewedMoment, setFirstViewedMoment] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!celebrationKey || viewedMoments.has(celebrationKey)) {
      setFirstViewedMoment(null);
      return;
    }
    viewedMoments.add(celebrationKey);
    if (viewedMoments.size > 256)
      viewedMoments.delete(viewedMoments.values().next().value!);
    setFirstViewedMoment(celebrationKey);
  }, [celebrationKey]);
  if (!moment)
    return result.publishedRevisionId && progress ? (
      <section className="placement-recap">
        <Check size={20} />
        <div>
          <strong>Another part of your starting point</strong>
          <p>
            {progress.count} of 5 confirmed {result.category.toLowerCase()}{" "}
            results. {Math.max(0, 5 - progress.count)} to your reveal.
          </p>
        </div>
      </section>
    ) : null;
  const { change, kind, title } = moment;
  const special = ["reveal", "best", "promotion"].includes(kind);
  // Only a result after the reveal has a visible before-rating to compare.
  // This also applies when the first revealed result is under correction.
  const hasVisibleBaseline = change.count > 5 && Number.isFinite(change.before);
  const promotion = kind === "promotion" && hasVisibleBaseline;
  const bestWithHistory =
    kind === "best" &&
    hasVisibleBaseline &&
    Number.isFinite(change.peakBefore) &&
    Number.isFinite(change.peakAfter) &&
    change.peakAfter === change.after &&
    change.peakAfter > change.peakBefore;
  const ratingScore = (
    <div className="reward-score">
      <RatingMotion
        before={hasVisibleBaseline ? change.before : null}
        after={change.after}
      />
      {!promotion && <Gem league={leagueFor(change.after).name} size={44} />}
      {hasVisibleBaseline && (
        <span className={change.delta < 0 ? "negative" : "positive"}>
          {change.delta >= 0 ? "+" : ""}
          {change.delta}
        </span>
      )}
    </div>
  );
  return (
    <section
      className={`result-reward reward-${kind} ${small ? "reward-small" : ""} ${celebrationKey && firstViewedMoment === celebrationKey ? "reward-first-view" : ""}`}
      aria-label="Your rating recap"
    >
      <div className="reward-heading">
        <span className="eyebrow">
          {kind === "reveal"
            ? "FIVE RESULTS / YOUR FIRST RATING"
            : kind === "promotion"
              ? "NEW LEAGUE / " + leagueFor(change.after).name.toUpperCase()
              : kind === "best"
                ? "YOUR HIGHEST VISIBLE RATING"
                : kind === "previous"
                  ? "PUBLISHED HISTORY"
                  : "PLAYER-CONFIRMED PROGRESS"}
        </span>
        {special && !promotion && <Trophy size={20} />}
      </div>
      <h3>{title}</h3>
      {kind === "reveal" ? (
        <div className="reward-reveal-lead">
          <span className="reward-fact-label">
            Your first visible {result.category.toLowerCase()} rating
          </span>
          {ratingScore}
          <p className="reward-earned-evidence">
            <Check size={16} aria-hidden="true" />
            {change.count} confirmed {result.category.toLowerCase()} results
          </p>
        </div>
      ) : bestWithHistory ? (
        <div className="reward-best-history">
          <div className="reward-previous-peak">
            <span className="reward-fact-label">Previous visible best</span>
            <strong>{change.peakBefore.toLocaleString("en")}</strong>
          </div>
          <ArrowRight
            className="reward-milestone-arrow"
            size={20}
            aria-hidden="true"
          />
          <div className="reward-new-peak">
            <span className="reward-fact-label">New personal best</span>
            {ratingScore}
          </div>
        </div>
      ) : (
        <>
          {promotion && (
            <div
              className="reward-league-transition"
              role="group"
              aria-label="Earned league progression"
            >
              <div className="reward-league-before">
                <Gem league={leagueFor(change.before).name} size={42} />
                <span>{leagueFor(change.before).name}</span>
              </div>
              <ArrowRight
                className="reward-milestone-arrow"
                size={20}
                aria-hidden="true"
              />
              <div className="reward-league-earned">
                <Gem league={leagueFor(change.after).name} size={64} />
                <strong>{leagueFor(change.after).name}</strong>
              </div>
            </div>
          )}
          {promotion && (
            <span className="reward-fact-label">
              Published {result.category.toLowerCase()} rating
            </span>
          )}
          {ratingScore}
        </>
      )}
      <p>
        {kind === "reveal"
          ? "This is your starting point. Future changes compare with a visible rating."
          : hasVisibleBaseline
            ? small
              ? `${change.won ? "Your side won" : "Your side lost"}.`
              : `${change.before} → ${change.after} · ${change.won ? "Your side won" : "Your side lost"}. Both sides’ strength and rating uncertainty shape the change.`
            : kind === "previous" && change.count === 5
              ? "This was your first visible rating, recorded after five confirmed results."
              : "Your published estimate after this confirmed result."}
      </p>
      {!small && (
        <p className="reward-context">
          {kind === "loss"
            ? "A loss adds evidence. Your personal best stays in your history; this number is one estimate, not a judgment of you."
            : kind === "best"
              ? "Your highest visible estimate in this category, earned through recorded play."
              : kind === "promotion"
                ? "A new SHUTTL milestone. Your evidence status still matters alongside the badge."
                : "Your next match adds to the picture. No required streak and no points for checking in."}
        </p>
      )}
      {share && result.status === "rated" && (
        <button className="text-button" onClick={share}>
          Share your progress <ArrowUpRight size={16} />
        </button>
      )}
    </section>
  );
}

export function ProgressChart({
  results,
  timezone,
  rating,
}: {
  results: any[];
  timezone: string;
  rating: PublicRating;
}) {
  const rows = results
    .filter((r) => r.publishedRevisionId && ownChange(r)?.count >= 5)
    .sort(
      (a, b) =>
        publishedPlayedAt(a).localeCompare(publishedPlayedAt(b)) ||
        a.id.localeCompare(b.id),
    )
    .slice(-12);
  const [selected, setSelected] = useState<string | null>(null);
  const active = rows.find((r) => r.id === selected) || rows.at(-1);
  if (rows.length < 2)
    return (
      <div className="chart-empty">
        <span>
          {rating.score === null
            ? "Your first five results build your starting point."
            : "Your next confirmed result begins a visible progress line."}
        </span>
      </div>
    );
  const values = rows.map((r) => ownChange(r).after),
    min = Math.min(...values) - 12,
    max = Math.max(...values) + 12;
  const points = values.map((v, i) => [
    16 + (i * 288) / (values.length - 1),
    100 - ((v - min) / (max - min)) * 80,
  ]);
  return (
    <>
      <div className="chart-inspection" aria-live="polite">
        <strong>
          {ownChange(active).after} <span>points</span>
        </strong>
        <span>
          {dateLabel(publishedPlayedAt(active), timezone)} ·{" "}
          {ownChange(active).count === 5
            ? "Starting rating"
            : `${ownChange(active).delta >= 0 ? "+" : ""}${ownChange(active).delta} after this result`}
        </span>
      </div>
      <svg
        viewBox="0 0 320 120"
        role="img"
        aria-label={`Last ${rows.length} visible estimates: ${values.join(", ")}. Select a result below for its date and change.`}
      >
        <path className="chart-grid" d="M16 100H304M16 60H304M16 20H304" />
        <path
          className="chart-fill"
          d={
            "M" +
            points.map((p) => p.join(",")).join(" L") +
            " L304,112 L16,112Z"
          }
        />
        <path
          className="chart-line"
          d={"M" + points.map((p) => p.join(",")).join(" L")}
        />
        {points.map((p, i) => (
          <circle
            key={rows[i].id}
            className="chart-dot"
            cx={p[0]}
            cy={p[1]}
            r={rows[i].id === active.id ? 5 : 2}
          />
        ))}
      </svg>
      <div
        className="chart-controls"
        role="group"
        aria-label="Inspect rating history"
      >
        {rows.map((r, i) => (
          <button
            key={r.id}
            aria-pressed={r.id === active.id}
            aria-label={`${dateLabel(publishedPlayedAt(r), timezone)}: ${ownChange(r).after} points`}
            onClick={() => setSelected(r.id)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="chart-labels">
        <span>{dateLabel(publishedPlayedAt(rows[0]), timezone)}</span>
        <span>
          {dateLabel(publishedPlayedAt(rows.at(-1)), timezone)} · last{" "}
          {rows.length} results
        </span>
      </div>
    </>
  );
}
