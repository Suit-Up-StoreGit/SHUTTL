import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
async function signup(page: Page, name: string) {
  const username = "ui_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Ui-test-password-2026!");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your game.",
  );
  return username;
}
test("five distinct home concepts fit phone and desktop, with separate Mixed state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 430, 1366])
    for (const concept of [
      "passport",
      "court",
      "circle",
      "arena",
      "editorial",
    ]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/design?concept=" + concept);
      await page.locator(".rating-number").waitFor();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Mixed", exact: true }).click();
      await expect(page.locator(".rating-number")).toHaveText("—");
      await expect(page.locator("svg[role=img]")).toHaveCount(0);
    }
  expect(errors).toEqual([]);
});

test("a delayed private dashboard cannot restore an account after sign out", async ({
  page,
}) => {
  await signup(page, "Private Delayed Response Fixture");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  let release!: () => void,
    captured!: () => void,
    hold = true;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/dashboard", async (route) => {
    if (!hold) {
      await route.continue();
      return;
    }
    hold = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    captured();
    await gate;
    await route.fulfill({
      response,
      headers: { ...response.headers(), "x-delayed-fixture": "1" },
    });
  });
  try {
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await started;
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", { name: "Create my player identity" }),
    ).toBeVisible();
    const delayed = page.waitForResponse(
      (r) => r.headers()["x-delayed-fixture"] === "1",
    );
    release();
    await (await delayed).finished();
    // Allow the response consumer and React's next paint to run, without a
    // fixed sleep that could hide the private-content race.
    await page.evaluate(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });
    await expect(
      page.getByRole("button", { name: "Create my player identity" }),
    ).toBeVisible();
    await expect(
      page.getByText("Welcome back, Private.", { exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});
test("every league seal stays inside the passport on narrow phones", async ({
  page,
}) => {
  for (const width of [320, 390, 430])
    for (const score of [1200, 1250, 1400, 1550, 1700, 1800, 1900, 2050]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/design?score=" + score);
      await page.locator(".rating-number").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const fits = await page.locator(".rating-passport").evaluate((card) => {
        const parent = card.getBoundingClientRect();
        const number = card.querySelector(".rating-number") as HTMLElement;
        if (
          number.clientHeight >
            Math.ceil(parseFloat(getComputedStyle(number).lineHeight)) + 1 ||
          number.scrollWidth > number.clientWidth + 1
        )
          return false;
        return [
          ...card.querySelectorAll(
            ".rating-number,.passport-seal,.passport-seal span",
          ),
        ].every((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.left >= parent.left &&
            r.right <= parent.right &&
            r.top >= parent.top &&
            r.bottom <= parent.bottom
          );
        });
      });
      expect(fits, `${width}px / ${score}`).toBe(true);
    }
});
test("signup, local draft offline retry, cross-account Singles approval and category history", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page, "UI Court Player");
  const otherContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      baseURL: "http://127.0.0.1:4174",
    }),
    other = await otherContext.newPage();
  try {
    const opponent = await signup(other, "UI Opponent");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page.getByRole("button", { name: /Record a result/ }).click();
    await page
      .getByRole("button", { name: "Choose player", exact: true })
      .click();
    await page.getByLabel("Username or public display name").fill(opponent);
    await page
      .getByRole("button", { name: new RegExp("UI Opponent|@" + opponent) })
      .click();
    await page.getByLabel("Your side", { exact: true }).fill("21");
    await page.getByLabel("Other side", { exact: true }).fill("18");
    await page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await page.context().setOffline(true);
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(page.getByRole("alert")).toContainText("offline");
    await page.context().setOffline(false);
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await other.getByRole("button", { name: "Open your inbox" }).click();
    await other.getByRole("button", { name: "Open this exact result" }).click();
    await other
      .getByRole("checkbox", { name: /These are the correct sides/ })
      .check();
    await other
      .getByRole("button", { name: "Confirm this exact score" })
      .click();
    await expect(
      other.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await expect(
      page.locator(".profile-rating-line").filter({ hasText: "Singles" }),
    ).toContainText("1 confirmed results");
    await expect(
      page.locator(".profile-rating-line").filter({ hasText: "Doubles" }),
    ).toContainText("0 confirmed results");
    expect(errors).toEqual([]);
  } finally {
    await otherContext.close();
  }
});
test("profile preferences survive refresh and a draft survives navigation", async ({
  page,
}) => {
  await signup(page, "UI Private Player");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Preferred category on this device")
    .selectOption("Singles");
  await page
    .getByLabel("Declared district", { exact: true })
    .selectOption("Tampines");
  await page.getByRole("button", { name: "Save my preferences" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await expect(
    page.getByLabel("Declared district", { exact: true }),
  ).toHaveValue("Tampines");
  await expect(
    page.getByLabel("Preferred category on this device"),
  ).toHaveValue("Singles");
  await page.getByRole("button", { name: "Home", exact: true }).last().click();
  await page
    .getByRole("button", { name: /Record a result|Continue your draft/ })
    .click();
  await page.getByLabel("Your side", { exact: true }).fill("21");
  await page.getByLabel("Other side", { exact: true }).fill("17");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: /Record a result|Continue your draft/ })
    .click();
  await expect(page.getByLabel("Other side", { exact: true })).toHaveValue(
    "17",
  );
});
test("a five-result reveal has a robust compact share and exports a verified story image", async ({
  page,
  browser,
}, testInfo) => {
  const name = "Alexandria".repeat(5);
  await signup(page, name);
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4174",
    }),
    other = await context.newPage();
  try {
    await signup(other, "Share Fixture Opponent");
    const author = await (await page.request.get("/api/me")).json(),
      opponent = await (await other.request.get("/api/me")).json();
    const headers = (csrf: string) => ({
      origin: "http://127.0.0.1:4174",
      "x-csrf-token": csrf,
      "idempotency-key": randomUUID(),
    });
    for (let i = 0; i < 5; i++) {
      const submitted = await page.request.post("/api/results", {
        headers: headers(author.csrf),
        data: {
          unitId: randomUUID(),
          category: "Singles",
          format: "ONE_21",
          roster: [author.id, opponent.id],
          games: [[21, 17]],
          playedAt: new Date(Date.now() - 120000 + i * 15000).toISOString(),
          scopeId: null,
          agree: true,
        },
      });
      expect(submitted.ok()).toBe(true);
      const unit = (await submitted.json()).id;
      const revision = await (
        await other.request.get("/api/results/" + unit)
      ).json();
      expect(
        (
          await other.request.post("/api/results/" + unit + "/approve", {
            headers: headers(opponent.csrf),
            data: { revisionId: revision.revisionId, agree: true },
          })
        ).ok(),
      ).toBe(true);
    }
    const privacy = Object.fromEntries(
      [
        "name",
        "district",
        "publicName",
        "publicDistrict",
        "publicHistory",
        "discoverable",
        "localOptIn",
        "breakMode",
        "timezone",
        "goals",
      ].map((key) => [key, author[key]]),
    );
    expect(
      (
        await page.request.patch("/api/profile", {
          headers: headers(author.csrf),
          data: { ...privacy, publicName: true },
        })
      ).ok(),
    ).toBe(true);
    // The fixture writes through the API while the page is idle. Load the
    // published state explicitly; the live revision test covers polling.
    await page.reload();
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await expect(page.locator(".rating-number")).not.toHaveText("—", {
      timeout: 15000,
    });
    await expect(page.locator(".latest-result .result-reward")).toContainText(
      "Your starting rating is here",
    );
    await expect(
      page.locator(".latest-result .result-reward .reward-score > span"),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    await page.setViewportSize({ width: 320, height: 844 });
    const compact = page.locator(".rating-passport.compact");
    await expect(compact).toBeVisible();
    expect(
      await compact.evaluate((e) => {
        const c = e.getBoundingClientRect(),
          s = e.querySelector(".passport-seal")!.getBoundingClientRect();
        const n = e.querySelector(".rating-number") as HTMLElement;
        return (
          s.right <= c.right &&
          s.left >= c.left &&
          n.clientHeight <=
            Math.ceil(parseFloat(getComputedStyle(n).lineHeight)) + 1 &&
          n.scrollWidth <= n.clientWidth + 1
        );
      }),
    ).toBe(true);
    await expect(
      page.locator("#share-template option[value=reveal]"),
    ).not.toBeDisabled();
    await page.getByLabel("Your story").selectOption("reveal");
    await page
      .getByRole("checkbox", { name: /Include my public name/ })
      .check();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download my rating snapshot" })
      .click();
    const download = await downloadPromise;
    await download.saveAs(testInfo.outputPath("verified-reveal-story.png"));
    const png = readFileSync((await download.path())!);
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1920);
    await expect(page.getByLabel("Your public snapshot link")).toHaveValue(
      /\/share\//,
    );
  } finally {
    await context.close();
  }
});

