import test from "node:test";
import assert from "node:assert/strict";
import {
  homeCheck,
  returnSummary,
  activityChange,
  comparisonMovement,
  readHomeCheck,
  activityDateLabel,
} from "../src/home-context.ts";
const rating = (
  score: number | null,
  category = "Singles",
  comparisonClass = "shared",
) => ({ score, category, comparisonClass, status: "Developing", count: 8 });
const data = () => ({
  me: { id: "owner", ratings: [rating(1500)] },
  friends: [{ id: "friend", ratings: [rating(1520)] }],
  feed: [
    {
      id: "revision-1:friend",
      unitId: "match-1",
      score: 1520,
      milestone: null,
    },
  ],
  competitionUpdates: [],
});
test("return context counts whole new matches and corrections separately, not individual player rows", () => {
  const initial = data(),
    check = homeCheck(initial);
  assert.deepEqual(returnSummary(initial, check), {
    newMatches: 0,
    updatedMatches: 0,
    milestones: 0,
    comparisons: 0,
  });
  const current = {
    ...initial,
    feed: [
      {
        id: "revision-2:friend",
        unitId: "match-1",
        score: 1540,
        milestone: "best",
      },
      { id: "new:friend", unitId: "match-2", score: 1545, milestone: "best" },
      { id: "new:other", unitId: "match-2", score: null, milestone: "reveal" },
    ],
    competitionUpdates: [{ id: "lead-update" }],
  };
  assert.deepEqual(returnSummary(current, check), {
    newMatches: 1,
    updatedMatches: 1,
    milestones: 2,
    comparisons: 1,
  });
  assert.equal(activityChange(current.feed.slice(1), check), "new");
  assert.equal(activityChange([current.feed[0]], check), "updated");
  assert.equal(
    returnSummary(
      { ...current, me: { ...current.me, id: "other-owner" } },
      check,
    ).newMatches,
    0,
  );
});
test("activity dates use the player's calendar day and retain years in older history", () => {
  const now = Date.parse("2026-10-12T00:30:00Z"),
    played = "2026-10-11T22:30:00Z";
  assert.equal(activityDateLabel(played, "Europe/Berlin", now), "Today");
  assert.equal(activityDateLabel(played, "UTC", now), "Yesterday");
  assert.match(activityDateLabel("2025-10-12T12:00:00Z", "UTC", now), /2025/);
});
test("return comparisons distinguish closing gaps, narrowing leads and actual estimate crossings", () => {
  const check = homeCheck(data());
  assert.equal(
    comparisonMovement(
      check,
      rating(1510),
      { id: "friend", rating: rating(1520) },
      "Singles",
    ),
    "The gap narrowed from 20 to 10 points",
  );
  assert.equal(
    comparisonMovement(
      check,
      rating(1530),
      { id: "friend", rating: rating(1520) },
      "Singles",
    ),
    "Your estimate is now 10 points ahead",
  );
  const leader = homeCheck({
    ...data(),
    me: { id: "owner", ratings: [rating(1540)] },
  });
  assert.equal(
    comparisonMovement(
      leader,
      rating(1530),
      { id: "friend", rating: rating(1520) },
      "Singles",
    ),
    "Your lead narrowed from 20 to 10 points",
  );
  assert.equal(
    comparisonMovement(
      leader,
      rating(1510),
      { id: "friend", rating: rating(1520) },
      "Singles",
    ),
    "Now 10 points ahead of your estimate",
  );
  for (const peer of [
    rating(null),
    rating(1520, "Mixed"),
    rating(1520, "Singles", "another-network"),
    { ...rating(1520), status: "Pair-linked" },
  ])
    assert.equal(
      comparisonMovement(
        check,
        rating(1510),
        { id: "friend", rating: peer },
        "Singles",
      ),
      null,
    );
});
test("unavailable or corrupted device memory never manufactures return context", () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    for (const value of [
      "{}",
      JSON.stringify({
        ...homeCheck(data()),
        friends: [{ id: "friend", ratings: "broken" }],
      }),
      JSON.stringify({ ...homeCheck(data()), owner: "another-owner" }),
    ]) {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: { getItem: () => value },
      });
      assert.equal(readHomeCheck("owner").check, null);
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw Error("unavailable");
      },
    });
    assert.deepEqual(readHomeCheck("owner"), { check: null, available: false });
  } finally {
    if (prior) Object.defineProperty(globalThis, "localStorage", prior);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
