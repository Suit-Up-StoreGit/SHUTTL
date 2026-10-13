import test from "node:test";
import assert from "node:assert/strict";
import {
  scorePatterns,
  progressCsv,
  type ScoreMatch,
} from "../src/playbook.ts";

test("score patterns orient to the requesting side, count games separately and distinguish actual best-of-three deciders", () => {
  const rows: ScoreMatch[] = [
    {
      unitId: "first",
      playedAt: "2026-10-12T12:00:00Z",
      format: "BO3_21",
      games: [
        [21, 19],
        [15, 21],
        [19, 21],
      ],
      ownSide: 1,
      won: true,
      score: null,
      delta: null,
    },
    {
      unitId: "second",
      playedAt: "2026-10-13T12:00:00Z",
      format: "ONE_21",
      games: [[21, 18]],
      ownSide: 0,
      won: true,
      score: 1500,
      delta: null,
    },
  ];
  const result = scorePatterns(rows);
  assert.equal(result.games, 4);
  assert.equal(result.pointsFor, 82);
  assert.equal(result.pointsAgainst, 73);
  assert.deepEqual(result.close, {
    count: 3,
    wins: 2,
    units: ["first", "second"],
  });
  assert.deepEqual(result.deciders, { count: 1, wins: 1, units: ["first"] });
  assert.equal(result.formats.length, 2);
  const csv = progressCsv(rows);
  assert.match(csv, /"19-21 \/ 21-15 \/ 21-19"/);
  assert.match(csv, /"Win","",""/);
  assert.match(csv, /"Win","1500",""/);
  assert.equal(scorePatterns([]).close.count, 0);
});
