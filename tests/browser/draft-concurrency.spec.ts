import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function signup(page: Page, name: string) {
  const username = "dc_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Draft-fixture-2026!");
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

async function record(page: Page) {
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await page
    .getByRole("button", { name: /Record a match|Continue your draft/ })
    .click();
}

async function choose(page: Page, username: string) {
  await page
    .getByRole("button", { name: "Choose player", exact: true })
    .click();
  await page.getByLabel("Username or public display name").fill(username);
  await page.getByRole("button", { name: new RegExp("@" + username) }).click();
}

async function stored(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) =>
      name.startsWith("shuttl:draft:"),
    );
    return key ? JSON.parse(localStorage.getItem(key)!) : null;
  });
}

test("a second tab pauses before it can overwrite or remove another tab’s draft without Web Locks", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  await signup(page, "Concurrent Draft Fixture");
  await record(page);
  await page.getByLabel("Your side", { exact: true }).fill("21");
  await page.getByLabel("Other side", { exact: true }).fill("17");
  await expect
    .poll(async () => (await stored(page))?.scores)
    .toEqual([["21", "17"]]);
  const original = await stored(page);
  const second = await context.newPage();
  await second.goto("/");
  await record(second);
  await expect(second.getByLabel("Other side", { exact: true })).toHaveValue(
    "17",
  );
  await expect(page.getByLabel("Other side", { exact: true })).toBeEnabled();
  await page.getByLabel("Other side", { exact: true }).fill("18");
  await expect(
    second.getByText("This draft changed in another tab.", { exact: true }),
  ).toBeVisible();
  await expect(second.getByLabel("Other side", { exact: true })).toBeDisabled();
  await expect(second.getByLabel("Other side", { exact: true })).toHaveValue(
    "17",
  );
  await expect
    .poll(async () => (await stored(page))?.scores)
    .toEqual([["21", "18"]]);
  await second
    .getByRole("button", { name: "Use saved draft from other tab" })
    .click();
  await expect(second.getByLabel("Other side", { exact: true })).toHaveValue(
    "18",
  );
  await expect(second.getByLabel("Other side", { exact: true })).toBeEnabled();
  expect((await stored(second)).unitId).toBe(original.unitId);
  expect((await stored(second)).requestKey).toBe(original.requestKey);
  await second.getByLabel("Other side", { exact: true }).fill("19");
  await expect(
    page.getByText("This draft changed in another tab.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close this paused tab" }).click();
  await expect
    .poll(async () => (await stored(second))?.scores)
    .toEqual([["21", "19"]]);
  await second.getByRole("button", { name: "Close dialog" }).click();
  await record(second);
  await expect(second.getByLabel("Other side", { exact: true })).toHaveValue(
    "19",
  );
  expect((await stored(second)).unitId).toBe(original.unitId);
});

test("a lost result response freezes its payload across tabs and retries the original match only", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  await signup(page, "Immutable Retry Fixture");
  const otherContext = await browser.newContext({
    baseURL: "http://localhost:4174",
  });
  try {
    const opponent = await otherContext.newPage();
    const username = await signup(opponent, "Immutable Opponent Fixture");
    await record(page);
    await choose(page, username);
    await page.getByLabel("Your side", { exact: true }).fill("21");
    await page.getByLabel("Other side", { exact: true }).fill("17");
    await expect
      .poll(async () => (await stored(page))?.scores)
      .toEqual([["21", "17"]]);
    const original = await stored(page);
    const second = await context.newPage();
    await second.goto("/");
    await record(second);
    await page.route("**/api/results", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    });
    await page.route("**/api/results/*", (route) => route.abort("failed"));
    await page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "may already have reached SHUTTL",
    );
    await expect(page.getByLabel("Other side", { exact: true })).toBeDisabled();
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((name) =>
        name.startsWith("shuttl:draft:"),
      )!;
      const draft = JSON.parse(localStorage.getItem(key)!);
      draft.savedAt = Date.now() - 8 * 86400000;
      localStorage.setItem(key, JSON.stringify(draft));
    });
    await page.reload();
    await record(page);
    await expect(page.getByLabel("Other side", { exact: true })).toBeDisabled();
    expect((await stored(page)).unitId).toBe(original.unitId);
    expect((await stored(page)).requestKey).toBe(original.requestKey);
    await expect(
      second.getByText("This draft changed in another tab.", { exact: true }),
    ).toBeVisible();
    await second
      .getByRole("button", { name: "Use saved draft from other tab" })
      .click();
    await expect(
      second.getByLabel("Other side", { exact: true }),
    ).toBeDisabled();
    await expect(
      second.getByText("Check this submission before starting another.", {
        exact: true,
      }),
    ).toBeVisible();
    const retained = await stored(second);
    expect(retained.unitId).toBe(original.unitId);
    expect(retained.requestKey).toBe(original.requestKey);
    expect(retained.scores).toEqual(original.scores);
    const retried = second.waitForRequest(
      (request) =>
        request.url().endsWith("/api/results") && request.method() === "POST",
    );
    await second
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await second
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    const request = await retried;
    expect(request.headers()["idempotency-key"]).toBe(original.requestKey);
    expect(request.postDataJSON().unitId).toBe(original.unitId);
    await expect(second.getByRole("dialog")).toHaveCount(0);
    expect(
      (await (await second.request.get("/api/results")).json()).results,
    ).toHaveLength(1);
  } finally {
    await otherContext.close();
  }
});

