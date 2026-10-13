import { FORMATS } from "../domain.ts";
export default function ScorePatterns({
  data,
  open,
  disabled,
}: {
  data: any;
  open: (id: string) => void;
  disabled: boolean;
}) {
  const patterns = data.patterns;
  if (!patterns) return null;
  return (
    <section className="studio-patterns" aria-label="Score patterns">
      <span className="eyebrow">THE SCORELINE / MORE CONTEXT</span>
      <h3>Where games get close.</h3>
      <p>
        Actual scores in your selected period. A close game finishes within
        three points; it does not tell us how the rally unfolded.
      </p>
      <div className="pattern-grid">
        {[
          { name: "Close games", ...patterns.close },
          { name: "Third-game deciders", ...patterns.deciders },
        ].map((item) => (
          <div key={item.name}>
            <span>{item.name}</span>
            <strong>
              {item.count ? `${item.wins}–${item.count - item.wins}` : "—"}
            </strong>
            <small>{item.count} recorded · wins / losses</small>
            {item.count > 0 && (
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => open(item.units.at(-1))}
              >
                Open latest supporting match
              </button>
            )}
          </div>
        ))}
      </div>
      <details>
        <summary>Recorded formats & points</summary>
        {patterns.formats.map((f: any) => (
          <p key={f.format}>
            <strong>
              {FORMATS[f.format as keyof typeof FORMATS]?.label || f.format}
            </strong>{" "}
            · {f.count} matches · {f.wins}–{f.count - f.wins}
          </p>
        ))}
        <p>
          {patterns.games} games · {patterns.pointsFor} points for your side ·{" "}
          {patterns.pointsAgainst} against. Totals depend on format and number
          of games; they are not a performance grade.
        </p>
      </details>
      <p>
        {data.limited ? "Limited snapshot. " : ""}Small samples and changing
        opponents limit comparisons. In doubles these are team scores. Use your
        playbook to reflect; scores alone cannot identify a technical weakness.
      </p>
    </section>
  );
}
