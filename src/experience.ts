import { leagueFor, type Category, type PublicRating } from "./domain.ts";

export function comparable(a: PublicRating, b: PublicRating) {
  return (
    a.category === b.category &&
    a.score !== null &&
    b.score !== null &&
    !!a.comparisonClass &&
    a.comparisonClass === b.comparisonClass
  );
}

export function comparisonCopy(a: PublicRating, b: PublicRating) {
  if (a.score === null || b.score === null)
    return "Five confirmed results reveal each estimate";
  if (!comparable(a, b))
    return "Separate estimates · direct comparison not yet supported";
  const gap = b.score - a.score;
  return gap === 0
    ? "Level estimates in shared playing evidence"
    : `${Math.abs(gap)} points ${gap > 0 ? "ahead of you" : "behind you"} · developing comparison`;
}

export function ownChange(result: any) {
  return result.ratingChanges
    ? (Object.values(result.ratingChanges)[0] as any)
    : null;
}

export function resultMoment(result: any) {
  const change = ownChange(result);
  if (!change || !result.publishedRevisionId) return null;
  // A recap of a published revision remains separate from an unapproved correction.
  if (result.status !== "rated")
    return { kind: "previous", title: "Previously published estimate", change };
  if (change.count === 5)
    return { kind: "reveal", title: "Your starting rating is here", change };
  if (leagueFor(change.after).floor > leagueFor(change.before).floor)
    return {
      kind: "promotion",
      title: `${leagueFor(change.after).name} reached`,
      change,
    };
  if (change.peakBefore !== undefined && change.after > change.peakBefore)
    return { kind: "best", title: "A new personal best", change };
  return {
    kind: change.won ? "win" : "loss",
    title: change.won
      ? "A result worth earning"
      : "One result. More of your story.",
    change,
  };
}

export function periodSummary(
  results: any[],
  category: Category,
  days = 7,
  now = Date.now(),
) {
  const rows = results
    .filter((r) => r.category === category && r.publishedRevisionId)
    .sort(
      (a, b) =>
        a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id),
    );
  const period = rows.filter(
    (r) =>
      Date.parse(r.playedAt) >= now - days * 86400000 &&
      Date.parse(r.playedAt) <= now,
  );
  const visible = period.map(ownChange).filter((c) => c?.count >= 5);
  const first = visible[0],
    last = visible.at(-1);
  // The first revealed number has no visible pre-placement baseline.
  const baseline = first?.count === 5 ? first.after : first?.before;
  return {
    count: period.length,
    wins: period.filter((r) => (ownChange(r) || r.ownProgress)?.won).length,
    delta: last && baseline !== undefined ? last.after - baseline : null,
    partners: new Set(
      period.flatMap((r) => {
        const i = r.players.findIndex((p: any) => p.id === r.ownParticipant);
        return r.players.length === 4 && i >= 0
          ? [r.players[i % 2 === 0 ? i + 1 : i - 1].id]
          : [];
      }),
    ).size,
    rows: period,
  };
}

export function sharedHistory(
  results: any[],
  playerId: string,
  category: Category,
) {
  return results.filter(
    (r) =>
      r.category === category &&
      r.publishedRevisionId &&
      r.players.some((p: any) => (p.canonicalId || p.id) === playerId),
  );
}

export function recentRosters(results: any[], me: any, category: Category) {
  const seen = new Set<string>();
  return results
    .filter((r) => r.category === category && r.status !== "void")
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    .flatMap((r) => {
      const index = r.players.findIndex(
        (p: any) =>
          (p.canonicalId || p.id) === me.id || p.id === r.ownParticipant,
      );
      if (index < 0 || r.players.some((p: any) => p.guest)) return [];
      const size = r.players.length / 2;
      const side = r.players.slice(
        index < size ? 0 : size,
        index < size ? size : size * 2,
      );
      const other = r.players.slice(
        index < size ? size : 0,
        index < size ? size * 2 : size,
      );
      const roster = [
        me,
        ...side.filter((p: any) => p.id !== r.players[index].id),
        ...other,
      ].map((p) => ({ ...p, id: p.canonicalId || p.id }));
      const key = roster.map((p: any) => p.id).join(":");
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ roster, format: r.format, playedAt: r.playedAt }];
    })
    .slice(0, 3);
}
