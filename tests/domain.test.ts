import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FORMATS,
  validateGames,
  publicRating,
  leagueFor,
  initialRating,
  updateRatings,
  outcomeMoments,
  uncertaintyAt,
  type Category,
  type Rating,
} from "../src/domain.ts";
import { comparisonClasses } from "../server/evidence.ts";
test("all supported caps, empty values and series termination", () => {
  for (const [format, f] of Object.entries(FORMATS)) {
    const good: [number, number] = [f.target, f.target - 2];
    assert.equal(
      validateGames(
        format as keyof typeof FORMATS,
        f.series ? [good, good] : [good],
      ),
      0,
    );
    assert.equal(
      validateGames(
        format as keyof typeof FORMATS,
        f.series
          ? [
              [f.cap, f.cap - 1],
              [f.cap, f.cap - 1],
            ]
          : [[f.cap, f.cap - 1]],
      ),
      0,
    );
    assert.throws(() =>
      validateGames(
        format as keyof typeof FORMATS,
        f.series
          ? [[f.target, f.target - 1], good]
          : [[f.target, f.target - 1]],
      ),
    );
    assert.throws(() =>
      validateGames(format as keyof typeof FORMATS, [[21.5, 18]]),
    );
  }
  assert.throws(() =>
    validateGames("BO3_21", [
      [21, 18],
      [18, 21],
    ]),
  );
  assert.throws(() =>
    validateGames("BO3_21", [
      [21, 18],
      [21, 18],
      [21, 19],
    ]),
  );
  assert.equal(
    validateGames("BO3_21", [
      [21, 18],
      [18, 21],
      [30, 29],
    ]),
    0,
  );
});
test("display, leagues and ties use the same integer rule", () => {
  assert.equal(publicRating(1549.5), 1550);
  assert.equal(leagueFor(publicRating(1549.5)).name, "Ruby");
  assert.equal(publicRating(-0.5), -1);
  assert.equal(publicRating(1499.49), 1499);
  assert.equal(leagueFor(2050).name, "Grandmaster");
  assert.equal(leagueFor(1249).name, "Crystal");
});
test("placement does not manufacture a peak from the starting prior", () => {
  let players = [initialRating(), initialRating()];
  for (let i = 0; i < 5; i++)
    players = updateRatings(
      players,
      "Singles",
      1,
      new Date(1700000000000 + i * 86400000).toISOString(),
    );
  assert.equal(players[0].peak, players[0].mu);
  assert.ok(players[0].mu < 1500);
  assert.equal(players[0].count, 5);
});
test("tail moments stay finite and result direction stays correct", () => {
  for (const z of [-1000000, -1000, -40, -13, -12, -8, 0, 8, 12, 1000]) {
    const [v, w] = outcomeMoments(z);
    assert.ok(Number.isFinite(v) && Number.isFinite(w));
    assert.ok(v >= 0 && w >= 0 && w <= 1);
  }
  const players = [
    initialRating(),
    initialRating(),
    initialRating(),
    initialRating(),
  ];
  const after = updateRatings(
    players,
    "Doubles",
    0,
    "2026-10-10T10:00:00.000Z",
  );
  assert.ok(
    after[0].mu > 1500 &&
      after[1].mu > 1500 &&
      after[2].mu < 1500 &&
      after[3].mu < 1500,
  );
  const away = { ...after[0] };
  uncertaintyAt(away, "Doubles", "2026-12-10T10:00:00.000Z");
  assert.equal(away.mu, after[0].mu);
});
test("published reference fixtures agree with the actual shipped engine", () => {
  const fixtures = JSON.parse(
    readFileSync(
      new URL("./fixtures/rating-reference.json", import.meta.url),
      "utf8",
    ),
  ) as {
    category: Category;
    players: Rating[];
    winner: number;
    playedAt: string;
    expected: { mu: number; variance: number }[];
  }[];
  for (const f of fixtures) {
    const result = updateRatings(f.players, f.category, f.winner, f.playedAt);
    result.forEach((p, i) => {
      assert.ok(
        Math.abs(p.mu - f.expected[i].mu) < 1e-5,
        `mean mismatch ${p.mu} / ${f.expected[i].mu}`,
      );
      assert.ok(
        Math.abs(p.variance - f.expected[i].variance) < 1e-4,
        `variance mismatch ${p.variance} / ${f.expected[i].variance}`,
      );
    });
  }
  assert.equal(fixtures.length, 400);
});
test("exact evidence separates fixed pairs and restricted Mixed classes", () => {
  const fixed = comparisonClasses([
    ["a", "b", "c", "d"],
    ["a", "b", "c", "d"],
  ]);
  assert.notEqual(fixed.classes.get("a"), fixed.classes.get("b"));
  const rotating = comparisonClasses([
    ["a", "b", "c", "d"],
    ["a", "c", "b", "d"],
    ["a", "d", "b", "c"],
  ]);
  assert.equal(new Set(rotating.classes.values()).size, 1);
  const mixed = comparisonClasses([
    ["a", "c", "b", "d"],
    ["a", "d", "b", "c"],
  ]);
  assert.equal(mixed.classes.get("a"), mixed.classes.get("b"));
  assert.equal(mixed.classes.get("c"), mixed.classes.get("d"));
  assert.notEqual(mixed.classes.get("a"), mixed.classes.get("c"));
  const large = Array.from({ length: 130 }, (_, i) => ["p" + i, "p" + (i + 1)]);
  assert.equal(comparisonClasses(large).bounded, false);
});
