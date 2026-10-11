import test from "node:test";
import assert from "node:assert/strict";
import { pilotMetrics, researchMetrics } from "../server/pilot-metrics.ts";
test("retention excludes immature windows and never counts a backdated playing date as an app return", () => {
  const report = pilotMetrics(
    [
      {
        id: "mature",
        joined: "2026-08-01T00:00:00Z",
        actions: ["2026-08-09T00:00:00Z", "2026-08-31T01:00:00Z"],
        firstPublished: "2026-08-02T00:00:00Z",
      },
      {
        id: "former-player",
        joined: "2026-08-01T00:00:00Z",
        actions: [],
        firstPublished: null,
      },
      {
        id: "recent",
        joined: "2026-10-08T00:00:00Z",
        actions: ["2026-10-09T00:00:00Z"],
        firstPublished: null,
      },
    ],
    "2026-10-11T00:00:00Z",
  );
  assert.equal(report.accounts, 3);
  assert.deepEqual(report.D7LedgerReturn, {
    eligible: 2,
    returned: 1,
    rate: 0.5,
    window: "days 7 through 13 after signup",
  });
  assert.equal(report.D30LedgerReturn.rate, 0.5);
  assert.equal(report.firstPublication.medianHours, 24);
  assert.equal(
    pilotMetrics([], "2026-10-11T00:00:00Z").D30LedgerReturn.rate,
    null,
  );
});
test("research view windows are consent-based, fully observed and exclude expired data coverage", () => {
  const r = researchMetrics(
    [
      {
        enrolled: "2026-08-01T00:00:00Z",
        events: [
          { kind: "home-view", at: "2026-08-09T00:00:00Z" },
          { kind: "comparison-view", at: "2026-08-31T00:00:00Z" },
          { kind: "home-view", at: "2027-01-01T00:00:00Z" },
        ],
      },
      { enrolled: "2026-08-01T00:00:00Z", events: [] },
      {
        enrolled: "2026-10-10T00:00:00Z",
        events: [{ kind: "home-view", at: "2026-10-11T00:00:00Z" }],
      },
      { enrolled: "2026-01-01T00:00:00Z", events: [] },
    ],
    "2026-10-11T00:00:00Z",
  );
  assert.equal(r.currentConsentingAccounts, 3);
  assert.equal(r.outsideRetentionWindow, 1);
  assert.equal(r.D7ConsentedViewReturn.eligible, 2);
  assert.equal(r.D7ConsentedViewReturn.rate, 0.5);
  assert.equal(r.D30ConsentedViewReturn.rate, 0.5);
  assert.equal(r.events.find((e) => e.kind === "home-view")!.observations, 2);
  assert.equal(
    researchMetrics([], "2026-10-11T00:00:00Z").D30ConsentedViewReturn.rate,
    null,
  );
});
