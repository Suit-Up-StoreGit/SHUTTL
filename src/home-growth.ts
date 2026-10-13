import { leagueFor } from "./domain.ts";

export function milestoneFor(
  change: any,
): "reveal" | "promotion" | "best" | null {
  if (!change || change.count < 5 || !Number.isFinite(change.after))
    return null;
  if (change.count === 5) return "reveal";
  if (
    Number.isFinite(change.before) &&
    leagueFor(change.after).floor > leagueFor(change.before).floor
  )
    return "promotion";
  if (Number.isFinite(change.peakBefore) && change.after > change.peakBefore)
    return "best";
  return null;
}

export function progressTrace(
  trajectory: { score: number; playedAt: string }[],
  width = 320,
  height = 96,
  minimumSpan = 0,
) {
  const rows = trajectory.filter(
    (p) => Number.isFinite(p.score) && Number.isFinite(Date.parse(p.playedAt)),
  );
  if (!rows.length) return null;
  const scores = rows.map((p) => p.score),
    low = Math.min(...scores),
    high = Math.max(...scores);
  const first = Date.parse(rows[0].playedAt),
    last = Date.parse(rows.at(-1)!.playedAt);
  const span = Math.max(high - low, minimumSpan),
    bottom = low - (span - (high - low)) / 2;
  const points = rows.map((p, i) => ({
    x:
      rows.length === 1
        ? width / 2
        : last === first
          ? (i / (rows.length - 1)) * width
          : ((Date.parse(p.playedAt) - first) / (last - first)) * width,
    y: span === 0 ? height / 2 : height - ((p.score - bottom) / span) * height,
  }));
  return {
    low,
    high,
    scaleLow: bottom,
    scaleHigh: bottom + span,
    points,
    path: points
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" "),
  };
}
