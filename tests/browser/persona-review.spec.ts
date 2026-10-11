import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Database } from "../../server/database.ts";
import {
  preferenceValues,
  preferenceSnapshot,
} from "../../src/preference-draft.ts";

const names = {
  rookie: "Asha First Time Player",
  regular: "Ben Recreational Player",
  competitive: "Chloe Competitive Singles",
  doubles: "Dev Regular Doubles",
  owner: "Ella Existing Group Owner",
  privacy: "Farah Privacy Focused",
  returning: "Gabe Returning Player",
  reviewer: "Harper Independent Reviewer",
};
type Persona = {
  id: string;
  username: string;
  csrf: string;
  client: APIRequestContext;
  state: any;
};
const personas = {} as Record<keyof typeof names, Persona>;
const units: string[] = [];
const headers = (p: Persona) => ({
  origin: "http://localhost:4174",
  "x-csrf-token": p.csrf,
  "idempotency-key": randomUUID(),
});
async function view(browser: Browser, key: keyof typeof names) {
  const context = await browser.newContext({
    baseURL: "http://localhost:4174",
    storageState: personas[key].state,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
  return { context, page };
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}
test.beforeAll(async ({ playwright }) => {
  for (const [key, name] of Object.entries(names)) {
    const client = await playwright.request.newContext({
      baseURL: "http://localhost:4174",
    });
    const username = "persona_" + randomUUID().slice(0, 8);
    const response = await client.post("/api/auth/register", {
      headers: { origin: "http://localhost:4174" },
      data: { username, name, password: "Persona-fixture-2026!", adult: true },
    });
    expect(response.ok()).toBe(true);
    const me = await (await client.get("/api/me")).json();
    personas[key as keyof typeof names] = {
      id: me.id,
      username,
      csrf: me.csrf,
      client,
      state: await client.storageState(),
    };
  }
  // Test-only role assignment in the disposable browser fixture database.
  const db = new Database("data/browser-tests.sqlite");
  try {
    db.run("UPDATE users SET role='reviewer' WHERE id=?", personas.reviewer.id);
  } finally {
    db.close();
  }
  for (let i = 0; i < 6; i++) {
    const a = personas.competitive,
      b = personas.regular;
    const response = await a.client.post("/api/results", {
      headers: headers(a),
      data: {
        unitId: randomUUID(),
        category: "Singles",
        format: "ONE_21",
        roster: [a.id, b.id],
        games: [[21, 17]],
        playedAt: new Date(Date.now() - 600000 + i * 60000).toISOString(),
        scopeId: null,
        agree: true,
      },
    });
    expect(response.ok()).toBe(true);
    const id = (await response.json()).id;
    units.push(id);
    const result = await (await b.client.get("/api/results/" + id)).json();
    expect(
      (
        await b.client.post("/api/results/" + id + "/approve", {
          headers: headers(b),
          data: { revisionId: result.revisionId, agree: true },
        })
      ).ok(),
    ).toBe(true);
  }
  await expect
    .poll(
      async () =>
        (
          await (await personas.competitive.client.get("/api/me")).json()
        ).ratings.find((r: any) => r.category === "Singles").score,
      { timeout: 15000 },
    )
    .not.toBeNull();
  expect(
    (
      await personas.competitive.client.post("/api/friends", {
        headers: headers(personas.competitive),
        data: { playerId: personas.regular.id },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await personas.regular.client.post(
        "/api/friends/" + personas.competitive.id + "/accept",
        { headers: headers(personas.regular), data: {} },
      )
    ).ok(),
  ).toBe(true);
});
test.afterAll(async () => {
  for (const p of Object.values(personas)) await p.client.dispose();
});

test("privacy persona keeps unsaved choices through navigation and refresh; stale choices cannot replace newer saved privacy", async ({
  browser,
}) => {
  const { context, page } = await view(browser, "privacy");
  try {
    await settings(page);
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Farah Unsaved Draft");
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await settings(page);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      "Farah Unsaved Draft",
    );
    await page.reload();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      "Farah Unsaved Draft",
    );
    const actor = personas.privacy;
    const me = await (await actor.client.get("/api/me")).json();
    expect(
      (
        await actor.client.patch("/api/profile", {
          headers: headers(actor),
          data: {
            ...preferenceValues(me),
            breakMode: true,
            expectedPreferences: preferenceSnapshot(me),
          },
        })
      ).ok(),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Save my preferences", exact: true })
      .click();
    await expect(
      page.getByText("Your saved preferences changed elsewhere.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save my preferences", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: "Use latest saved preferences",
        exact: true,
      })
      .click();
    await expect(page.getByLabel(/^Take a break/)).toBeChecked();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      names.privacy,
    );
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Farah Temporary Edit");
    await page
      .getByRole("button", { name: "Discard unsaved preferences", exact: true })
      .click();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      names.privacy,
    );
    for (const mode of ["dark", "system", "light"])
      await page.getByLabel("Appearance", { exact: true }).selectOption(mode);
    for (const size of ["large", "normal"])
      await page.getByLabel("Text size", { exact: true }).selectOption(size);
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Farah Before Signout");
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        (id) => sessionStorage.getItem("shuttl:preferences-draft:" + id),
        actor.id,
      ),
    ).toBeNull();
  } finally {
    await context.close();
  }
});

