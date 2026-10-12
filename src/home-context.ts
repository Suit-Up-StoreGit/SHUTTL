import { comparable } from "./experience.ts";
import { CATEGORIES, type Category } from "./domain.ts";

export type HomeCheck = {
  owner: string;
  at: string;
  items: Record<string, string[]>;
  notifications: string[];
  own: any[];
  friends: { id: string; ratings: any[] }[];
};
export function activityDateLabel(
  date: string,
  timezone: string,
  now = Date.now(),
) {
  const calendar = (time: number) => {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(time);
    const value = (type: string) =>
      Number(parts.find((p) => p.type === type)!.value);
    return {
      year: value("year"),
      day: Date.UTC(value("year"), value("month") - 1, value("day")),
    };
  };
  const current = calendar(now),
    played = calendar(Date.parse(date));
  const days = (current.day - played.day) / 86400000;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    ...(played.year !== current.year ? { year: "numeric" } : {}),
  }).format(new Date(date));
}
export function homeCheck(data: any): HomeCheck {
  const items: Record<string, string[]> = {};
  for (const entry of data.feed) {
    const unit = entry.unitId || entry.id;
    items[unit] = [...(items[unit] || []), entry.id];
  }
  return {
    owner: data.me.id,
    at: new Date().toISOString(),
    items,
    notifications: (data.competitionUpdates || []).map(
      (n: any) => n.id || `${n.category}:${n.createdAt}`,
    ),
    own: data.me.ratings,
    friends: data.friends.map((p: any) => ({ id: p.id, ratings: p.ratings })),
  };
}
export function readHomeCheck(owner: string): {
  check: HomeCheck | null;
  available: boolean;
} {
  try {
    const check = JSON.parse(
      localStorage.getItem(`shuttl:home-check:${owner}`) || "null",
    );
    if (!check) return { check: null, available: true };
    const rating = (r: any) =>
      r &&
      CATEGORIES.includes(r.category) &&
      (r.score === null || Number.isFinite(r.score)) &&
      typeof r.status === "string";
    if (
      check.owner !== owner ||
      !Number.isFinite(Date.parse(check.at)) ||
      !check.items ||
      !Object.values(check.items).every(
        (ids) =>
          Array.isArray(ids) && ids.every((id) => typeof id === "string"),
      ) ||
      !Array.isArray(check.notifications) ||
      !check.notifications.every((id: any) => typeof id === "string") ||
      !Array.isArray(check.own) ||
      !check.own.every(rating) ||
      !Array.isArray(check.friends) ||
      !check.friends.every(
        (p: any) =>
          p &&
          typeof p.id === "string" &&
          Array.isArray(p.ratings) &&
          p.ratings.every(rating),
      )
    )
      return { check: null, available: true };
    return { check, available: true };
  } catch {
    return { check: null, available: false };
  }
}
export function activityChange(group: any[], check: HomeCheck | null) {
  if (!check) return null;
  const unit = group[0].unitId || group[0].id;
  const ids = check.items[unit];
  if (!ids) return "new";
  return group.some((entry) => !ids.includes(entry.id)) ? "updated" : null;
}
export function returnSummary(data: any, check: HomeCheck | null) {
  if (!check || check.owner !== data.me.id)
    return { newMatches: 0, updatedMatches: 0, milestones: 0, comparisons: 0 };
  const groups = new Map<string, any[]>();
  for (const entry of data.feed) {
    const key = entry.unitId || entry.id;
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  const fresh = [...groups.values()].filter((group) =>
    activityChange(group, check),
  );
  return {
    newMatches: fresh.filter((group) => activityChange(group, check) === "new")
      .length,
    updatedMatches: fresh.filter(
      (group) => activityChange(group, check) === "updated",
    ).length,
    milestones: fresh.filter((group) =>
      group.some((entry) => entry.milestone && entry.score !== null),
    ).length,
    comparisons: (data.competitionUpdates || []).filter(
      (n: any) =>
        (!n.peerId ||
          (() => {
            const own = data.me.ratings.find(
              (r: any) => r.category === n.category,
            );
            const peer = data.friends
              .find((p: any) => p.id === n.peerId)
              ?.ratings.find((r: any) => r.category === n.category);
            return (
              own &&
              peer &&
              comparable(own, peer) &&
              own.status !== "Pair-linked" &&
              peer.status !== "Pair-linked" &&
              peer.score > own.score
            );
          })()) &&
        !check.notifications.includes(n.id || `${n.category}:${n.createdAt}`),
    ).length,
  };
}
export function comparisonMovement(
  check: HomeCheck | null,
  own: any,
  friend: any,
  category: Category,
) {
  if (!check || !friend || !comparable(own, friend.rating)) return null;
  const oldOwn = check.own.find((r) => r.category === category);
  const oldPeer = check.friends
    .find((p) => p.id === friend.id)
    ?.ratings.find((r) => r.category === category);
  if (
    !oldOwn ||
    !oldPeer ||
    !comparable(oldOwn, oldPeer) ||
    oldOwn.comparisonClass !== own.comparisonClass ||
    [oldOwn, oldPeer, own, friend.rating].some(
      (r) => r.status === "Pair-linked",
    )
  )
    return null;
  const before = oldPeer.score - oldOwn.score,
    now = friend.rating.score - own.score;
  if (before <= 0 && now > 0) return `Now ${now} points ahead of your estimate`;
  if (before > 0 && now <= 0)
    return now === 0
      ? "Your estimates are now level"
      : `Your estimate is now ${-now} points ahead`;
  if (before < now && before < 0 && now < 0)
    return `Your lead narrowed from ${-before} to ${-now} points`;
  if (before > now && before > 0 && now > 0)
    return `The gap narrowed from ${before} to ${now} points`;
  return null;
}
