import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, ShieldCheck } from "lucide-react";
import { api, dateLabel, dateTimeLabel, errorMessage } from "../api.ts";
import { type Category, leagueFor } from "../domain.ts";
import { ownChange, publishedPlayedAt } from "../experience.ts";
import { milestoneFor, progressTrace } from "../home-growth.ts";
import { ShuttleMark } from "./HomeGrowth.tsx";
import {
  Avatar,
  CategoryTabs,
  Gem,
  InlineError,
  Modal,
  Spinner,
} from "./UI.tsx";

function previewInsights(me: any, results: any[], category: Category) {
  const rows = results
    .filter((r) => r.category === category && r.publishedRevisionId)
    .sort((a, b) => publishedPlayedAt(a).localeCompare(publishedPlayedAt(b)));
  const changes = rows.map(ownChange).filter(Boolean),
    visible = changes.filter((c) => c.count >= 5);
  return {
    owner: me.id,
    asOf: new Date().toISOString(),
    demo: true,
    category,
    count: rows.length,
    wins: changes.filter((c) => c.won).length,
    delta: visible.length
      ? visible.at(-1).after -
        (visible[0].count === 5 ? visible[0].after : visible[0].before)
      : null,
    firstPlayed: rows[0]?.playedAt,
    lastPlayed: rows.at(-1)?.playedAt,
    ...previewConnections(rows, me.id),
    limited: true,
    moments: [...rows]
      .reverse()
      .filter((r) => ownChange(r)?.count >= 5)
      .slice(0, 3)
      .map((r) => ({
        unitId: r.id,
        playedAt: publishedPlayedAt(r),
        score: ownChange(r).after,
        count: ownChange(r).count,
        delta: ownChange(r).count === 5 ? null : ownChange(r).delta,
        won: ownChange(r).won,
        milestone: milestoneFor(ownChange(r)),
      })),
    trajectory: rows.flatMap((r) =>
      ownChange(r)?.count >= 5
        ? [
            {
              score: ownChange(r).after,
              playedAt: publishedPlayedAt(r),
              count: ownChange(r).count,
            },
          ]
        : [],
    ),
  };
}

function previewConnections(rows: any[], owner: string) {
  const partners = new Map<string, any>(),
    opponents = new Map<string, any>();
  for (const row of rows) {
    const roster = row.players || [],
      index = roster.findIndex((p: any) => p.id === owner),
      size = roster.length / 2;
    if (index < 0 || ![1, 2].includes(size)) continue;
    const collect = (map: Map<string, any>, player: any) => {
      const item = map.get(player.id) || { player, count: 0, wins: 0 };
      item.count++;
      item.wins += Number(ownChange(row)?.won);
      map.set(player.id, item);
    };
    if (size === 2)
      collect(partners, roster[index % 2 === 0 ? index + 1 : index - 1]);
    roster
      .slice(index < size ? size : 0, index < size ? size * 2 : size)
      .forEach((p: any) => collect(opponents, p));
  }
  const ordered = (map: Map<string, any>) =>
    [...map.values()].sort((a, b) => b.count - a.count);
  return { partners: ordered(partners), opponents: ordered(opponents) };
}

