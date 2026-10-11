import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrationStudy } from "../server/calibration.ts";
function input() {
  return {
    provenance: {
      source: "synthetic-fixture",
      consentReference: "No people; numerical fixture",
      frozenProtocolReference: "Fixture-only",
    },
    plan: {
      cutoff: "2026-01-02T00:00:00Z",
      heldoutNetworks: ["cold"],
      minimumHeldout: 100,
      maximumBrier: 0.25,
      maximumLogLoss: 0.7,
      eloNonInferiorityMargin: 0.01,
    },
    matches: [
      {
        id: "first",
        network: "known",
        category: "Singles",
        format: "ONE_21",
        roster: ["a", "b"],
        games: [[21, 17]],
        playedAt: "2026-01-01T12:00:00Z",
        confirmedAt: "2026-01-01T12:10:00Z",
        revision: 1,
        correctedOrDisputed: false,
      },
      {
        id: "heldout",
        network: "known",
        category: "Singles",
        format: "ONE_21",
        roster: ["a", "b"],
        games: [[21, 15]],
        playedAt: "2026-01-02T12:00:00Z",
        confirmedAt: "2026-01-02T12:10:00Z",
        revision: 1,
        correctedOrDisputed: false,
      },
      {
        id: "cold",
        network: "cold",
        category: "Doubles",
        format: "ONE_21",
        roster: ["c", "d", "e", "f"],
        games: [[18, 21]],
        playedAt: "2026-01-03T12:00:00Z",
        confirmedAt: "2026-01-03T12:10:00Z",
        revision: 1,
        correctedOrDisputed: false,
      },
    ],
  };
}
test("heldout forecasts exclude later results and late confirmations; categories and cold networks remain independent", () => {
  const a = input(),
    first = calibrationStudy(a);
  assert.ok(first.predictions[0].p > 0.5);
  assert.equal(first.predictions[1].p, 0.5);
  assert.equal(first.overall.predeclaredNumericalTargets, null);
  assert.equal(first.eligibleForAcceptance, false);
  const late = input();
  late.matches[0].confirmedAt = "2026-01-04T12:00:00Z";
  assert.equal(calibrationStudy(late).predictions[0].p, 0.5);
  const changed = input();
  changed.matches[2].games = [[21, 18]];
  assert.equal(
    calibrationStudy(changed).predictions[0].p,
    first.predictions[0].p,
  );
});
test("calibration rejects duplicate matches, overlapping independent networks and unsupported corrected-outcome selection", () => {
  const duplicate = input();
  duplicate.matches.push(duplicate.matches[0]);
  assert.throws(() => calibrationStudy(duplicate), /Duplicate/);
  const overlap = input();
  overlap.matches[2].roster[0] = "a";
  assert.throws(() => calibrationStudy(overlap), /share a player/);
  const corrected = input();
  (corrected.matches[0] as any).correctedOrDisputed = true;
  assert.throws(() => calibrationStudy(corrected));
});
