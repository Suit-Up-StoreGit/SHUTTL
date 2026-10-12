import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { CATEGORIES, leagueFor } from "../../src/domain.ts";
const output = "outputs/home-focus-2026-10-12";
mkdirSync(output, { recursive: true });
async function fixture(page: Page) {
  const registered = await page.request.post("/api/auth/register", {
    headers: { origin: "http://localhost:4174" },
    data: {
      username: "home_" + randomUUID().slice(0, 8),
      name: "Alexandra Featherstone-Kumar",
      password: "Home-layout-fixture-2026!",
      adult: true,
    },
  });
  expect(registered.status()).toBe(200);
  const me = await (await page.request.get("/api/me")).json();
  const rating = (
    category: string,
    score: number | null,
    comparisonClass = "home-fixture",
    status = "Developing",
  ) => ({
    category,
    score,
    count: score === null ? 0 : 38,
    peak: score === null ? null : Math.max(1664, score),
    league: score === null ? null : leagueFor(score).name,
    status: score === null ? "Unrated" : status,
    partnerCount: 4,
    comparisonClass: score === null ? null : comparisonClass,
    lastPlayed: null,
  });
  const player = (
    id: string,
    name: string,
    score: number,
    comparisonClass = "home-fixture",
    status = "Developing",
  ) => ({
    id,
    name,
    username: id,
    ratings: CATEGORIES.map((c) =>
      rating(c, c === "Mixed" ? null : score, comparisonClass, status),
    ),
  });
  const friends = [
    player("home-priya", "Priya Lim", 1642),
    player("home-chloe", "Chloe Featherstone-Kumar", 1620),
    player("home-kai", "Kai Lee", 1664),
    player(
      "home-unconnected",
      "Disconnected estimate",
      1900,
      "another-network",
    ),
    player(
      "home-pair",
      "Pair-linked estimate",
      2000,
      "home-fixture",
      "Pair-linked",
    ),
  ];
  const feed = [
    { group: "shared-1", p: 0, category: "Singles", score: 1642, delta: 12 },
    { group: "shared-1", p: 1, category: "Singles", score: 1620, delta: -6 },
    {
      group: "match-2",
      p: 2,
      category: "Doubles",
      score: 1664,
      delta: 9,
      milestone: "best",
    },
    { group: "match-3", p: 1, category: "Doubles", score: 1620, delta: -4 },
    { group: "match-4", p: 0, category: "Mixed", score: null, delta: null },
    { group: "match-5", p: 2, category: "Singles", score: 1640, delta: 5 },
  ].map((f, i) => ({
    ...f,
    id: f.group + friends[f.p].id,
    unitId: f.group,
    player: friends[f.p],
    playedAt: new Date(
      Date.now() - (f.group === "shared-1" ? 1 : i) * 3600000,
    ).toISOString(),
    won: f.delta !== null && f.delta > 0,
  }));
  const data: any = {
    me: {
      ...me,
      ratings: CATEGORIES.map((c) => rating(c, c === "Mixed" ? null : 1628)),
      goals: {},
    },
    friends,
    results: [],
    circles: [],
    unread: 0,
    feed,
    competitionUpdates: [
      {
        category: "Singles",
        title: "Priya's singles estimate passed yours",
        detail: "14 rating points apart after a confirmed result.",
        createdAt: new Date().toISOString(),
      },
    ],
  };
  const baselineResponse = await page.request.get("/api/dashboard");
  const baseline = await baselineResponse.json();
  const responseHeaders = {
    "x-shuttl-csrf": baselineResponse.headers()["x-shuttl-csrf"],
  };
  await page.route(/\/api\/dashboard(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: responseHeaders,
      json: { ...baseline, ...data },
    }),
  );
  return { data, me, friends };
}