test("rookie and competitive personas use guides, categories, history chart, comparisons and retry without false rankings", async ({
  browser,
}) => {
  const rookie = await view(browser, "rookie"),
    athlete = await view(browser, "competitive");
  try {
    let failWeek = true;
    await rookie.page.route("**/api/insights?category=**&period=7", (route) =>
      failWeek
        ? route.fulfill({
            status: 503,
            json: { error: "Synthetic weekly interruption" },
          })
        : route.continue(),
    );
    await rookie.page.reload();
    await expect(
      rookie.page.getByRole("button", {
        name: "Retry weekly recap",
        exact: true,
      }),
    ).toBeVisible();
    await expect(rookie.page.locator(".weekly-retry")).toContainText(
      "only the recent results loaded here",
    );
    failWeek = false;
    await rookie.page
      .getByRole("button", { name: "Retry weekly recap", exact: true })
      .click();
    await expect(rookie.page.locator(".weekly-retry")).toHaveCount(0);
    await rookie.page
      .locator(".next-step")
      .getByRole("button", { name: "Record a completed result", exact: true })
      .click();
    await expect(
      rookie.page.getByRole("dialog", { name: "Record a result", exact: true }),
    ).toBeVisible();
    await rookie.page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await rookie.page
      .getByRole("button", { name: "What this rating means", exact: true })
      .click();
    await rookie.page
      .getByText("The league collection", { exact: true })
      .click();
    await expect(rookie.page.getByRole("dialog")).toContainText(
      "Five results do not certify",
    );
    await rookie.page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    for (const category of ["Singles", "Mixed", "Doubles"])
      await rookie.page
        .getByRole("button", { name: category, exact: true })
        .click();
    let failPool = true;
    await rookie.page.route("**/api/rankings?**", (route) =>
      failPool
        ? route.fulfill({
            status: 503,
            json: { error: "Synthetic pool interruption" },
          })
        : route.continue(),
    );
    await rookie.page
      .getByRole("button", { name: "Rankings", exact: true })
      .last()
      .click();
    await expect(
      rookie.page.getByRole("button", { name: "Retry comparison pool" }),
    ).toBeVisible();
    failPool = false;
    await rookie.page
      .getByRole("button", { name: "Retry comparison pool" })
      .click();
    await expect(
      rookie.page.getByText("Choose your local context", { exact: true }),
    ).toBeVisible();
    await athlete.page
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    const chart = athlete.page.getByRole("group", {
      name: "Inspect rating history",
    });
    await chart.getByRole("button").first().click();
    await chart.getByRole("button").last().click();
    await athlete.page
      .getByRole("button", { name: "Replay the visible rating change" })
      .click();
    await athlete.page
      .getByRole("button", { name: "Circle", exact: true })
      .last()
      .click();
    let failComparison = true;
    await athlete.page.route("**/api/comparisons/**", (route) =>
      failComparison
        ? route.fulfill({
            status: 503,
            json: { error: "Synthetic comparison interruption" },
          })
        : route.continue(),
    );
    await athlete.page
      .getByRole("button", { name: "Compare", exact: false })
      .first()
      .click();
    await expect(
      athlete.page.getByRole("button", { name: "Retry player comparison" }),
    ).toBeVisible();
    failComparison = false;
    await athlete.page
      .getByRole("button", { name: "Retry player comparison" })
      .click();
    for (const category of ["Doubles", "Mixed", "Singles"])
      await athlete.page
        .getByRole("dialog")
        .getByRole("button", { name: category, exact: true })
        .click();
    await athlete.page
      .getByRole("dialog")
      .getByRole("button", { name: "What this rating means", exact: true })
      .click();
    await athlete.page
      .getByRole("dialog", { name: "A clearer picture of your game" })
      .getByRole("button", { name: "Close dialog" })
      .click();
    const pin = athlete.page.getByRole("button", {
      name: "Keep this comparison on home",
    });
    await expect(pin).toBeVisible();
    await pin.click();
    expect(
      await athlete.page.evaluate(
        (owner) => localStorage.getItem("shuttl:rival:" + owner + ":Singles"),
        personas.competitive.id,
      ),
    ).toBe(personas.regular.id);
    await athlete.page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await expect(athlete.page.locator(".rival-strip")).toContainText(
      "YOUR CHOSEN COMPARISON",
    );
    await athlete.page
      .locator(".next-step")
      .getByRole("button", { name: "Manage your goals", exact: true })
      .click();
    await expect(athlete.page.locator("#goal-Singles")).toBeFocused();
    const currentRating = (
      await (await personas.competitive.client.get("/api/me")).json()
    ).ratings.find((r: any) => r.category === "Singles").score;
    await athlete.page.locator("#goal-Singles").fill(String(currentRating));
    await athlete.page
      .getByRole("button", { name: "Save my preferences", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await personas.competitive.client.get("/api/me")).json())
            .goals.Singles,
      )
      .toBe(currentRating);
    await athlete.page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await expect(athlete.page.locator(".next-step")).toContainText(
      `Singles target ${currentRating} · current rating ${currentRating}`,
    );
    await athlete.page
      .getByRole("button", { name: "Choose your next target", exact: true })
      .click();
    await expect(athlete.page.locator("#goal-Singles")).toBeFocused();
    await athlete.page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await athlete.page
      .getByRole("button", { name: "Open shared result", exact: true })
      .first()
      .click();
    await expect(
      athlete.page.getByRole("dialog", {
        name: "Your confirmed result",
        exact: true,
      }),
    ).toBeVisible();
    await athlete.page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await athlete.page
      .getByRole("button", { name: "Choose a comparison", exact: true })
      .click();
    await athlete.page
      .getByRole("button", { name: "Compare", exact: false })
      .first()
      .click();
    await athlete.page
      .getByText("Manage this connection", { exact: true })
      .click();
    await athlete.page
      .getByRole("button", { name: "Remove connection", exact: true })
      .click();
    await expect(athlete.page.getByRole("dialog")).toHaveCount(0);
    expect(
      (
        await (await personas.competitive.client.get("/api/dashboard")).json()
      ).friends.some((p: any) => p.id === personas.regular.id),
    ).toBe(false);
    await athlete.page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await athlete.page
      .getByRole("button", { name: "Insights", exact: true })
      .click();
    for (const period of ["7", "90", "all", "30"])
      await athlete.page.getByLabel("Your playing period").selectOption(period);
    await athlete.page
      .getByRole("button", { name: "History", exact: true })
      .click();
    await athlete.page
      .getByLabel("Find a player in loaded results")
      .fill(personas.regular.username);
    await athlete.page.getByLabel("Result status").selectOption("rated");
    await expect(athlete.page.locator(".result-card")).toHaveCount(6);
  } finally {
    await rookie.context.close();
    await athlete.context.close();
  }
});

