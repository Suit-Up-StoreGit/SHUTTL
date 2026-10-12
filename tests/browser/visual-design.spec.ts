import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { LEAGUES } from "../../src/domain.ts";

const output = "outputs/visual-design-2026-10-12";
const origin = "http://localhost:4174";
mkdirSync(output, { recursive: true });

async function account(page: Page) {
  const response = await page.request.post("/api/auth/register", {
    headers: { origin },
    data: {
      username: "visual_" + randomUUID().slice(0, 8),
      name: "Alexandra Mae Featherstone-Kumar Visual Fixture",
      password: "Visual-fixture-only-2026!",
      adult: true,
      timezone: "UTC",
    },
  });
  expect(response.status()).toBe(200);
  return await (await page.request.get("/api/me")).json();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

// These are explicitly synthetic layout data, not model calibration, real
// positions, player research, or a change to the application's title policy.
test("profile puts the chosen category and connection action first while preserving secondary rating details", async ({
  page,
}) => {
  const me = await account(page);
  await page.route(/\/api\/dashboard(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.me.ratings = data.me.ratings.map((rating: any) =>
      rating.category === "Mixed"
        ? rating
        : {
            ...rating,
            score: rating.category === "Doubles" ? 1876 : 1515,
            peak: rating.category === "Doubles" ? 1901 : 1515,
            count: rating.category === "Doubles" ? 19 : 5,
            league: rating.category === "Doubles" ? "Diamond" : "Sapphire",
            status: "Developing",
            partnerCount: rating.category === "Doubles" ? 3 : 0,
            lastPlayed: new Date(Date.now() - 3600000).toISOString(),
          },
    );
    await route.fulfill({ response, json: data });
  });
  await page.goto("/home");
  await page.getByRole("button", { name: "Doubles", exact: true }).click();
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  const first = page.locator(".player-discipline").first();
  await expect(first).toHaveAttribute("data-category", "Doubles");
  await expect(first.locator(".player-rating-number")).toHaveText("1,876");
  await expect(page.locator(".player-passport-summary")).toContainText("1,876");
  await expect(page.locator(".profile-identity h2")).toHaveText(me.name);
  const code = page.getByRole("button", {
    name: "Show my player code",
    exact: true,
  });
  const codeBox = await code.boundingBox();
  const firstBox = await first.boundingBox();
  expect(codeBox!.y).toBeLessThan(firstBox!.y);
  const singles = page.locator('.player-discipline[data-category="Singles"]');
  await expect(singles.locator(".player-rating-number")).toHaveText("1,515");
  await expect(singles).toContainText("5 confirmed results");
  await singles.locator("summary").click();
  await expect(singles).toContainText("personal best");
  const audit: any[] = [];
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    for (const palette of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.palette = value;
      }, palette);
      await noOverflow(page);
      if (width === 768) {
        const identity = page.locator(".account-chip");
        await expect(identity).toHaveAttribute(
          "aria-label",
          `${me.name} Your player passport`,
        );
        expect((await identity.boundingBox())!.height).toBeLessThan(100);
      }
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      audit.push({
        state: `profile ${width} ${palette}`,
        violations: result.violations,
        incomplete: result.incomplete,
      });
      expect(result.violations).toEqual([]);
      if (width === 390 || width === 768)
        await page.screenshot({
          path: `${output}/profile-${palette}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.textSize = "large";
  });
  await noOverflow(page);
  await expect(first.locator(".player-rating-number")).toHaveText("1,876");
  const largeAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  audit.push({
    state: "profile 320 dark 200% text",
    violations: largeAudit.violations,
    incomplete: largeAudit.incomplete,
  });
  expect(largeAudit.violations).toEqual([]);
  await page.screenshot({
    path: `${output}/profile-dark-large-320.png`,
    fullPage: true,
    animations: "disabled",
  });
  writeFileSync(
    `${output}/profile-accessibility.json`,
    JSON.stringify(audit, null, 2),
  );
  await page.evaluate(() => {
    document.documentElement.dataset.textSize = "normal";
  });
  await code.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("qualified standings retain real tie positions and the closed crown gate keeps every estimate unranked", async ({
  page,
}) => {
  const me = await account(page);
  const rating = (score: number) => ({
    category: "Doubles",
    score,
    league: "Diamond",
    status: "Established",
    count: 30,
    partnerCount: 4,
  });
  const players = [
    { id: me.id, name: me.name, position: 1, top: true, rating: rating(1876) },
    {
      id: "visual-tied-fixture",
      name: "Cassandra Featherstone-Lim Visual Fixture",
      position: 1,
      top: true,
      rating: rating(1876),
    },
  ];
  const other = {
    id: "visual-unranked-fixture",
    name: "Different playing network fixture",
    rating: { ...rating(2188), league: "Grandmaster", status: "Pair-linked" },
  };
  let crownAvailable = true;
  await page.route(/\/api\/rankings\?/, async (route) =>
    route.fulfill({
      json: {
        name: "Tuesday Featherstone Badminton Visual Fixture Pool",
        asOf: new Date().toISOString(),
        total: 3,
        eligible: 2,
        crownAvailable,
        needsDistrict: false,
        players,
        developing: [...players, other],
      },
    }),
  );
  await page.goto("/rankings");
  await page.getByRole("button", { name: "Doubles", exact: true }).click();
  const qualified = page.getByRole("table", {
    name: "Qualified standings",
    exact: true,
  });
  await expect(qualified).toBeVisible();
  await expect(qualified.getByRole("row")).toHaveCount(3);
  await expect(qualified.getByText("Shared", { exact: true })).toHaveCount(2);
  await expect(qualified.locator('[data-current-player="true"]')).toContainText(
    me.name,
  );
  await expect(
    page
      .getByRole("table", { name: "Unranked player estimates", exact: true })
      .getByRole("row"),
  ).toHaveCount(2);
  await expect(page.locator(".rankings-own-fact")).toContainText("#1");
  const auditRecords: any[] = [];
  const priorityMeasurements: any[] = [];
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    for (const palette of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.palette = value;
      }, palette);
      await noOverflow(page);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      auditRecords.push({
        state: `rankings qualified ${width} ${palette}`,
        violations: audit.violations,
        incomplete: audit.incomplete,
      });
      expect(audit.violations).toEqual([]);
      if (width === 390) {
        const geometry = await page.evaluate(() => ({
          personalStatusBottom:
            document
              .querySelector(".rankings-own-fact")!
              .getBoundingClientRect().bottom + scrollY,
          navigationTop: document
            .querySelector(".mobile-nav")!
            .getBoundingClientRect().top,
        }));
        priorityMeasurements.push({
          state: `qualified 390 ${palette}`,
          ...geometry,
        });
        expect(geometry.personalStatusBottom).toBeLessThan(
          geometry.navigationTop - 8,
        );
      }
      if (width === 390 || width === 768)
        await page.screenshot({
          path: `${output}/rankings-qualified-${palette}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.textSize = "large";
  });
  await noOverflow(page);
  const largeAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  auditRecords.push({
    state: "rankings qualified 320 dark 200% text",
    violations: largeAudit.violations,
    incomplete: largeAudit.incomplete,
  });
  expect(largeAudit.violations).toEqual([]);
  writeFileSync(
    `${output}/rankings-accessibility.json`,
    JSON.stringify(auditRecords, null, 2),
  );
  await page.screenshot({
    path: `${output}/rankings-qualified-dark-large-320.png`,
    fullPage: true,
    animations: "disabled",
  });
  crownAvailable = false;
  await page.reload();
  await expect(qualified).toHaveCount(0);
  const unranked = page.getByRole("table", {
    name: "Unranked player estimates",
    exact: true,
  });
  await expect(unranked.getByRole("row")).toHaveCount(4);
  await expect(page.getByText("Your position", { exact: true })).toHaveCount(0);
  await expect(unranked.getByText("Shared", { exact: true })).toHaveCount(0);
  await expect(unranked.getByText(/top-rated in this named pool/)).toHaveCount(
    0,
  );
  await page.evaluate(() => {
    document.documentElement.dataset.textSize = "normal";
    document.documentElement.dataset.palette = "light";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await page.evaluate(() => ({
    personalStatusBottom:
      document.querySelector(".rankings-own-fact")!.getBoundingClientRect()
        .bottom + scrollY,
    navigationTop: document
      .querySelector(".mobile-nav")!
      .getBoundingClientRect().top,
  }));
  priorityMeasurements.push({
    state: "unranked 390 light, including qualifier",
    ...geometry,
  });
  expect(geometry.personalStatusBottom).toBeLessThan(
    geometry.navigationTop - 8,
  );
  writeFileSync(
    `${output}/ranking-priority-measurements.json`,
    JSON.stringify(priorityMeasurements, null, 2),
  );
  await page.screenshot({
    path: `${output}/rankings-unranked-light-390.png`,
    fullPage: true,
    animations: "disabled",
  });
});

test("live reduced-motion changes stop replay on the published number and category changes retain the correct identity", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/design?concept=passport");
  const published = page.locator(".latest-result .rating-motion");
  await expect(published.locator("[aria-hidden=true]")).toHaveText("1,628");
  await expect(published.locator(".sr-only")).toHaveText(
    "Published rating 1,628",
  );
  await published
    .getByRole("button", { name: "Replay the visible rating change" })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(published).toHaveAttribute("data-motion", "reduced");
  await expect(published.locator("[aria-hidden=true]")).toHaveText("1,628");
  await expect(
    published.getByRole("button", { name: "Replay the visible rating change" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  const track = page.locator(".category-selection-track");
  expect(
    await track.evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
  await expect(page.locator(".passport-top")).toContainText("Singles rating");
  await page.getByRole("button", { name: "Mixed", exact: true }).click();
  await expect(page.locator(".rating-number")).toHaveText("—");
  await expect(page.locator(".passport-seal")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Doubles", exact: true }).click();
  await expect(published).toHaveAttribute("data-motion", "still");
  await expect(published.locator("[aria-hidden=true]")).toHaveText("1,628");
});

test("switching to a different result with identical rating numbers cancels the previous result's replay", async ({
  page,
}) => {
  const me = await account(page);
  await page.route(/\/api\/dashboard(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.me.ratings = data.me.ratings.map((rating: any) =>
      rating.category === "Mixed"
        ? rating
        : {
            ...rating,
            score: 1628,
            peak: 1664,
            count: 12,
            league: "Ruby",
            status: "Developing",
          },
    );
    data.results = ["Singles", "Doubles"].map((category) => ({
      id: `equal-pair-fixture-${category}`,
      category,
      status: "rated",
      format: "ONE_21",
      playedAt: new Date(Date.now() - 3600000).toISOString(),
      ownParticipant: me.id,
      publishedRevisionId: `fixture-revision-${category}`,
      revisionId: `fixture-revision-${category}`,
      revisionNumber: 1,
      approvals: [],
      games: [[21, 17]],
      players:
        category === "Singles"
          ? [me, { id: "fixture-other", name: "Other fixture" }]
          : [
              me,
              { id: "fixture-partner", name: "Partner fixture" },
              { id: "fixture-other", name: "Other fixture" },
              { id: "fixture-other-partner", name: "Other partner fixture" },
            ],
      ratingChanges: {
        [me.id]: {
          before: 1620,
          after: 1628,
          delta: 8,
          count: 12,
          won: true,
          peakBefore: 1664,
        },
      },
      ownProgress: { count: 12, won: true },
    }));
    await route.fulfill({ response, json: data });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/home");
  await page.getByRole("button", { name: "Doubles", exact: true }).click();
  const replay = page.locator(".latest-result .rating-motion");
  await replay
    .getByRole("button", { name: "Replay the visible rating change" })
    .click();
  await expect(replay).toHaveAttribute("data-motion", "replaying");
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await expect(page.locator(".passport-top")).toContainText("Singles rating");
  await expect(replay).toHaveAttribute("data-motion", "still");
  await expect(replay.locator("[aria-hidden=true]")).toHaveText("1,628");
  await expect(
    replay.getByRole("button", { name: "Replay the visible rating change" }),
  ).toBeEnabled();
});

test("feed and story exports reserve separate readable lanes for the captured name, disclaimer and qualified title", async ({
  page,
}) => {
  // Direct canvas-layout fixture of the shipped source. It does not issue a
  // public title or exercise server eligibility, already covered separately.
  const source = readFileSync("src/share-image.ts", "utf8").replace(
    /import\s+\{\s*LEAGUES\s*\}\s+from\s+["']\.\/domain\.ts["'];?/,
    `const LEAGUES = ${JSON.stringify(LEAGUES.map(({ name, color, slug }) => ({ name, color, slug })))};`,
  );
  const module = stripTypeScriptTypes(source, { mode: "transform" });
  await page.route("**/__visual-share-module.js", async (route) =>
    route.fulfill({ contentType: "text/javascript", body: module }),
  );
  await page.goto("/design?concept=passport");
  const records = await page.evaluate(async () => {
    const draws: any[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      value,
      x,
      y,
      maxWidth,
    ) {
      const measure = this.measureText(value);
      draws.push({
        value,
        x,
        y,
        font: this.font,
        fillStyle:
          typeof this.fillStyle === "string" ? this.fillStyle : "gradient",
        top: y - measure.actualBoundingBoxAscent,
        bottom: y + measure.actualBoundingBoxDescent,
        width: Math.min(maxWidth ?? Infinity, measure.width),
      });
      if (maxWidth === undefined) original.call(this, value, x, y);
      else original.call(this, value, x, y, maxWidth);
    };
    try {
      const modulePath = "/__visual-share-module.js";
      const { ratingImage } = await import(/* @vite-ignore */ modulePath);
      const files = [];
      for (const shape of ["feed", "story"]) {
        draws.length = 0;
        const blob = await ratingImage(
          {
            category: "Doubles",
            score: 1876,
            league: "Diamond",
            status: "Developing",
            template: "promotion",
            previousLeague: "Obsidian",
            asOf: "2026-10-12T00:00:00Z",
            name: "Alexandra Mae Featherstone-Kumar Visual Fixture",
            district:
              "A deliberately long declared playing area visual fixture",
            title: {
              label: "Qualified fixture leader",
              pool: "A deliberately long named visual comparison pool",
              eligible: 42,
            },
          },
          shape,
        );
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
        files.push({ shape, dataUrl, draws: [...draws] });
      }
      return files;
    } finally {
      CanvasRenderingContext2D.prototype.fillText = original;
    }
  });
  for (const record of records) {
    const title = record.draws.find((draw: any) =>
      draw.value.startsWith("Qualified fixture leader"),
    );
    expect(title).toBeTruthy();
    const eligibility = record.draws.find(
      (draw: any) => draw.value === "42 eligible players",
    );
    expect(eligibility).toBeTruthy();
    expect(title.x + title.width + 20).toBeLessThan(eligibility.x);
    expect(eligibility.x + eligibility.width).toBeLessThanOrEqual(1005);
    const footer = record.draws.filter(
      (draw: any) =>
        draw.x === 75 && draw.y > (record.shape === "feed" ? 800 : 1500),
    );
    const preceding = footer.filter(
      (draw: any) => draw !== title && draw.y < title.y,
    );
    expect(Math.max(...preceding.map((draw: any) => draw.bottom))).toBeLessThan(
      title.top - 4,
    );
    expect(
      record.draws.find((draw: any) => draw.value === "Diamond").fillStyle,
    ).toBe("#f4f7ec");
    expect(Math.max(...footer.map((draw: any) => draw.bottom))).toBeLessThan(
      record.shape === "feed" ? 1080 : 1920,
    );
    writeFileSync(
      `${output}/share-${record.shape}-qualified-layout.png`,
      Buffer.from(record.dataUrl.split(",")[1], "base64"),
    );
  }
  writeFileSync(
    `${output}/share-layout-records.json`,
    JSON.stringify(
      records.map(({ dataUrl, ...record }) => record),
      null,
      2,
    ),
  );
});
