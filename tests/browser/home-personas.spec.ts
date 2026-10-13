import {
  test,
  expect,
  type Browser,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const output = "outputs/home-growth-2026-10-13";
mkdirSync(output, { recursive: true });
const names = {
  newcomer: "Asha First-Time Player",
  recreational: "Ben Club Regular",
  competitive: "Chloe Singles Competitor",
  doubles: "Dev Doubles Specialist",
  organiser: "Ella Club Organiser",
  privacy: "Farah Private Player",
  returning: "Gabe Returning Player",
  accessible: "Harper Enlarged Text",
  fixedPartnership: "Iris Fixed Partnership",
  regularPartner: "Jae Regular Partner",
  localExplorer: "Leo Local Explorer",
};
type Persona = {
  id: string;
  username: string;
  csrf: string;
  client: APIRequestContext;
  state: any;
};
const players = {} as Record<keyof typeof names, Persona>;
let groupId = "",
  matchIndex = 0;
const observations: any[] = [];
const headers = (p: Persona) => ({
  origin: "http://localhost:4174",
  "x-csrf-token": p.csrf,
  "idempotency-key": randomUUID(),
});
let busyRetries = 0;
async function retryBusy<T extends { status(): number }>(
  send: () => Promise<T>,
) {
  for (let attempt = 0; ; attempt++) {
    const response = await send();
    if (response.status() !== 503 || attempt >= 3) return response;
    busyRetries++;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
}
async function publish(
  roster: Persona[],
  category: string,
  win = true,
  at?: string,
) {
  const actor = roster[0];
  const requestHeaders = headers(actor);
  const recordedAt =
    at || new Date(Date.now() - 7200000 + matchIndex * 60000).toISOString();
  matchIndex++;
  const payload = {
    unitId: randomUUID(),
    category,
    format: "ONE_21",
    roster: roster.map((p) => p.id),
    games: [win ? [21, 17] : [17, 21]],
    playedAt: recordedAt,
    scopeId: null,
    agree: true,
  };
  const response = await retryBusy(() =>
    actor.client.post("/api/results", {
      headers: requestHeaders,
      data: payload,
    }),
  );
  expect(response.status()).toBe(200);
  const id = (await response.json()).id;
  const unit = await (await actor.client.get(`/api/results/${id}`)).json();
  for (const p of roster.slice(1)) {
    const approvalHeaders = headers(p);
    expect(
      (
        await retryBusy(() =>
          p.client.post(`/api/results/${id}/approve`, {
            headers: approvalHeaders,
            data: { revisionId: unit.revisionId, agree: true },
          }),
        )
      ).status(),
    ).toBe(200);
  }
  return id;
}
async function view(browser: Browser, key: keyof typeof names) {
  const context = await browser.newContext({
    baseURL: "http://localhost:4174",
    storageState: players[key].state,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  return { page, context };
}
test.beforeAll(async ({ playwright }) => {
  test.setTimeout(90000);
  for (const [key, name] of Object.entries(names)) {
    const client = await playwright.request.newContext({
      baseURL: "http://localhost:4174",
    });
    const username = "perception_" + randomUUID().slice(0, 8);
    const response = await client.post("/api/auth/register", {
      headers: { origin: "http://localhost:4174" },
      data: {
        username,
        name,
        password: "Persona-review-local-2026!",
        adult: true,
      },
    });
    expect(response.status()).toBe(200);
    const me = await (await client.get("/api/me")).json();
    players[key as keyof typeof names] = {
      id: me.id,
      username,
      csrf: me.csrf,
      client,
      state: await client.storageState(),
    };
    const values = Object.fromEntries(
      [
        "name",
        "district",
        "country",
        "city",
        "publicName",
        "publicDistrict",
        "publicHistory",
        "discoverable",
        "localOptIn",
        "breakMode",
        "timezone",
        "goals",
      ].map((field) => [field, me[field]]),
    );
    expect(
      (
        await client.patch("/api/profile", {
          headers: headers(players[key as keyof typeof names]),
          data: {
            ...values,
            country: "DE",
            city: "Berlin",
            district: "Mitte",
            timezone: "Europe/Berlin",
            localOptIn: !["privacy", "newcomer", "accessible"].includes(key),
            ...(key === "localExplorer"
              ? { discoverable: true, publicName: true }
              : {}),
          },
        })
      ).status(),
    ).toBe(200);
  }
  const {
    recreational: b,
    competitive: c,
    doubles: d,
    organiser: e,
    privacy: f,
  } = players;
  for (let i = 0; i < 8; i++) await publish([c, b], "Singles", i % 4 !== 1);
  for (let i = 0; i < 12; i++)
    await publish(
      i % 3 === 0 ? [b, c, d, e] : i % 3 === 1 ? [b, d, c, e] : [b, e, c, d],
      "Doubles",
      i % 3 !== 2,
    );
  for (let i = 0; i < 6; i++)
    await publish(
      i % 2 === 0 ? [f, b, d, e] : [f, d, b, e],
      "Mixed",
      i % 2 === 0,
    );
  await expect
    .poll(
      async () =>
        (await (await d.client.get("/api/me")).json()).ratings.find(
          (r: any) => r.category === "Doubles",
        ).count,
      { timeout: 30000 },
    )
    .toBe(12);
  await expect
    .poll(
      async () =>
        (await (await f.client.get("/api/me")).json()).ratings.find(
          (r: any) => r.category === "Mixed",
        ).count,
      { timeout: 30000 },
    )
    .toBe(6);
  for (let i = 0; i < 5; i++)
    await publish(
      [players.fixedPartnership, players.regularPartner, b, d],
      "Doubles",
      i % 2 === 0,
    );
  await expect
    .poll(
      async () =>
        (
          await (await players.fixedPartnership.client.get("/api/me")).json()
        ).ratings.find((r: any) => r.category === "Doubles").count,
      { timeout: 30000 },
    )
    .toBe(5);
  const keys = Object.keys(names).filter(
    (key) => !["newcomer", "localExplorer"].includes(key),
  ) as (keyof typeof names)[];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = players[keys[i]],
        peer = players[keys[j]];
      expect(
        (
          await a.client.post("/api/friends", {
            headers: headers(a),
            data: { playerId: peer.id },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await peer.client.post(`/api/friends/${a.id}/accept`, {
            headers: headers(peer),
            data: {},
          })
        ).status(),
      ).toBe(200);
    }
  const group = await e.client.post("/api/circles", {
    headers: headers(e),
    data: { name: "Mitte Tuesday Badminton" },
  });
  expect(group.status()).toBe(200);
  groupId = (await group.json()).id;
  for (const key of keys.filter((key) => key !== "organiser")) {
    const p = players[key];
    expect(
      (
        await e.client.post(`/api/circles/${groupId}/invite`, {
          headers: headers(e),
          data: { playerId: p.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await p.client.post(`/api/circles/${groupId}/accept`, {
          headers: headers(p),
          data: {},
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await e.client.patch(`/api/circles/${groupId}/identity`, {
        headers: headers(e),
        data: {
          crest: "court",
          tagline: "Real games. Shared progress.",
          recapDay: 2,
        },
      })
    ).status(),
  ).toBe(200);
  writeFileSync(
    `${output}/accounts.json`,
    JSON.stringify(
      {
        fictional: true,
        actualRegisteredAccounts: true,
        seededApprovedMatches: matchIndex,
        accounts: Object.entries(players).map(([key, p]) => ({
          persona: key,
          name: names[key as keyof typeof names],
          username: p.username,
          id: p.id,
        })),
      },
      null,
      2,
    ),
  );
});
test.afterAll(async () => {
  writeFileSync(
    `${output}/walkthroughs.json`,
    JSON.stringify(
      {
        kind: "Simulated persona walkthroughs by an expert reviewer; not real-player research",
        busyRetriesWithFrozenRequest: busyRetries,
        approvedMatchesCreatedByThisFile: matchIndex,
        observations,
      },
      null,
      2,
    ),
  );
  for (const p of Object.values(players)) await p.client.dispose();
});
for (const key of Object.keys(names).filter(
  (k) => k !== "localExplorer",
) as (keyof typeof names)[])
  test(`${key} persona uses the actual account, ratings, home actions and personal context`, async ({
    browser,
  }) => {
    test.setTimeout(60000);
    const { page, context } = await view(browser, key);
    try {
      const category =
        key === "competitive"
          ? "Singles"
          : key === "privacy"
            ? "Mixed"
            : "Doubles";
      await page
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: category, exact: true })
        .click();
      const me = await (await players[key].client.get("/api/me")).json();
      const rating = me.ratings.find((r: any) => r.category === category);
      if (rating.score === null) {
        await expect(page.locator(".rating-number")).toHaveCount(0);
        await expect(page.locator(".passport-placement-intro")).toBeVisible();
      } else {
        await expect(page.locator(".rating-number")).toHaveText(
          rating.score.toLocaleString("en-SG"),
        );
        await expect(
          page.getByRole("button", { name: "Share passport", exact: true }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole("button", { name: "Record a match", exact: true }),
      ).toBeVisible();
      if (key === "accessible") {
        await page
          .getByRole("button", { name: "Profile", exact: true })
          .last()
          .click();
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await page
          .getByLabel("Text size", { exact: true })
          .selectOption("large");
        await page
          .getByRole("button", { name: "Home", exact: true })
          .last()
          .click();
        await page.setViewportSize({ width: 320, height: 844 });
      }
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${output}/${key}-home.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.screenshot({
        path: `${output}/${key}-viewport.png`,
        animations: "disabled",
      });
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      await page
        .getByRole("button", { name: "Record a match", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Record a match", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      if (key === "newcomer") {
        await page
          .getByRole("button", { name: "Find a player", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
      } else {
        await expect(page.locator(".home-group-links")).toContainText(
          "Mitte Tuesday Badminton",
        );
        await page.locator(".home-group-links button").click();
        await expect(page).toHaveURL(new RegExp(`circle=${groupId}`));
        await expect(
          page.getByRole("heading", {
            name: "Mitte Tuesday Badminton",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Home", exact: true })
          .last()
          .click();
      }
      await page
        .getByRole("button", { name: "Playing insights", exact: true })
        .click();
      await expect(page.getByLabel("Your playing period")).toBeVisible();
      await page
        .getByRole("button", { name: "Home", exact: true })
        .last()
        .click();
      if (rating.score !== null) {
        await page
          .getByRole("button", { name: "Share passport", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
      }
      observations.push({
        persona: key,
        username: players[key].username,
        category,
        actualRating: rating.score,
        confirmedMatches: rating.count,
        checked: [
          "home",
          "category",
          "recording",
          "insights",
          ...(key === "newcomer" ? ["player lookup"] : ["named group"]),
          ...(rating.score === null ? ["honest placement"] : ["sharing entry"]),
        ],
        detectedAccessibilityViolations: audit.violations.length,
        indeterminateNodes: audit.incomplete.reduce(
          (n, item) => n + item.nodes.length,
          0,
        ),
      });
    } finally {
      await context.close();
    }
  });
test("returning persona sees a real newly published match, acknowledges it, and keeps the current activity", async ({
  browser,
}) => {
  const { page, context } = await view(browser, "returning");
  try {
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    const id = await publish(
      [players.competitive, players.recreational],
      "Singles",
      false,
    );
    await expect
      .poll(
        async () =>
          (
            await (await players.returning.client.get("/api/dashboard")).json()
          ).feed.some((f: any) => f.unitId === id),
        { timeout: 30000 },
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    const summary = page.getByRole("region", { name: "Since your last check" });
    await expect(summary).toContainText("1 new match");
    await expect(page.locator('.home-feed-card[data-new="new"]')).toHaveCount(
      1,
    );
    await page.screenshot({
      path: `${output}/returning-new-match.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Caught up", exact: true }).click();
    await expect(summary).toHaveCount(0);
    await expect(page.locator(".home-feed-card")).not.toHaveCount(0);
    await page.reload();
    await expect(summary).toHaveCount(0);
    observations.push({
      persona: "returning",
      checked: [
        "actual newly published friend match",
        "one whole-match count for two friend rows",
        "device-scoped acknowledgement",
        "reload continuity",
      ],
    });
  } finally {
    await context.close();
  }
});

test("a real friend congratulates a revealed partnership from the milestone feed, with retry and private recipient recognition", async ({
  browser,
}) => {
  const { page, context } = await view(browser, "competitive");
  let recipientView: Awaited<ReturnType<typeof view>> | undefined;
  try {
    await page
      .getByRole("button", {
        name: "Milestone activity, all categories",
        exact: true,
      })
      .click();
    const dashboard = await (
      await players.competitive.client.get("/api/dashboard")
    ).json();
    const entry = dashboard.feed.find(
      (f: any) =>
        f.player.id === players.fixedPartnership.id && f.milestone === "reveal",
    );
    expect(entry).toBeTruthy();
    const unchanged = (
      await (await players.fixedPartnership.client.get("/api/me")).json()
    ).ratings;
    let fail = true;
    await page.route(`**/api/activity/${entry.unitId}/congratulate`, (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: { error: "Temporary congratulations interruption" },
          })
        : route.continue(),
    );
    const send = page.getByRole("button", {
      name: "Congratulate Iris Fixed Partnership",
      exact: true,
    });
    await send.click();
    await expect(page.getByRole("alert")).toContainText(
      "Temporary congratulations interruption",
    );
    fail = false;
    await send.click();
    await expect(
      page.getByRole("button", {
        name: "Congratulated Iris Fixed Partnership",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      (await (await players.fixedPartnership.client.get("/api/me")).json())
        .ratings,
    ).toEqual(unchanged);
    expect(
      (
        await players.competitive.client.get(`/api/results/${entry.unitId}`)
      ).status(),
    ).toBe(403);
    recipientView = await view(browser, "fixedPartnership");
    const recognition = recipientView.page.getByRole("region", {
      name: "Private recognition",
      exact: true,
    });
    await expect(recognition).toContainText("Chloe Singles Competitor");
    await expect(recognition).toContainText("rating reveal");
    await expect(recognition).toContainText("Only you see this");
    await recognition.screenshot({ path: `${output}/private-recognition.png` });
    await recipientView.page.evaluate(() => {
      document.documentElement.dataset.palette = "dark";
    });
    const darkHome = await new AxeBuilder({ page: recipientView.page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(darkHome.violations).toEqual([]);
    await recipientView.page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    const darkBrief = recipientView.page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    await expect(darkBrief.locator(".brief-facts")).toBeVisible();
    const darkBriefAudit = await new AxeBuilder({ page: recipientView.page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(darkBriefAudit.violations).toEqual([]);
    await darkBrief.screenshot({ path: `${output}/dark-progress-brief.png` });
    await recipientView.page.keyboard.press("Escape");
    await recognition.getByRole("button").click();
    await expect(
      recipientView.page.getByRole("dialog", {
        name: "Your confirmed result",
        exact: true,
      }),
    ).toBeVisible();
    observations.push({
      persona: "competitive",
      checked: [
        "actual revealed friend milestone",
        "retry",
        "private recognition",
        "foreign match details withheld",
        "no rating change",
      ],
    });
  } finally {
    await recipientView?.context.close();
    await context.close();
  }
});

test("a competitive player reads an actor-bound progress brief, preserves home category and downloads an anonymous factual card", async ({
  browser,
}) => {
  const { page, context } = await view(browser, "competitive");
  try {
    await page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    const brief = page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    await expect(
      brief.getByRole("region", { name: "Published rating trajectory" }),
    ).toContainText("Your trajectory");
    await brief
      .getByLabel("Your playing period", { exact: true })
      .selectOption("all");
    const actualCount = (
      await (await players.competitive.client.get("/api/me")).json()
    ).ratings.find((r: any) => r.category === "Singles").count;
    await expect(brief.locator(".brief-facts > div").first()).toContainText(
      String(actualCount),
    );
    const actualInsights = await (
      await players.competitive.client.get(
        "/api/insights?category=Singles&period=all",
      )
    ).json();
    const connections = brief.getByRole("region", {
      name: "Your playing connections",
    });
    await expect(connections).toContainText(
      actualInsights.opponents[0].player.name,
    );
    await expect(connections).toContainText(
      `${actualInsights.opponents[0].count} confirmed matches against them · your side won ${actualInsights.opponents[0].wins}`,
    );
    await expect(
      brief.getByLabel("Include my name on the downloaded card"),
    ).not.toBeChecked();
    await brief.screenshot({ path: `${output}/progress-brief.png` });
    const downloadPromise = page.waitForEvent("download");
    await brief
      .getByRole("button", { name: "Download progress card", exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("shuttl-singles-progress.png");
    await download.saveAs(`${output}/private-progress-card.png`);
    const png = readFileSync(`${output}/private-progress-card.png`);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1440);
    expect(png.length).toBeGreaterThan(20000);
    await expect(brief.getByRole("status")).toContainText(
      "No public link was created",
    );
    const journal = brief.getByRole("region", {
      name: "Results behind your progress",
    });
    await expect(journal.getByRole("button").first()).toBeVisible();
    await journal.getByRole("button").first().click();
    await expect(
      page.getByRole("dialog", { name: "Your confirmed result", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    await brief
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Mixed", exact: true })
      .click();
    await expect(
      brief.getByRole("region", { name: "Current rating context" }),
    ).toContainText("Building your rating");
    await expect(brief.locator(".brief-trajectory svg")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      page
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    observations.push({
      persona: "competitive",
      checked: [
        "actor-bound full-history brief",
        "visible trajectory and real result turning points",
        "private anonymous 1080x1440 PNG",
        "no fake Mixed rating",
        "home category preserved",
      ],
    });
  } finally {
    await context.close();
  }
});

test("a quiet-week player revisits real old progress, and a narrow enlarged-text player can use the same brief", async ({
  browser,
}) => {
  test.setTimeout(90000);
  for (let i = 0; i < 5; i++)
    await publish(
      [players.returning, players.accessible],
      "Singles",
      i % 2 === 0,
      new Date(Date.now() - 8 * 86400000 + i * 60000).toISOString(),
    );
  await expect
    .poll(
      async () =>
        (
          await (await players.returning.client.get("/api/me")).json()
        ).ratings.find((r: any) => r.category === "Singles").count,
      { timeout: 30000 },
    )
    .toBe(5);
  for (const key of ["returning", "accessible"] as const) {
    const { page, context } = await view(browser, key);
    try {
      if (key === "accessible") {
        await page
          .getByRole("button", { name: "Profile", exact: true })
          .last()
          .click();
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await page
          .getByLabel("Text size", { exact: true })
          .selectOption("large");
        await page
          .getByRole("button", { name: "Home", exact: true })
          .last()
          .click();
        await page.setViewportSize({ width: 320, height: 844 });
      }
      await page
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Singles", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Your next step" }),
      ).toContainText("Your progress is still here.");
      await expect(page.locator(".home-earned")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Your progress brief", exact: true })
        .click();
      const brief = page.getByRole("dialog", {
        name: "Your progress brief",
        exact: true,
      });
      await brief
        .getByLabel("Your playing period", { exact: true })
        .selectOption("7");
      await expect(brief.locator(".brief-facts > div").first()).toContainText(
        "0",
      );
      await brief
        .getByLabel("Your playing period", { exact: true })
        .selectOption("all");
      await expect(brief.locator(".brief-facts > div").first()).toContainText(
        "5",
      );
      await expect(
        brief.getByRole("region", { name: "Published rating trajectory" }),
      ).toContainText("Your starting point");
      await expect(brief.locator(".brief-trajectory svg")).toHaveCount(0);
      expect(await brief.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
        true,
      );
      const audit = await new AxeBuilder({ page })
        .include("dialog[open]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      await page.screenshot({
        path: `${output}/${key}-brief-viewport.png`,
        animations: "disabled",
      });
      observations.push({
        persona: key,
        checked: [
          "actual five old published matches",
          "quiet-week next step",
          "empty seven-day view versus real career trace",
          "accessible brief",
        ],
        detectedAccessibilityViolations: audit.violations.length,
        indeterminateNodes: audit.incomplete.reduce(
          (n, item) => n + item.nodes.length,
          0,
        ),
      });
    } finally {
      await context.close();
    }
  }
  await publish(
    [players.returning, players.accessible],
    "Singles",
    false,
    new Date(Date.now() - 60000).toISOString(),
  );
  await expect
    .poll(
      async () =>
        (
          await (await players.returning.client.get("/api/me")).json()
        ).ratings.find((r: any) => r.category === "Singles").count,
      { timeout: 30000 },
    )
    .toBe(6);
  const later = await view(browser, "returning");
  try {
    await later.page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    await later.page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    const brief = later.page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    await brief
      .getByLabel("Your playing period", { exact: true })
      .selectOption("7");
    await expect(brief.locator(".brief-facts > div").first()).toContainText(
      "1",
    );
    await expect(
      brief.getByRole("region", { name: "Published rating trajectory" }),
    ).toContainText("One point in this period");
    await expect(
      brief.getByRole("region", { name: "Published rating trajectory" }),
    ).not.toContainText("First published estimate");
    await brief.screenshot({ path: `${output}/later-period-single-point.png` });
    observations.push({
      persona: "returning",
      checked: [
        "sixth actual result is the sole published point in the selected seven-day period",
        "later estimate never presented as five-match reveal",
        "real latest loss remains contextualized",
      ],
    });
  } finally {
    await later.context.close();
  }
});

test("local context leads to a comparison or an explicit friend request, and an already pending request cannot be duplicated", async ({
  browser,
}) => {
  test.setTimeout(90000);
  for (let i = 0; i < 5; i++)
    await publish(
      [players.localExplorer, players.competitive],
      "Singles",
      i % 2 === 0,
    );
  await expect
    .poll(
      async () =>
        (
          await (await players.localExplorer.client.get("/api/me")).json()
        ).ratings.find((r: any) => r.category === "Singles").count,
      { timeout: 30000 },
    )
    .toBe(5);
  const { page, context } = await view(browser, "recreational");
  try {
    await expect(page.locator(".home-local-court")).toContainText(
      "opted-in players",
    );
    await expect(page.locator(".home-local-court")).toContainText("Mitte");
    await page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    await expect(page.locator(".home-local-connection")).toContainText(
      "Accepted local connection",
    );
    await page.locator(".home-local-connection-compare").click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Local players · Mitte", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "View Chloe Singles Competitor",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .locator(`[data-player-id="${players.localExplorer.id}"]`)
      .getByRole("button", { name: "View Leo Local Explorer", exact: true })
      .click();
    const invite = page.getByRole("dialog", {
      name: "Your next playing connection",
      exact: true,
    });
    await expect(invite).toContainText("Leo Local Explorer");
    await invite
      .getByRole("button", { name: "Ask to connect", exact: true })
      .click();
    await expect(invite).toHaveCount(0);
    await page
      .locator(`[data-player-id="${players.localExplorer.id}"]`)
      .getByRole("button", { name: "View Leo Local Explorer", exact: true })
      .click();
    await expect(
      invite.getByRole("button", { name: "Request pending", exact: true }),
    ).toBeDisabled();
    await expect(invite).toContainText("They choose whether to accept");
    observations.push({
      persona: "localExplorer",
      checked: [
        "opt-in local population",
        "direct accepted friend comparison",
        "explicit first request",
        "pending request continuity",
      ],
    });
  } finally {
    await context.close();
  }
});

test("earned badminton motion is finite, honors live reduced motion, and never changes the revealed number", async ({
  browser,
}) => {
  const { page, context } = await view(browser, "regularPartner");
  try {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const published = await page.locator(".rating-number").textContent();
    await expect(page.locator(".passport-shuttle-mark")).toBeVisible();
    const motion = await page.locator(".home-earned-seal").evaluate((e) => ({
      duration: getComputedStyle(e).animationDuration,
      iterations: getComputedStyle(e).animationIterationCount,
    }));
    expect(motion.iterations).toBe("1");
    expect(parseFloat(motion.duration)).toBeLessThanOrEqual(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".home-earned-seal")
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
    expect(
      await page
        .locator(".passport-shuttle-mark")
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
    await expect(page.locator(".rating-number")).toHaveText(published!);
    observations.push({
      persona: "regularPartner",
      checked: [
        "original badminton illustration",
        "finite earned arrival",
        "live reduced-motion preference",
        "published number stays fixed",
      ],
    });
  } finally {
    await context.close();
  }
});

test("a friend story opens its category while the competitive player's home category stays selected", async ({
  browser,
}) => {
  const { page, context } = await view(browser, "competitive");
  try {
    await page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    const story = page
      .getByRole("button", {
        name: "View Ben Club Regular's mixed progress",
        exact: true,
      })
      .first();
    // New published matches change a story's position. Follow the actual feed
    // controls instead of assuming a fixed number of newer cards.
    for (let i = 0; i < 5 && !(await story.isVisible()); i++) {
      const more = page.getByRole("button", {
        name: "Show more activity",
        exact: true,
      });
      await expect(more).toBeVisible();
      await more.click();
    }
    await expect(story).toBeVisible();
    await story.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Mixed", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(
      page
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(story).toBeFocused();
    observations.push({
      persona: "competitive",
      checked: [
        "real accepted friend's mixed rating",
        "comparison category",
        "home category and keyboard focus preserved",
      ],
    });
  } finally {
    await context.close().catch(() => {});
  }
});

test("a failed refresh stays visible and retry recovers the returning player's current court", async ({
  browser,
}) => {
  const { page, context } = await view(browser, "returning");
  try {
    let fail = true;
    await page.route("**/api/dashboard", (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: { error: "Temporary review connection failure" },
          })
        : route.continue(),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".home-sync-error")).toContainText(
      "Showing your last loaded court",
    );
    await expect(
      page.getByRole("button", { name: "Record a match", exact: true }),
    ).toBeVisible();
    fail = false;
    await page
      .getByRole("button", { name: "Refresh court", exact: true })
      .click();
    await expect(page.locator(".home-sync-error")).toHaveCount(0);
    await expect(page.locator(".home-last-sync").first()).toContainText(
      "Updated",
    );
    observations.push({
      persona: "returning",
      checked: [
        "persistent stale-data feedback",
        "current court preserved",
        "explicit retry and freshness recovery",
      ],
    });
  } finally {
    await context.close();
  }
});

test("real fixed-partnership players see their revealed estimate with the individual-comparison limit explained", async ({
  browser,
}) => {
  for (const key of ["fixedPartnership", "regularPartner"] as const) {
    const { page, context } = await view(browser, key);
    try {
      await page
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Doubles", exact: true })
        .click();
      const me = await (await players[key].client.get("/api/me")).json();
      const rating = me.ratings.find((r: any) => r.category === "Doubles");
      expect(rating.status).toBe("Pair-linked");
      expect(rating.count).toBe(5);
      await expect(page.locator(".rating-number")).toHaveText(
        rating.score.toLocaleString("en-SG"),
      );
      await page.getByRole("button", { name: "Your circle" }).click();
      await expect(page.locator(".home-circle-empty")).toContainText(
        "A partnership estimate, for now.",
      );
      await expect(page.locator(".home-circle-empty")).toContainText(
        "Different partners help",
      );
      await expect(page.locator(".passport-comparison")).toHaveCount(0);
      await expect(page.locator(".home-circle-position")).toHaveCount(0);
      observations.push({
        persona: key,
        actualRating: rating.score,
        confirmedMatches: rating.count,
        checked: [
          "real fixed-partnership publication",
          "correct pair-linked explanation",
          "individual ranking and numerical friend comparison withheld",
        ],
      });
    } finally {
      await context.close();
    }
  }
});

test("studio collection exposes genuine earned results, hides placement rewards and supports keyboard view selection", async ({
  browser,
}) => {
  const newcomer = await view(browser, "newcomer");
  try {
    await newcomer.page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    const brief = newcomer.page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    const overview = brief.getByRole("tab", { name: "Overview", exact: true });
    await overview.focus();
    await newcomer.page.keyboard.press("End");
    await expect(
      brief.getByRole("tab", { name: "Collection", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(brief.locator(".studio-seal.earned")).toHaveCount(0);
    await expect(
      brief.getByRole("region", { name: "Your earned collection" }),
    ).toContainText("5 more confirmed results");
    await brief.screenshot({
      path: `${output}/studio-newcomer-collection.png`,
    });
  } finally {
    await newcomer.context.close();
  }
  const active = await view(browser, "competitive");
  try {
    await active.page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    await active.page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    const brief = active.page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    await brief.getByRole("tab", { name: "Collection", exact: true }).click();
    const actual = await (
      await players.competitive.client.get(
        "/api/insights?category=Singles&period=30",
      )
    ).json();
    await expect(brief.locator(".studio-seal.earned")).toHaveCount(
      actual.studio.collection.length,
    );
    await expect(brief.locator(".studio-peak strong")).toHaveText(
      actual.studio.peak.score.toLocaleString("en"),
    );
    await brief.screenshot({ path: `${output}/studio-collection.png` });
    await brief
      .locator(".studio-seal-grid")
      .screenshot({ path: `${output}/studio-earned-seals.png` });
    await brief
      .getByRole("button", {
        name: `View earned ${actual.studio.collection[0].league} result`,
        exact: true,
      })
      .click();
    await expect(
      active.page.getByRole("dialog", {
        name: "Your confirmed result",
        exact: true,
      }),
    ).toBeVisible();
    await active.page.keyboard.press("Escape");
    await expect(
      active.page
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    observations.push({
      persona: "competitive",
      checked: [
        "earned collection matches actual published career results",
        "placement does not invent earned rewards",
        "keyboard End selects collection",
        "seal opens the real owned result",
        "home category preserved",
      ],
    });
  } finally {
    await active.context.close();
  }
});

test("studio matchup exploration preserves the chosen partner across periods and opens actual results with an explicit membership preview", async ({
  browser,
}) => {
  const active = await view(browser, "doubles");
  try {
    await active.page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    const brief = active.page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    await brief.getByRole("tab", { name: "Matchups", exact: true }).click();
    await brief.getByRole("button", { name: "Together", exact: true }).click();
    const actual = await (
        await players.doubles.client.get(
          "/api/insights?category=Doubles&period=30",
        )
      ).json(),
      partner = actual.partners.at(-1);
    await brief
      .getByLabel("Choose a partner", { exact: true })
      .selectOption(partner.player.id);
    await expect(brief.locator(".studio-matchup-record b")).toHaveText(
      `${partner.wins}–${partner.count - partner.wins}`,
    );
    await brief
      .getByLabel("Your playing period", { exact: true })
      .selectOption("7");
    await expect(
      brief.getByLabel("Choose a partner", { exact: true }),
    ).toHaveValue(partner.player.id);
    await expect(
      brief.locator(".studio-matchup-history button").first(),
    ).toBeVisible();
    await brief.screenshot({ path: `${output}/studio-matchups.png` });
    await brief.locator(".studio-matchup-history button").first().click();
    await expect(
      active.page.getByRole("dialog", {
        name: "Your confirmed result",
        exact: true,
      }),
    ).toBeVisible();
    await active.page.keyboard.press("Escape");
    await active.page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    await brief.locator(".studio-membership summary").click();
    await expect(brief.locator(".studio-membership")).toContainText(
      "$20/month proposal",
    );
    await expect(brief.locator(".studio-membership")).toContainText(
      "no payment is taken here",
    );
    await brief.screenshot({ path: `${output}/studio-membership-preview.png` });
    observations.push({
      persona: "doubles",
      checked: [
        "actual chosen-partner record",
        "chosen partner survives period selection",
        "exact owned matchup result opens",
        "proposed membership explains concrete tools without charging",
      ],
    });
  } finally {
    await active.context.close();
  }
});

test("profile studio targets the chosen category's goal and all studio views remain accessible in both themes and enlarged text", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const active = await view(browser, "recreational");
  try {
    const page = active.page;
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Your progress studio", exact: true })
      .click();
    let brief = page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    await brief
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    await brief
      .getByRole("button", { name: "Choose your own goal", exact: true })
      .click();
    await expect(page.locator("#goal-Singles")).toBeFocused();
    await expect(
      page.getByLabel("Preferred category on this device", { exact: true }),
    ).toHaveValue("Doubles");
    for (const theme of ["light", "dark"]) {
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page.getByRole("button", { name: "Passport", exact: true }).click();
      await page
        .getByRole("button", { name: "Your progress studio", exact: true })
        .click();
      brief = page.getByRole("dialog", {
        name: "Your progress brief",
        exact: true,
      });
      for (const tab of ["Overview", "Matchups", "Playbook", "Collection"]) {
        await brief.getByRole("tab", { name: tab, exact: true }).click();
        const audit = await new AxeBuilder({ page })
          .include("dialog[open]")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(audit.violations).toEqual([]);
        await page.screenshot({
          path: `${output}/studio-${theme}-${tab.toLowerCase()}.png`,
          animations: "disabled",
        });
        observations.push({
          persona: "recreational",
          view: `studio-${theme}-${tab}`,
          detectedAccessibilityViolations: audit.violations.length,
          indeterminateNodes: audit.incomplete.reduce(
            (n, item) => n + item.nodes.length,
            0,
          ),
        });
      }
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
    }
    await page.getByLabel("Text size", { exact: true }).selectOption("large");
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByRole("button", { name: "Passport", exact: true }).click();
    await page
      .getByRole("button", { name: "Your progress studio", exact: true })
      .click();
    brief = page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    await brief.getByRole("tab", { name: "Collection", exact: true }).click();
    expect(await brief.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
      path: `${output}/studio-large-collection.png`,
      animations: "disabled",
    });
    await brief.getByRole("tab", { name: "Playbook", exact: true }).click();
    expect(await brief.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include("dialog[open]")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `${output}/studio-large-playbook.png`,
      animations: "disabled",
    });
    observations.push({
      persona: "accessible",
      checked: [
        "profile studio entry",
        "selected Singles goal receives focus without changing Home category",
        "light/dark all four studio views",
        "320px at200percenttext collection",
      ],
      detectedAccessibilityViolations: audit.violations.length,
      indeterminateNodes: audit.incomplete.reduce(
        (n, item) => n + item.nodes.length,
        0,
      ),
    });
  } finally {
    await active.context.close();
  }
});

test("playbook gives a newcomer private recurring value, preserves edits on close, archives reflections and recovers a competing-window edit", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const active = await view(browser, "newcomer");
  try {
    const page = active.page;
    const open = async () => {
      await page
        .getByRole("button", { name: "Your progress brief", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Your progress brief",
        exact: true,
      });
      await dialog.getByRole("tab", { name: "Playbook", exact: true }).click();
      await expect(
        dialog.getByLabel("Session focus", { exact: true }),
      ).toBeVisible();
      return dialog;
    };
    let brief = await open();
    const intention = "Notice my recovery after each shot";
    await brief
      .getByLabel("Session focus", { exact: true })
      .selectOption("recovery");
    await brief
      .getByLabel("My next-session intention", { exact: true })
      .fill(intention);
    await brief
      .getByLabel("What I learned from my last session", { exact: true })
      .fill("A private fictional reflection");
    await expect(
      brief
        .getByRole("group", { name: "Rating category" })
        .getByRole("button", { name: "Singles", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(brief).toBeVisible();
    await expect(
      brief.getByLabel("My next-session intention", { exact: true }),
    ).toHaveValue(intention);
    await brief
      .getByRole("button", { name: "Save private playbook", exact: true })
      .click();
    await expect(brief).toContainText("Saved to your private playbook");
    await page.keyboard.press("Escape");
    await expect(brief).toHaveCount(0);
    brief = await open();
    await expect(
      brief.getByLabel("My next-session intention", { exact: true }),
    ).toHaveValue(intention);
    await brief
      .getByRole("button", { name: "Add reflection to journal", exact: true })
      .click();
    await expect(brief).toContainText(
      "Reflection added to your private journal",
    );
    await brief.locator(".playbook-journal summary").click();
    await expect(brief.locator(".playbook-journal article")).toContainText(
      "A private fictional reflection",
    );
    const downloadEvent = page.waitForEvent("download");
    await brief
      .getByRole("button", {
        name: "Download my private playbook",
        exact: true,
      })
      .click();
    const download = await downloadEvent;
    const file = await download.path();
    expect(readFileSync(file!, "utf8")).toContain(
      "A private fictional reflection",
    );
    const actor = players.newcomer;
    const stored = await (
      await actor.client.get("/api/playbook?category=Doubles")
    ).json();
    expect(
      (
        await actor.client.put("/api/playbook", {
          headers: headers(actor),
          data: {
            category: "Doubles",
            focus: stored.focus,
            intention: "Saved in another window",
            reflection: "",
            version: stored.version,
          },
        })
      ).status(),
    ).toBe(200);
    await brief
      .getByLabel("My next-session intention", { exact: true })
      .fill("My unsaved local intention");
    await brief
      .getByRole("button", { name: "Save private playbook", exact: true })
      .click();
    await expect(brief).toContainText("changed in another window");
    await expect(
      brief.getByLabel("My next-session intention", { exact: true }),
    ).toHaveValue("My unsaved local intention");
    await brief
      .getByRole("button", { name: "Discard edits and reload", exact: true })
      .click();
    await expect(
      brief.getByLabel("My next-session intention", { exact: true }),
    ).toHaveValue("Saved in another window");
    await brief.screenshot({ path: `${output}/studio-playbook-journal.png` });
    expect(
      (
        await new AxeBuilder({ page })
          .include("dialog[open]")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  } finally {
    await active.context.close();
  }
});

test("studio score history downloads the actual owner's selected-period records and score patterns stay factual", async ({
  browser,
}) => {
  const active = await view(browser, "doubles");
  try {
    const page = active.page;
    await page
      .getByRole("button", { name: "Your progress brief", exact: true })
      .click();
    const brief = page.getByRole("dialog", {
      name: "Your progress brief",
      exact: true,
    });
    const actual = await (
      await players.doubles.client.get(
        "/api/insights?category=Doubles&period=30",
      )
    ).json();
    await expect(
      brief.getByRole("region", { name: "Score patterns", exact: true }),
    ).toContainText(`${actual.patterns.close.count} recorded`);
    const event = page.waitForEvent("download");
    await brief
      .getByRole("button", { name: "Download my score history", exact: true })
      .click();
    const file = await (await event).path();
    const csv = readFileSync(file!, "utf8");
    expect(csv.split("\r\n")).toHaveLength(actual.scoreMatches.length + 1);
    for (const row of actual.scoreMatches) expect(csv).toContain(row.unitId);
    for (const name of Object.values(names)) expect(csv).not.toContain(name);
    await brief
      .getByLabel("Your playing period", { exact: true })
      .selectOption("all");
    await expect(
      brief.getByRole("button", {
        name: "Download my score history",
        exact: true,
      }),
    ).toBeEnabled();
    await brief
      .getByRole("region", { name: "Score patterns", exact: true })
      .screenshot({ path: `${output}/studio-score-patterns.png` });
  } finally {
    await active.context.close();
  }
});

test("court character wardrobe persists earned accessories, protects locked items and stays accessible", async ({
  browser,
}) => {
  const active = await view(browser, "competitive");
  try {
    const page = active.page;
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    const wardrobe = page.getByRole("region", {
      name: "Your court character",
      exact: true,
    });
    await expect(
      wardrobe.getByRole("button", { name: /Volt Visor/ }),
    ).toBeEnabled();
    await expect(
      wardrobe.getByRole("button", { name: /Orbit Halo/ }),
    ).toBeDisabled();
    await wardrobe.getByRole("button", { name: /Volt Visor/ }).click();
    await wardrobe
      .getByRole("button", { name: "Save my court look", exact: true })
      .click();
    await expect(wardrobe).toContainText("Your court look is saved");
    expect(
      (await (await players.competitive.client.get("/api/character")).json())
        .look.accessory,
    ).toBe("visor");
    await expect(wardrobe.locator(".character-stage svg")).toHaveAttribute(
      "data-accessory",
      "visor",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include(".character-wardrobe")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await wardrobe.screenshot({ path: `${output}/character-wardrobe.png` });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
    await page.getByRole("button", { name: "Passport", exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .include(".character-wardrobe")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  } finally {
    await active.context.close();
  }
});

test("court characters celebrate both actual sides of a confirmed match with supportive win and loss states", async ({
  browser,
}) => {
  const unitId = await publish(
    [players.competitive, players.recreational],
    "Singles",
    true,
  );
  await expect
    .poll(
      async () =>
        (
          await (
            await players.competitive.client.get(`/api/results/${unitId}`)
          ).json()
        ).status,
    )
    .toBe("rated");
  for (const key of ["competitive", "recreational"] as const) {
    const active = await view(browser, key);
    try {
      const page = active.page;
      await page.goto(`/home?result=${unitId}`);
      const dialog = page.getByRole("dialog", {
        name: "Your confirmed result",
        exact: true,
      });
      await expect(
        dialog.locator(
          key === "competitive"
            ? ".character-result.is-win"
            : ".character-result.is-loss",
        ),
      ).toBeVisible();
      await expect(
        dialog.locator(".character-result-cast .court-character"),
      ).toHaveCount(2);
      const owned = await (
        await players[key].client.get(`/api/results/${unitId}`)
      ).json();
      const change = Object.values(owned.ratingChanges)[0] as any;
      await expect(
        dialog.getByRole("group", { name: "Published rating impact" }),
      ).toContainText(change.after.toLocaleString("en"));
      expect(
        (
          await new AxeBuilder({ page })
            .include(".character-result")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await dialog.screenshot({
        path: `${output}/character-${key === "competitive" ? "win" : "loss"}.png`,
      });
    } finally {
      await active.context.close();
    }
  }
});

test("friend podium badges reflect API standings and export a labelled private snapshot", async ({
  browser,
}) => {
  const active = await view(browser, "recreational");
  try {
    const page = active.page;
    const actual = await (
      await players.recreational.client.get("/api/podiums?category=Doubles")
    ).json();
    expect(actual.boards[0].ready).toBe(true);
    const panel = page.getByRole("region", {
      name: "Your competitive podiums",
      exact: true,
    });
    await expect(panel).toContainText(
      `#${actual.boards[0].position} of ${actual.boards[0].comparable}`,
    );
    if (actual.boards[0].podium) {
      const download = page.waitForEvent("download");
      await panel
        .getByRole("button", { name: "Download my podium card", exact: true })
        .first()
        .click();
      const file = await (await download).path();
      expect(readFileSync(file!).subarray(1, 4).toString()).toBe("PNG");
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".podiums-panel")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await panel.screenshot({ path: `${output}/friend-podium.png` });
  } finally {
    await active.context.close();
  }
});
