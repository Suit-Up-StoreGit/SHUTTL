import { useEffect, useState } from "react";
import { api, dateLabel, errorMessage } from "../api.ts";
import { FORMATS, type Category, type Format } from "../domain.ts";
import {
  Avatar,
  CategoryTabs,
  Empty,
  InlineError,
  SectionHeading,
  Spinner,
} from "./UI.tsx";

export function PlayingInsights({
  category,
  setCategory,
}: {
  category: Category;
  setCategory: (c: Category) => void;
}) {
  const [period, setPeriod] = useState("30"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(`/insights?category=${category}&period=${period}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [category, period, attempt]);
  return (
    <>
      <CategoryTabs value={category} onChange={setCategory} />
      <div className="field">
        <label htmlFor="insights-period">Your playing period</label>
        <select
          id="insights-period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="7">Last seven days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">Career history</option>
        </select>
      </div>
      <InlineError message={error} />
      {error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((v) => v + 1)}
        >
          Retry playing insights
        </button>
      )}
      {!data && !error ? (
        <Spinner />
      ) : (
        data && (
          <>
            <section className="panel">
              <SectionHeading title="What your recorded play shows" />
              <div className="weekly-facts">
                <div>
                  <strong>{data.count}</strong>
                  <span>published results</span>
                </div>
                <div>
                  <strong>
                    {data.count
                      ? data.wins + "–" + (data.count - data.wins)
                      : "—"}
                  </strong>
                  <span>wins / losses</span>
                </div>
                <div>
                  <strong>
                    {data.delta === null
                      ? "—"
                      : `${data.delta >= 0 ? "+" : ""}${data.delta}`}
                  </strong>
                  <span>visible rating change</span>
                </div>
              </div>
              <p className="form-help">
                {data.count
                  ? `${dateLabel(data.firstPlayed)} – ${dateLabel(data.lastPlayed)}. `
                  : ""}
                Confirmed play, including previously published results with a
                pending review or correction.{" "}
                {data.limited
                  ? "This view covers your latest 2,000 results in the selected period."
                  : "This covers the selected period’s published history."}
              </p>
              {!data.count && (
                <Empty title="Your next match adds context">
                  Choose a longer period or return after your next confirmed
                  result.
                </Empty>
              )}
            </section>
            {category !== "Singles" && (
              <section className="panel settings-panel">
                <SectionHeading title="Your partnerships" />
                <p className="form-help">
                  Team outcomes while playing together. Different opponents and
                  small samples affect these records; they do not measure a
                  partner’s contribution.
                </p>
                {data.partners.map((v: any) => (
                  <div className="insight-person" key={v.player.id}>
                    <Avatar player={v.player} />
                    <div>
                      <strong>{v.player.name}</strong>
                      <span>
                        {v.count} {v.count === 1 ? "match" : "matches"} together
                        {v.count < 5 ? " · small sample" : ""}
                      </span>
                    </div>
                    <b>
                      {v.wins}–{v.count - v.wins}
                    </b>
                  </div>
                ))}
                {!data.partners.length && (
                  <p className="form-help">
                    No recorded partnerships in this period.
                  </p>
                )}
              </section>
            )}
            <section className="panel settings-panel">
              <SectionHeading title="Your regular opponents" />
              <p className="form-help">
                Actual outcomes against each player. In Doubles and Mixed, these
                are team results.
              </p>
              {data.opponents.slice(0, 12).map((v: any) => (
                <div className="insight-person" key={v.player.id}>
                  <Avatar player={v.player} />
                  <div>
                    <strong>{v.player.name}</strong>
                    <span>
                      {v.count} shared {v.count === 1 ? "result" : "results"}
                      {v.count < 5 ? " · small sample" : ""}
                    </span>
                  </div>
                  <b>
                    {v.wins}–{v.count - v.wins}
                  </b>
                </div>
              ))}
              {!data.opponents.length && (
                <p className="form-help">
                  No opponents recorded in this period.
                </p>
              )}
              {data.opponents.length > 12 && (
                <p className="form-help">
                  Showing your twelve most frequent opponents. The full roster
                  remains in match history.
                </p>
              )}
            </section>
            <section className="panel settings-panel">
              <SectionHeading title="The formats you play" />
              {data.formats.map((v: any) => (
                <div className="field-row" key={v.format}>
                  <span>{FORMATS[v.format as Format].label}</span>
                  <strong>
                    {v.count} results · {v.wins} wins
                  </strong>
                </div>
              ))}
              <p className="form-help">
                A completed best-of-three match counts as one result. These
                records cannot diagnose footwork, shot selection or a technical
                weakness.
              </p>
            </section>
          </>
        )
      )}
    </>
  );
}