export default function ProgressBrief({
  me,
  category: initialCategory,
  results,
  mock,
  close,
  goals,
  insights,
  openResult,
}: {
  me: any;
  category: Category;
  results: any[];
  mock: boolean;
  close: () => void;
  goals: () => void;
  insights: () => void;
  openResult: (id: string) => void;
}) {
  const [category, setCategory] = useState(initialCategory),
    [period, setPeriod] = useState("30"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [name, setName] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    exporting = useRef(false);
  const rating = me.ratings.find((r: any) => r.category === category);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setNotice("");
    if (mock) {
      setData(previewInsights(me, results, category));
      return;
    }
    api(`/insights?category=${category}&period=${period}`)
      .then((v) => {
        if (active && alive.current) {
          if (
            v.owner !== me.id ||
            v.category !== category ||
            v.period !== period
          )
            throw new Error(
              "Your account or period changed. Close this brief and reopen it from your current home.",
            );
          setData(v);
        }
      })
      .catch((e) => {
        if (active && alive.current) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [me.id, category, period, attempt, mock, rating.count, rating.score]);
  const trace = progressTrace(data?.trajectory || [], 320, 96, 150);
  const startingPoint = data?.trajectory?.[0]?.count === 5;
  const connections = [
    data?.partners?.[0] && {
      ...data.partners[0],
      label: "Most recorded partnership",
      relation: "with",
    },
    data?.opponents?.[0] && {
      ...data.opponents[0],
      label: "Most recorded opposition",
      relation: "against",
    },
  ].filter(Boolean);
  const next = rating.score === null ? null : leagueFor(rating.score).next,
    goal = me.goals?.[category];
  const advice =
    rating.score === null
      ? `${Math.max(0, 5 - rating.count)} more confirmed ${category.toLowerCase()} results to reveal your estimate. Record the real outcome, win or loss.`
      : rating.status === "Pair-linked"
        ? "One regular partnership makes individual contributions hard to separate. Different partners, when you naturally play with them, add useful context."
        : !data?.count
          ? "Try a longer period to revisit your progress. Time away does not erase your personal best."
          : data.count < 5
            ? "This is a short window. Read it alongside your longer history before treating one result as a pattern."
            : rating.status === "Developing"
              ? "Your estimate is still developing. Early results can move it sharply; both sides’ ratings and their uncertainty shape the change. Read the trajectory alongside who you played."
              : "Explore your recorded partnerships and opponents. These are match outcomes, rather than a diagnosis of technique or a partner’s contribution.";
  return (
    <Modal title="Your progress brief" close={close} wide>
      <p className="brief-intro">Your confirmed play, in perspective.</p>
      <CategoryTabs value={category} onChange={setCategory} disabled={busy} />
      <div className="field">
        <label htmlFor="brief-period">Your playing period</label>
        <select
          id="brief-period"
          value={period}
          disabled={busy || mock}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="7">Last seven days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">Career history</option>
        </select>
      </div>
      <InlineError message={error} />
      {error && !data && (
        <button
          className="button secondary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry progress brief
        </button>
      )}
      {!data && !error && <Spinner />}
      {data && (
        <div className="progress-brief">
          <div className="brief-snapshot">
            <span>Snapshot {dateTimeLabel(data.asOf, me.timezone)}</span>
            {!mock && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Refresh brief
              </button>
            )}
          </div>
          <section
            className="brief-current"
            aria-label="Current rating context"
          >
            <ShuttleMark className="brief-shuttle" />
            <div>
              <span className="eyebrow">
                {category.toUpperCase()} / CURRENT ESTIMATE
              </span>
              <strong>
                {rating.score === null
                  ? "Building your rating"
                  : rating.score.toLocaleString("en-SG")}
              </strong>
              <span>
                {rating.status} · {rating.count} confirmed results
              </span>
            </div>
            {rating.score !== null && <Gem league={rating.league} size={52} />}
          </section>
          <section
            className="brief-trajectory"
            aria-label="Published rating trajectory"
          >
            <div>
              <h3>
                {trace?.points.length === 1
                  ? startingPoint
                    ? "Your starting point"
                    : "One point in this period"
                  : "Your trajectory"}
              </h3>
              <span>
                {trace?.points.length === 1
                  ? startingPoint
                    ? "Five-match reveal"
                    : "Published after confirmed play"
                  : trace
                    ? `${trace.low.toLocaleString("en")}–${trace.high.toLocaleString("en")}`
                    : "Five confirmations unlock this view"}
              </span>
            </div>
            {trace?.points.length === 1 ? (
              <div className="brief-starting-point">
                <Gem
                  league={leagueFor(data.trajectory[0].score).name}
                  size={40}
                />
                <span>
                  <strong>
                    {data.trajectory[0].score.toLocaleString("en")}
                  </strong>
                  <span>
                    {startingPoint
                      ? "First published estimate"
                      : "Recorded estimate"}{" "}
                    · {dateLabel(data.trajectory[0].playedAt, me.timezone)}
                  </span>
                </span>
              </div>
            ) : trace ? (
              <svg
                viewBox="-8 -8 336 112"
                role="img"
                aria-label={`Published ratings in this period range from ${trace.low} to ${trace.high}; ${trace.points.length} confirmed match points`}
              >
                {[0, 48, 96].map((y) => (
                  <path
                    key={y}
                    className="brief-trace-grid"
                    d={`M0,${y}H320`}
                  />
                ))}
                <path className="brief-trace-line" d={trace.path} />
                {[trace.points[0], trace.points.at(-1)!].map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3.5" />
                ))}
              </svg>
            ) : (
              <p>
                No visible rating points in this window. Choose a longer period
                or finish your five-match reveal.
              </p>
            )}
            <p>
              {data.count
                ? `${dateLabel(data.firstPlayed, me.timezone)} – ${dateLabel(data.lastPlayed, me.timezone)}. `
                : ""}
              {trace?.points.length === 1
                ? startingPoint
                  ? "Your next confirmed match adds the next point. No earlier ratings are invented. "
                  : "This period contains one published estimate. Choose a longer period to see more of your history. "
                : "Points mark published estimates after actual matches; lines connect those points. "}
              {trace &&
                trace.points.length > 1 &&
                `Chart scale ${Math.round(trace.scaleLow)}–${Math.round(trace.scaleHigh)}; at least 150 points tall to keep small moves in perspective. `}
              {data.limited
                ? "A limited history snapshot."
                : "Your selected period’s published history."}
            </p>
          </section>
          {data.moments?.length > 0 && (
            <section
              className="brief-journal"
              aria-label="Results behind your progress"
            >
              <span className="eyebrow">YOUR ON-COURT STORY</span>
              <h3>Results behind your progress</h3>
              <p>
                Open the actual result behind a recent rating or earned moment.
              </p>
              {data.moments.map((moment: any, index: number) => (
                <button
                  key={moment.unitId}
                  disabled={busy}
                  onClick={() => openResult(moment.unitId)}
                >
                  <Gem league={leagueFor(moment.score).name} size={28} />
                  <span>
                    <strong>
                      {moment.milestone === "reveal"
                        ? "Your rating, revealed"
                        : moment.milestone === "promotion"
                          ? `${leagueFor(moment.score).name} reached`
                          : moment.milestone === "best"
                            ? "A personal best"
                            : "Latest published result"}
                    </strong>
                    <span>
                      {dateLabel(moment.playedAt, me.timezone)} · Your side{" "}
                      {moment.won ? "won" : "lost"}
                    </span>
                  </span>
                  <span className="brief-journal-score">
                    <strong>{moment.score.toLocaleString("en")}</strong>
                    {moment.delta !== null && (
                      <span>
                        {moment.delta > 0 ? "+" : ""}
                        {moment.delta} points
                      </span>
                    )}
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </section>
          )}
          <div className="brief-facts">
            <div>
              <strong>{data.count}</strong>
              <span>confirmed matches</span>
            </div>
            <div>
              <strong>
                {data.count ? `${data.wins}–${data.count - data.wins}` : "—"}
              </strong>
              <span>wins / losses</span>
            </div>
            <div>
              <strong>
                {data.delta === null
                  ? "—"
                  : `${data.delta > 0 ? "+" : ""}${data.delta}`}
              </strong>
              <span>visible rating change</span>
            </div>
          </div>
          <section
            className="brief-connections"
            aria-label="Your playing connections"
          >
            <span className="eyebrow">THE PEOPLE IN YOUR PLAY</span>
            <h3>Your playing connections</h3>
            {connections.length ? (
              connections.map((item: any) => (
                <div className="brief-connection" key={item.relation}>
                  <Avatar player={item.player} small />
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.player.name}</strong>
                    <p>
                      {item.count} confirmed{" "}
                      {item.count === 1 ? "match" : "matches"} {item.relation}{" "}
                      them · your side won {item.wins}.
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p>
                No playing connections in this period. Choose a longer period,
                or build this view with your next confirmed match.
              </p>
            )}
            <p>
              {connections.some((item: any) => item.count < 3)
                ? "A small sample. "
                : ""}
              These are your recorded outcomes, not a measure of another
              player's contribution. The downloaded card includes your own
              totals only.
            </p>
          </section>
          <section className="brief-next">
            <h3>Your next marker</h3>
            <p>
              {goal !== undefined
                ? rating.score !== null && rating.score >= goal
                  ? `Your ${goal} goal is reached. Choose a fresh target when it feels right.`
                  : `Your personal goal: ${goal}.`
                : next !== null && Number.isFinite(next)
                  ? `${next - rating.score} points to ${leagueFor(next).name}.`
                  : rating.score !== null
                    ? "Keep building your own playing history."
                    : "Your first published rating."}
            </p>
            <button className="text-button" disabled={busy} onClick={goals}>
              {goal === undefined ? "Set a personal goal" : "Review your goal"}
              <ArrowUpRight size={15} />
            </button>
          </section>
          <section className="brief-context">
            <ShieldCheck size={20} />
            <div>
              <h3>Keep the result in context</h3>
              <p>{advice}</p>
              <p>
                One loss is evidence, not a verdict. A short run does not
                establish a lasting skill change. No points for a streak or a
                check-in.
              </p>
              <button
                className="text-button"
                disabled={busy}
                onClick={insights}
              >
                Explore partnerships and opponents <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
          <div className="brief-download">
            <label className="check-row">
              <input
                type="checkbox"
                checked={name}
                disabled={busy}
                onChange={(e) => setName(e.target.checked)}
              />
              Include my name on the downloaded card
            </label>
            <p>
              Only your own aggregate progress is included. The card stays
              private until you choose to share the downloaded file.
            </p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                if (exporting.current) return;
                exporting.current = true;
                setBusy(true);
                setError("");
                setNotice("");
                const frozen = {
                  data,
                  rating,
                  category,
                  period,
                  name: name ? me.name : null,
                  timezone: me.timezone,
                };
                try {
                  const { personalProgressCard } =
                    await import("../personal-progress-card.ts");
                  const blob = await personalProgressCard(frozen);
                  if (alive.current) {
                    const url = URL.createObjectURL(blob),
                      a = document.createElement("a");
                    a.href = url;
                    a.download = `shuttl-${category.toLowerCase()}-progress.png`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 30000);
                    setNotice(
                      "Your private progress card is ready. No public link was created.",
                    );
                  }
                } catch (e) {
                  if (alive.current) setError(errorMessage(e));
                } finally {
                  exporting.current = false;
                  if (alive.current) setBusy(false);
                }
              }}
            >
              <Download size={16} />
              {busy ? "Preparing progress card…" : "Download progress card"}
            </button>
            {notice && <p role="status">{notice}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