test("a live correction clears both exact-result and batch acknowledgements", async ({
  page,
  browser,
}) => {
  test.setTimeout(70000);
  await signup(page, "Revision Author");
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      baseURL: "http://127.0.0.1:4174",
    }),
    other = await context.newPage();
  try {
    const username = await signup(other, "Revision Opponent");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page.getByRole("button", { name: /Record a result/ }).click();
    await page
      .getByRole("button", { name: "Choose player", exact: true })
      .click();
    await page.getByLabel("Username or public display name").fill(username);
    await page
      .getByRole("button", {
        name: new RegExp("Revision Opponent|@" + username),
      })
      .click();
    await page.getByLabel("Your side", { exact: true }).fill("21");
    await page.getByLabel("Other side", { exact: true }).fill("15");
    await page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await other.getByRole("button", { name: "Open your inbox" }).click();
    await other.locator(".notice.neutral .check-line input").first().check();
    await other
      .getByRole("checkbox", { name: /I read every selected score/ })
      .check();
    await other.getByRole("button", { name: "Open this exact result" }).click();
    await other
      .getByRole("checkbox", { name: /These are the correct sides/ })
      .check();
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page.locator(".result-card").first().click();
    await page.getByRole("button", { name: "Correct the score" }).click();
    await page.getByLabel("Side A", { exact: true }).fill("15");
    await page.getByLabel("Side B", { exact: true }).fill("21");
    await page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await page.getByRole("button", { name: "Propose correction" }).click();
    await expect(other.locator(".revision-notice")).toBeVisible({
      timeout: 30000,
    });
    await expect(
      other.getByRole("checkbox", { name: /These are the correct sides/ }),
    ).not.toBeChecked();
    await expect(
      other.getByRole("button", { name: "Confirm this exact score" }),
    ).toBeDisabled();
    await other.getByRole("button", { name: "Close dialog" }).click();
    await expect(
      other.getByRole("button", { name: /Approve 1 exact result/ }),
    ).toHaveCount(0);
    await expect(
      other.locator(".notice.neutral .check-line input").first(),
    ).not.toBeChecked();
    await other.getByRole("button", { name: "Open this exact result" }).click();
    await other
      .getByRole("checkbox", { name: /These are the correct sides/ })
      .check();
    await other
      .getByRole("button", { name: "Confirm this exact score" })
      .click();
    await expect(
      other.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(other.locator(".placement-recap")).toContainText("1 of 5");
    await other.reload();
    await expect(other.getByRole("dialog")).toBeVisible();
    await other.getByRole("button", { name: "Close dialog" }).click();
    await other
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await other.getByRole("button", { name: "Settings", exact: true }).click();
    await other
      .getByRole("button", { name: "Sign out", exact: true })
      .last()
      .click();
    await expect(
      other.getByRole("button", { name: "Create my player identity" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