test("Home puts recording, a supported circle snapshot and real grouped social play ahead of routine statistics", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/home");
  await page
    .getByRole("button", { name: "Doubles", exact: true })
    .first()
    .click();
  const circle = page.getByRole("region", { name: "Your circle estimates" });
  await expect(circle).toContainText("#3");
  await expect(circle).toContainText("You + 3 comparable friends");
  await expect(circle).not.toContainText("Disconnected estimate");
  await expect(circle).not.toContainText("Pair-linked estimate");
  await expect(page.locator(".lead-update")).toHaveCount(0);
  await expect(page.locator(".home-feed-card")).toHaveCount(3);
  await expect(page.locator(".home-feed-card").first()).toContainText(
    "Priya Lim & Chloe Featherstone-Kumar",
  );
  await expect(page.locator(".home-feed-card").first()).toContainText(
    "Singles",
  );
  await expect(
    page.locator(".home-feed-card").first().locator(".home-feed-facts > div"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Show more activity" }).click();
  await expect(page.locator(".home-feed-card")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Show more activity" }),
  ).toHaveCount(0);
  const filter = page.getByRole("group", { name: "Activity categories" });
  await filter
    .getByRole("button", { name: "Doubles activity", exact: true })
    .click();
  await expect(page.locator(".home-feed-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Singles", exact: true })
    .first()
    .click();
  await expect(page.locator(".lead-update")).toContainText(
    "Priya's singles estimate passed yours",
  );
  await expect(
    page.locator(".weekly-panel,.latest-result,.rival-strip,.progress-panel"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Record a result", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Record a result", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByLabel("Find a player in loaded results"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "History", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("placement, ties, pair-linked evidence, breaks and saved comparisons retain honest next actions", async ({
  page,
}) => {
  const { data, me, friends } = await fixture(page);
  friends[0].ratings.find((r) => r.category === "Doubles")!.score = 1628;
  friends[2].ratings.find((r) => r.category === "Doubles")!.score = 1628;
  await page.goto("/home");
  await page
    .getByRole("button", { name: "Doubles", exact: true })
    .first()
    .click();
  await expect(page.locator(".circle-position")).toContainText("Tied #1");
  await page.evaluate(
    ({ owner, friend }) =>
      localStorage.setItem(`shuttl:rival:${owner}:Doubles`, friend),
    { owner: me.id, friend: friends[0].id },
  );
  await page.reload();
  await expect(page.locator(".home-pinned")).toContainText("Priya Lim");
  await page.getByRole("button", { name: "Unpin home comparison" }).click();
  await expect(page.locator(".home-pinned")).toHaveCount(0);
  expect(
    await page.evaluate(
      (owner) => localStorage.getItem(`shuttl:rival:${owner}:Doubles`),
      me.id,
    ),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Mixed", exact: true })
    .first()
    .click();
  await expect(page.locator(".rating-number")).toHaveText("—");
  await expect(page.locator(".passport-seal,.circle-position")).toHaveCount(0);
  await expect(page.locator(".home-circle-empty")).toContainText(
    "Direct comparisons appear when the evidence supports them",
  );
  await page
    .getByRole("group", { name: "Activity categories" })
    .getByRole("button", { name: "Mixed activity", exact: true })
    .click();
  await expect(page.locator(".home-feed-card")).toHaveCount(1);
  await expect(page.locator(".home-feed-card")).toContainText(
    "Building a starting rating",
  );
  await expect(
    page.locator(".home-feed-card .feed-gain,.home-feed-card .feed-loss"),
  ).toHaveCount(0);
  data.me.ratings.find((r: any) => r.category === "Doubles").status =
    "Pair-linked";
  await page
    .getByRole("button", { name: "Doubles", exact: true })
    .first()
    .click();
  await page.reload();
  await expect(page.locator(".circle-position")).toHaveCount(0);
  data.me.breakMode = true;
  await page.reload();
  await expect(page.locator(".home-competition,.lead-update")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Friends’ activity" }),
  ).toBeVisible();
});

test("Home never asks a covered doubles teammate to approve and only highlights a recent earned published milestone", async ({
  page,
}) => {
  const { data, me, friends } = await fixture(page);
  const unit = (id: string, own: string, retrospective: boolean) => ({
    id,
    ownParticipant: own,
    authorParticipant: me.id,
    author: me,
    players: [me, friends[0], friends[1], friends[2]],
    category: "Doubles",
    status: "pending",
    retrospective,
    approvals: [me.id],
    playedAt: new Date().toISOString(),
    games: [[21, 17]],
    format: "ONE_21",
    revisionId: id + "-revision",
  });
  data.results = [unit("teammate", friends[0].id, false)];
  await page.goto("/home");
  await expect(page.locator(".rating-number")).toBeVisible();
  await expect(page.locator(".pending-banner")).toHaveCount(0);
  data.results.push(
    unit("opponent", friends[1].id, false),
    unit("retrospective", friends[0].id, true),
  );
  const milestone = {
    ...unit("earned", me.id, true),
    status: "rated",
    publishedRevisionId: "earned-published",
    ratingChanges: {
      [me.id]: {
        before: 1660,
        after: 1702,
        count: 39,
        peakBefore: 1664,
        won: true,
      },
    },
  };
  data.results.push(milestone);
  await page.reload();
  await expect(page.locator(".pending-banner")).toContainText(
    "2 recent results need your review",
  );
  await expect(page.locator(".home-earned")).toContainText("Obsidian reached");
  milestone.status = "correction_pending";
  await page.reload();
  await expect(page.locator(".home-earned")).toHaveCount(0);
  milestone.status = "rated";
  milestone.playedAt = new Date(Date.now() - 8 * 86400000).toISOString();
  await page.reload();
  await expect(page.locator(".home-earned")).toHaveCount(0);
});

test("Home remains readable in light, dark and large text with accessible actions and no page overflow", async ({
  page,
}) => {
  test.setTimeout(120000);
  const { data, friends } = await fixture(page);
  friends[0].name = "Alexandra Mae Featherstone-Kumar A Long Player Identity";
  data.me.ratings.find((r: any) => r.category === "Doubles").score = 1642;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/home");
  await page
    .getByRole("button", { name: "Doubles", exact: true })
    .first()
    .click();
  const reports: any[] = [];
  for (const palette of ["light", "dark"])
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate((p) => {
        document.documentElement.dataset.palette = p;
      }, palette);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      reports.push({
        palette,
        width,
        violations: report.violations,
        incomplete: report.incomplete,
      });
      expect(report.violations).toEqual([]);
      if (width === 390 || width === 1366)
        await page.screenshot({
          path: `${output}/home-${palette}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      if (width === 390 && palette === "light") {
        const record = await page
          .getByRole("button", { name: "Record a result", exact: true })
          .boundingBox();
        const nav = await page.locator(".mobile-nav").boundingBox();
        expect(record!.y + record!.height).toBeLessThan(nav!.y - 8);
        expect(record!.width).toBeGreaterThan(330);
      }
    }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.textSize = "large";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const large = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  reports.push({
    palette: "dark",
    width: 320,
    text: "200%",
    violations: large.violations,
    incomplete: large.incomplete,
  });
  writeFileSync(
    `${output}/accessibility.json`,
    JSON.stringify(reports, null, 2),
  );
  expect(large.violations).toEqual([]);
  await page.screenshot({
    path: `${output}/home-dark-large-320.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Record a result", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Record a result", exact: true }),
  ).toBeVisible();
});