test("competitive persona recovers the original share after a lost response and download does not create another link", async ({
  browser,
}) => {
  const { context, page } = await view(browser, "competitive");
  try {
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    let lost = true;
    const keys: string[] = [];
    await page.route("**/api/shares", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (lost) {
        lost = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Create a shareable link" }).click();
    await expect(
      page.getByRole("button", { name: "Recover this snapshot link" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.evaluate((owner) => {
      const key = "shuttl:pending-share:" + owner;
      const pending = JSON.parse(localStorage.getItem(key)!);
      pending.started = Date.now() - 2 * 86400000;
      localStorage.setItem(key, JSON.stringify(pending));
    }, personas.competitive.id);
    await page.reload();
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Recover this snapshot link" })
      .click();
    await expect(page.getByLabel("Your public snapshot link")).toHaveValue(
      /\/share\//,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(
      (await (await personas.competitive.client.get("/api/my-shares")).json())
        .shares,
    ).toHaveLength(1);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download my rating snapshot" })
      .click();
    expect((await download).suggestedFilename()).toBe(
      "shuttl-singles-story.png",
    );
    expect(keys).toHaveLength(2);
  } finally {
    await context.close();
  }
});

test("independent reviewer persona resolves both decisions and retries processing through the visible desk", async ({
  browser,
}) => {
  const actor = personas.regular;
  for (const id of units.slice(0, 2)) {
    const exact = await (await actor.client.get("/api/results/" + id)).json();
    expect(
      (
        await actor.client.post("/api/results/" + id + "/dispute", {
          headers: headers(actor),
          data: {
            revisionId: exact.revisionId,
            reason: "Synthetic review: verify these exact recorded scores.",
          },
        })
      ).ok(),
    ).toBe(true);
  }
  const { context, page } = await view(browser, "reviewer");
  try {
    await settings(page);
    await page.getByRole("link", { name: "Review desk", exact: true }).click();
    const list = await (
      await personas.reviewer.client.get("/api/reviewer")
    ).json();
    for (const [i, id] of units.slice(0, 2).entries()) {
      const review = list.reviews.find((r: any) => r.unit_id === id);
      expect(review).toBeTruthy();
      const panel = page
        .locator(".panel")
        .filter({ has: page.locator("#review-" + review.id) });
      await panel
        .getByLabel("Recorded decision explanation")
        .fill(
          "Independent fixture review of the recorded evidence and exact consent.",
        );
      await panel
        .getByRole("button", {
          name: i
            ? "Mark this result unrated"
            : "Uphold existing valid approvals",
        })
        .click();
      await expect(panel).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Retry delayed jobs" }).click();
    const voided = await (
      await personas.regular.client.get("/api/results/" + units[1])
    ).json();
    expect(voided.status).toBe("void");
    expect((await personas.rookie.client.get("/api/reviewer")).status()).toBe(
      403,
    );
  } finally {
    await context.close();
  }
});

test("an expired session preserves pending share identity and preferences for sign-in recovery, then explicit sign-out clears them", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const actor = personas.competitive;
  const { context, page } = await view(browser, "competitive");
  try {
    await settings(page);
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Chloe Recoverable Edit");
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    let lost = true;
    const keys: string[] = [];
    await page.route("**/api/shares", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (lost) {
        lost = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Create a shareable link" }).click();
    await expect(
      page.getByRole("button", { name: "Recover this snapshot link" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.route("**/api/dashboard", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Sign in again." }),
      }),
    );
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        (owner) =>
          !!localStorage.getItem("shuttl:pending-share:" + owner) &&
          !!sessionStorage.getItem("shuttl:preferences-draft:" + owner),
        actor.id,
      ),
    ).toBe(true);
    await page.unroute("**/api/dashboard");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Username", { exact: true }).fill(actor.username);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Persona-fixture-2026!");
    await page
      .locator("form")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your game.", exact: true }),
    ).toBeVisible();
    await settings(page);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      "Chloe Recoverable Edit",
    );
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Recover this snapshot link" })
      .click();
    await expect(page.getByLabel("Your public snapshot link")).toHaveValue(
      /\/share\//,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        (owner) =>
          localStorage.getItem("shuttl:pending-share:" + owner) === null &&
          sessionStorage.getItem("shuttl:preferences-draft:" + owner) === null,
        actor.id,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
