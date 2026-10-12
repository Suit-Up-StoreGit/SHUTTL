import {
  test,
  expect,
  type Browser,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const output = "outputs/home-persona-review-2026-10-12";
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
async function publish(roster: Persona[], category: string, win = true) {
  const actor = roster[0];
  const response = await actor.client.post("/api/results", {
    headers: headers(actor),
    data: {
      unitId: randomUUID(),
      category,
      format: "ONE_21",
      roster: roster.map((p) => p.id),
      games: [win ? [21, 17] : [17, 21]],
      playedAt: new Date(
        Date.now() - 7200000 + matchIndex++ * 60000,
      ).toISOString(),
      scopeId: null,
      agree: true,
    },
  });
  expect(response.status()).toBe(200);
  const id = (await response.json()).id;
  const unit = await (await actor.client.get(`/api/results/${id}`)).json();
  for (const p of roster.slice(1))
    expect(
      (
        await p.client.post(`/api/results/${id}/approve`, {
          headers: headers(p),
          data: { revisionId: unit.revisionId, agree: true },
        })
      ).status(),
    ).toBe(200);
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
  ).toBeVisible();
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
    (key) => key !== "newcomer",
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
        observations,
      },
      null,
      2,
    ),
  );
  for (const p of Object.values(players)) await p.client.dispose();
});
for (const key of Object.keys(names) as (keyof typeof names)[])
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
