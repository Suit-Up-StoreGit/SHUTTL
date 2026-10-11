import test from "node:test";
import assert from "node:assert/strict";
import {
  comparable,
  comparisonCopy,
  periodSummary,
  publishedPlayedAt,
  recentRosters,
  resultMoment,
} from "../src/experience.ts";
import type { PublicRating } from "../src/domain.ts";
const rating = (
  score: number | null,
  comparisonClass: string | null = "a",
  category: PublicRating["category"] = "Doubles",
): PublicRating => ({
  score,
  comparisonClass,
  category,
  count: 5,
  peak: score,
  status: "Developing",
  league: "Ruby",
  lastPlayed: null,
  partnerCount: 2,
});
test("direct rivalry requires same category and supported shared evidence", () => {
  assert.equal(comparable(rating(1600), rating(1620)), true);
  for (const other of [
    rating(null),
    rating(1620, null),
    rating(1620, "b"),
    rating(1620, "a", "Mixed"),
  ]) {
    assert.equal(comparable(rating(1600), other), false);
    assert.doesNotMatch(
      comparisonCopy(rating(1600), other),
      /points ahead|points behind/,
    );
  }
  assert.match(comparisonCopy(rating(1600), rating(1600)), /Level estimates/);
  assert.equal(
    comparisonCopy(
      { ...rating(null), count: 1 },
      { ...rating(null), count: 3 },
    ),
    "Your reveal: 1 of 5 confirmed results · theirs: 3 of 5 confirmed results",
  );
  assert.equal(
    comparisonCopy(rating(1600), { ...rating(null), count: 2 }),
    "Their reveal: 2 of 5 confirmed results",
  );
  assert.match(
    comparisonCopy(rating(1600), {
      ...rating(1620, null),
      status: "Pair-linked",
    }),
    /regular partnership makes individual comparison unclear/,
  );
});
const result = (
  id: string,
  count: number,
  before: number,
  after: number,
  playedAt: string,
) => ({
  id,
  category: "Singles",
  status: "rated",
  publishedRevisionId: "approved",
  players: [],
  playedAt,
  ratingChanges: {
    me: {
      count,
      before,
      after,
      delta: after - before,
      won: after > before,
      peakBefore: before,
    },
  },
});
test("reveal and period change use a visible baseline, with deterministic equal-time ordering", () => {
  const timestamp = "2026-10-11T00:00:00Z";
  const reveal = result("a", 5, 1707, 1515, timestamp),
    later = result("b", 6, 1515, 1543, timestamp);
  assert.equal(resultMoment(reveal)?.kind, "reveal");
  const summary = periodSummary(
    [later, reveal],
    "Singles",
    7,
    Date.parse(timestamp),
  );
  assert.equal(summary.delta, 28);
  assert.equal(summary.count, 2);
  assert.equal(
    periodSummary([reveal], "Mixed", 7, Date.parse(timestamp)).count,
    0,
  );
  assert.equal(
    resultMoment({ ...later, status: "correction_pending" })?.kind,
    "previous",
  );
  const corrected = {
    ...later,
    status: "correction_pending",
    playedAt: "2026-11-11T00:00:00Z",
    publishedResult: { playedAt: timestamp },
  };
  assert.equal(publishedPlayedAt(corrected), timestamp);
  assert.deepEqual(
    periodSummary([corrected, reveal], "Singles", 7, Date.parse(timestamp)),
    { ...summary, rows: [reveal, corrected] },
  );
});
test("recent roster maps a claimed identity and preserves actual sides", () => {
  const me = { id: "me", name: "Me", username: "me" };
  const row = {
    id: "a",
    category: "Doubles",
    status: "rated",
    format: "ONE_21",
    playedAt: "2026-10-10T10:00:00Z",
    ownParticipant: "old-guest",
    players: [
      { id: "other", name: "Other" },
      { id: "partner", name: "Partner" },
      { id: "friend", name: "Friend" },
      { id: "old-guest", canonicalId: "me", name: "Me" },
    ],
  };
  const [recent] = recentRosters([row], me, "Doubles");
  assert.deepEqual(
    recent.roster.map((p: any) => p.id),
    ["me", "friend", "other", "partner"],
  );
  assert.equal(
    recentRosters(
      [{ ...row, players: row.players.map((p) => ({ ...p, guest: true })) }],
      me,
      "Doubles",
    ).length,
    0,
  );
});