test("an agreement with a lost response retains its exact window and retry identifier after reopening", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await signup(page, "Agreement Retry Fixture");
  const otherContext = await browser.newContext({
    baseURL: "http://localhost:4174",
  });
  try {
    const opponent = await otherContext.newPage();
    const username = await signup(opponent, "Agreement Opponent Fixture");
    await page.goto("/agreements");
    await page
      .getByRole("button", { name: "New agreement", exact: true })
      .click();
    await page.getByLabel("Category", { exact: true }).selectOption("Singles");
    await choose(page, username);
    await page
      .getByRole("checkbox", { name: /I agree that covered completed matches/ })
      .check();
    let first = true;
    const requests: { key: string; payload: unknown }[] = [];
    await page.route("**/api/scopes", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push({
        key: route.request().headers()["idempotency-key"],
        payload: route.request().postDataJSON(),
      });
      if (!first) return route.continue();
      first = false;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Create agreement and accept for myself" })
      .click();
    await expect(page.getByRole("alert")).toContainText("interrupted");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page
      .getByRole("button", { name: "New agreement", exact: true })
      .click();
    await expect(page.getByLabel("Category", { exact: true })).toBeDisabled();
    await page
      .getByRole("checkbox", { name: /I agree that covered completed matches/ })
      .check();
    await page
      .getByRole("button", { name: "Retry this same agreement" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(
      (await (await page.request.get("/api/scopes")).json()).scopes,
    ).toHaveLength(1);
  } finally {
    await otherContext.close();
  }
});

test("exact-score approval keeps the review and all mutable actions frozen until its response returns", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await signup(page, "Held Approval Author Fixture");
  const otherContext = await browser.newContext({
    baseURL: "http://localhost:4174",
  });
  let release!: () => void;
  try {
    const opponent = await otherContext.newPage();
    await signup(opponent, "Held Approval Opponent Fixture");
    const author = await (await page.request.get("/api/me")).json();
    const other = await (await opponent.request.get("/api/me")).json();
    const submitted = await page.request.post("/api/results", {
      headers: {
        origin: "http://localhost:4174",
        "x-csrf-token": author.csrf,
        "idempotency-key": randomUUID(),
      },
      data: {
        unitId: randomUUID(),
        category: "Singles",
        format: "ONE_21",
        roster: [author.id, other.id],
        games: [[21, 17]],
        playedAt: new Date().toISOString(),
        scopeId: null,
        agree: true,
      },
    });
    expect(submitted.ok()).toBe(true);
    const id = (await submitted.json()).id;
    await opponent.goto("/?result=" + id);
    await opponent
      .getByRole("checkbox", { name: /These are the correct sides/ })
      .check();
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captured!: () => void;
    const started = new Promise<void>((resolve) => {
      captured = resolve;
    });
    await opponent.route("**/api/results/" + id + "/approve", async (route) => {
      captured();
      await gate;
      await route.continue();
    });
    await opponent
      .getByRole("button", { name: "Confirm this exact score" })
      .click();
    await started;
    await expect(
      opponent.getByRole("button", { name: "Close dialog" }),
    ).toHaveCount(0);
    await opponent.keyboard.press("Escape");
    await expect(opponent.getByRole("dialog")).toBeVisible();
    await expect(
      opponent.getByRole("checkbox", { name: /These are the correct sides/ }),
    ).toBeDisabled();
    await expect(
      opponent.getByRole("button", { name: "Correct the score" }),
    ).toBeDisabled();
    await expect(
      opponent
        .getByRole("dialog")
        .getByRole("button", { name: "Ask for review", exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      opponent.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
  } finally {
    release?.();
    await otherContext.close();
  }
});

test("closing immediately after an edit waits for its guarded draft save", async ({
  page,
}) => {
  await signup(page, "Close Flush Fixture");
  await record(page);
  await page.getByLabel("Your side", { exact: true }).fill("21");
  await page.getByLabel("Other side", { exact: true }).fill("17");
  await expect
    .poll(async () => (await stored(page))?.scores)
    .toEqual([["21", "17"]]);
  const original = await stored(page);
  await page.evaluate(async () => {
    const taskWindow = window as typeof window & {
      releaseDraftFixture?: () => void;
    };
    const key = Object.keys(localStorage).find((name) =>
      name.startsWith("shuttl:draft:"),
    )!;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    void navigator.locks.request(key, () => {
      started();
      return new Promise<void>((resolve) => {
        taskWindow.releaseDraftFixture = resolve;
      });
    });
    await ready;
  });
  try {
    await page.getByLabel("Other side", { exact: true }).fill("18");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(
      page.getByRole("dialog", { name: "Record a match", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close dialog" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Saving your draft…", exact: true }),
    ).toBeDisabled();
    await page.evaluate(() =>
      (
        window as typeof window & { releaseDraftFixture?: () => void }
      ).releaseDraftFixture?.(),
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await record(page);
    await expect(page.getByLabel("Other side", { exact: true })).toHaveValue(
      "18",
    );
    const latest = await stored(page);
    expect(latest.unitId).toBe(original.unitId);
    expect(latest.requestKey).toBe(original.requestKey);
    expect(latest.submissionUncertain).toBe(false);
  } finally {
    await page.evaluate(() =>
      (
        window as typeof window & { releaseDraftFixture?: () => void }
      ).releaseDraftFixture?.(),
    );
  }
});

test("browser Back keeps the latest queued draft write and its original identifiers", async ({
  page,
}) => {
  await signup(page, "Back Draft Fixture");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Home", exact: true }).last().click();
  await record(page);
  await page.getByLabel("Your side", { exact: true }).fill("21");
  await page.getByLabel("Other side", { exact: true }).fill("17");
  await expect
    .poll(async () => (await stored(page))?.scores)
    .toEqual([["21", "17"]]);
  const original = await stored(page);
  await page.evaluate(async () => {
    const taskWindow = window as typeof window & {
      releaseDraftFixture?: () => void;
    };
    const key = Object.keys(localStorage).find((name) =>
      name.startsWith("shuttl:draft:"),
    )!;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    void navigator.locks.request(key, () => {
      started();
      return new Promise<void>((resolve) => {
        taskWindow.releaseDraftFixture = resolve;
      });
    });
    await ready;
  });
  try {
    await page.getByLabel("Other side", { exact: true }).fill("18");
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() =>
      (
        window as typeof window & { releaseDraftFixture?: () => void }
      ).releaseDraftFixture?.(),
    );
    await expect
      .poll(async () => (await stored(page))?.scores)
      .toEqual([["21", "18"]]);
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await record(page);
    await expect(page.getByLabel("Other side", { exact: true })).toHaveValue(
      "18",
    );
    const latest = await stored(page);
    expect(latest.unitId).toBe(original.unitId);
    expect(latest.requestKey).toBe(original.requestKey);
  } finally {
    await page.evaluate(() =>
      (
        window as typeof window & { releaseDraftFixture?: () => void }
      ).releaseDraftFixture?.(),
    );
  }
});
