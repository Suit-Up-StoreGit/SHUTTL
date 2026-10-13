import { LEAGUES, leagueFor } from "./domain.ts";

export type StudioPoint = {
  unitId: string;
  playedAt: string;
  score: number | null;
  before: number | null;
  count: number;
  won: boolean;
  delta: number | null;
};

function windowFacts(rows: StudioPoint[]) {
  const visible = rows.filter((r) => r.count >= 5 && r.score !== null);
  const first = visible[0],
    last = visible.at(-1);
  const baseline = first?.count === 5 ? first.score : first?.before;
  return {
    count: rows.length,
    wins: rows.filter((r) => r.won).length,
    delta:
      last && baseline !== null && baseline !== undefined
        ? last.score! - baseline
        : null,
  };
}

// Recomputed from published evidence. A correction can revise the collection;
// no permanent reward store, streak points or extra rating credit is introduced.
export function studioSummary(
  points: StudioPoint[],
  period: string,
  asOf: number,
  limited = false,
) {
  const rows = points
    .filter(
      (r) =>
        Number.isFinite(Date.parse(r.playedAt)) &&
        Date.parse(r.playedAt) <= asOf,
    )
    .sort(
      (a, b) =>
        a.playedAt.localeCompare(b.playedAt) ||
        a.unitId.localeCompare(b.unitId),
    );
  const published = rows.filter(
    (r) => r.count >= 5 && r.score !== null && Number.isFinite(r.score),
  );
  const collection: {
    league: string;
    unitId: string;
    playedAt: string;
    score: number;
    kind: string;
  }[] = [];
  let highest = -Infinity;
  for (const r of published) {
    const league = leagueFor(r.score!);
    if (!collection.length) {
      collection.push({
        league: league.name,
        unitId: r.unitId,
        playedAt: r.playedAt,
        score: r.score!,
        kind:
          r.count === 5
            ? "Starting league"
            : limited
              ? "Recorded in snapshot"
              : collection.length
                ? "League reached"
                : "Recorded league",
      });
      highest = r.score!;
    } else if (r.score! > highest) {
      for (const crossed of LEAGUES.filter(
        (l) => l.floor > highest && l.floor <= r.score!,
      ))
        collection.push({
          league: crossed.name,
          unitId: r.unitId,
          playedAt: r.playedAt,
          score: r.score!,
          kind: "Threshold crossed",
        });
      highest = r.score!;
    }
  }
  const peak = published.reduce<StudioPoint | null>(
    (best, r) => (!best || r.score! > best.score! ? r : best),
    null,
  );
  const reveal = published.find((r) => r.count === 5) || null;
  const duration = period === "all" ? null : Number(period) * 86400000;
  const start = duration === null ? -Infinity : asOf - duration;
  const current = windowFacts(
    rows.filter((r) => Date.parse(r.playedAt) >= start),
  );
  const previous =
    duration === null
      ? null
      : windowFacts(
          rows.filter(
            (r) =>
              Date.parse(r.playedAt) >= start - duration &&
              Date.parse(r.playedAt) < start,
          ),
        );
  return {
    collection,
    peak,
    reveal,
    startingLeague: published[0] ? leagueFor(published[0].score!).name : null,
    comparison: previous
      ? {
          current,
          previous,
          days: Number(period),
          smallSample: current.count < 5 || previous.count < 5,
        }
      : null,
    limited,
  };
}
