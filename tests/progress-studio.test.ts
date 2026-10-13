import test from "node:test";
import assert from "node:assert/strict";
import { studioSummary, type StudioPoint } from "../src/progress-studio.ts";
const at = Date.parse("2026-10-13T12:00:00Z");
const point = (
  count: number,
  score: number | null,
  before: number | null = score,
  days = 0,
): StudioPoint => ({
  unitId: `match-${count}`,
  playedAt: new Date(at - days * 86400000).toISOString(),
  count,
  score,
  before,
  delta: score !== null && before !== null ? score - before : null,
  won: count % 2 === 0,
});
test("earned seals preserve recorded highs through losses, revise on correction and never unlock from an unpublished prior", () => {
  const hidden = point(4, 2000, 1900, 4),
    reveal = point(5, 1500, null, 3),
    promotion = point(6, 1560, 1500, 2),
    loss = point(7, 1380, 1560, 1);
  let report = studioSummary([hidden, reveal, promotion, loss], "all", at);
  assert.deepEqual(
    report.collection.map((x) => x.league),
    ["Sapphire", "Ruby"],
  );
  assert.equal(report.reveal?.unitId, "match-5");
  assert.equal(report.peak?.score, 1560);
  report = studioSummary(
    [hidden, reveal, { ...promotion, score: 1480 }, loss],
    "all",
    at,
  );
  assert.deepEqual(
    report.collection.map((x) => x.league),
    ["Sapphire"],
  );
  assert.equal(report.peak?.score, 1500);
  assert.deepEqual(studioSummary([hidden], "30", at).collection, []);
});
test("period comparisons use nonoverlapping equal windows and hide the first reveal's pre-publication baseline", () => {
  const report = studioSummary(
    [
      point(4, null, null, 60),
      point(5, 1500, null, 30),
      point(6, 1520, 1500, 0),
    ],
    "30",
    at,
  );
  assert.equal(report.comparison?.current.count, 2);
  assert.equal(report.comparison?.current.delta, 20);
  assert.equal(report.comparison?.previous.count, 1);
  assert.equal(report.comparison?.previous.delta, null);
  assert.equal(report.comparison?.smallSample, true);
  assert.equal(
    studioSummary([point(5, 1500, null)], "7", at).comparison?.current.delta,
    0,
  );
  assert.equal(studioSummary([], "all", at).comparison, null);
});
test("future evidence is excluded and limited-history collections never claim an actual first publication", () => {
  const report = studioSummary(
    [point(80, 1800, 1790, 1), point(81, 1900, 1800, -1)],
    "7",
    at,
    true,
  );
  assert.equal(report.peak?.score, 1800);
  assert.equal(report.reveal, null);
  assert.equal(report.collection[0].kind, "Recorded in snapshot");
  assert.equal(report.limited, true);
  assert.equal(report.comparison?.current.count, 1);
});

test("a published leap earns each genuinely crossed threshold without inventing lower starting leagues", () => {
  const report = studioSummary(
    [point(5, 1500, null, 1), point(6, 1810, 1500)],
    "all",
    at,
  );
  assert.deepEqual(
    report.collection.map((c) => c.league),
    ["Sapphire", "Ruby", "Obsidian", "Diamond"],
  );
  assert.equal(report.collection[1].unitId, "match-6");
  assert.equal(report.collection[1].kind, "Threshold crossed");
  const highStart = studioSummary([point(5, 1810, null)], "all", at);
  assert.deepEqual(
    highStart.collection.map((c) => c.league),
    ["Diamond"],
  );
  assert.equal(highStart.startingLeague, "Diamond");
});
