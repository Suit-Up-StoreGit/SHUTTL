import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:4174";
const password = "Boundary-fixture-password-2026!";

async function signup(page: Page, name: string) {
  const username = "boundary_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page
    .getByRole("button", { name: "Create my player identity", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page
    .getByRole("button", { name: "Continue to my court", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your game.",
  );
  return username;
}

async function fillResult(page: Page, opponent: string, score = "17") {
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await page
    .getByRole("button", { name: /Record a match|Continue your draft/ })
    .click();
  await page
    .getByRole("button", { name: "Choose player", exact: true })
    .click();
  await page.getByLabel("Username or public display name").fill(opponent);
  await page.getByRole("button", { name: new RegExp("@" + opponent) }).click();
  await page.getByLabel("Your side", { exact: true }).fill("21");
  await page.getByLabel("Other side", { exact: true }).fill(score);
  await page
    .getByRole("checkbox", { name: /I confirm these sides and scores/ })
    .check();
}

test("a shared-context account change closes the previous identity’s modal and an old completion cannot close the new user’s result", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  const usernameA = await signup(page, "Boundary Alpha Fixture");
  const actorA = await (await page.request.get("/api/me")).json();
  const fixtureContext = await browser.newContext({ baseURL: origin });
  let releaseA!: () => void, releaseB!: () => void;
  const gateA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const gateB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  try {
    const usernameB = "boundary_b_" + randomUUID().slice(0, 8);
    const registered = await fixtureContext.request.post("/api/auth/register", {
      headers: { origin },
      data: {
        username: usernameB,
        name: "Boundary Beta Fixture",
        password,
        adult: true,
        timezone: "UTC",
      },
    });
    expect(registered.ok()).toBe(true);
    const actorB = (await registered.json()).user;
    let capturedA!: () => void, capturedB!: () => void;
    const startedA = new Promise<void>((resolve) => {
      capturedA = resolve;
    });
    const startedB = new Promise<void>((resolve) => {
      capturedB = resolve;
    });
    let payloadA: any, payloadB: any;
    await page.route("**/api/results", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const payload = route.request().postDataJSON();
      if (payload.roster[0] === actorA.id) {
        payloadA = payload;
        capturedA();
        await gateA;
        return route.fulfill({
          response,
          headers: { ...response.headers(), "x-boundary-fixture": "old-a" },
        });
      }
      expect(payload.roster[0]).toBe(actorB.id);
      payloadB = payload;
      capturedB();
      await gateB;
      return route.fulfill({ response });
    });
    await fillResult(page, usernameB);
    await page
      .getByRole("button", {
        name: "Send for exact-score approval",
        exact: true,
      })
      .click();
    await startedA;
    const draftA = await page.evaluate(
      (owner) => JSON.parse(localStorage.getItem("shuttl:draft:" + owner)!),
      actorA.id,
    );
    expect(draftA.unitId).toBe(payloadA.unitId);
    expect(draftA.submissionUncertain).toBe(true);

    const second = await context.newPage();
    await second.goto("/profile?tab=settings");
    await second
      .getByRole("button", { name: "Sign out", exact: true })
      .last()
      .click();
    await expect(
      second.getByRole("button", {
        name: "Create my player identity",
        exact: true,
      }),
    ).toBeVisible();
    await second
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .click();
    await second.getByLabel("Username", { exact: true }).fill(usernameB);
    await second.getByLabel("Password", { exact: true }).fill(password);
    await second
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await expect(second.getByRole("heading", { level: 1 })).toContainText(
      "Your game.",
    );
    expect((await (await second.request.get("/api/me")).json()).id).toBe(
      actorB.id,
    );

    await page.bringToFront();
    // Trigger the application's actual return-to-tab listener deterministically
    // in headless browsers, where OS focus timing is not reliable.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("dialog", { name: "Record a match", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your game.",
    );
    expect(
      (
        await page.evaluate(
          (owner) => JSON.parse(localStorage.getItem("shuttl:draft:" + owner)!),
          actorA.id,
        )
      ).unitId,
    ).toBe(payloadA.unitId);
    await fillResult(page, usernameA, "16");
    const bDialog = page.getByRole("dialog", {
      name: "Record a match",
      exact: true,
    });
    await expect(bDialog.locator(".roster-self")).toContainText(
      "Boundary Beta Fixture",
    );
    await expect(bDialog.locator(".roster-self")).not.toContainText(
      "Boundary Alpha Fixture",
    );
    // Give this separate fictional match a distinct exact start, even when the
    // fast authentication fixture finishes within the same clock second.
    const startedBLocal = await page.evaluate((playedAt) => {
      const date = new Date(Date.parse(playedAt) - 2000);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 19)
        .replace(/:00$/, "");
    }, payloadA.playedAt);
    await bDialog.getByLabel("Started at", { exact: true }).fill(startedBLocal);
    await bDialog
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await bDialog
      .getByRole("button", {
        name: "Send for exact-score approval",
        exact: true,
      })
      .click();
    await startedB;
    expect(payloadB.roster[0]).toBe(actorB.id);
    expect(payloadB.roster[1]).toBe(actorA.id);

    const oldReturned = page.waitForResponse(
      (response) => response.headers()["x-boundary-fixture"] === "old-a",
    );
    releaseA();
    await (await oldReturned).finished();
    // Drain the resolved old action and React's next paint before checking that
    // it did not apply its modal dismissal or completion toast to user B.
    await expect
      .poll(async () =>
        page.evaluate(
          (owner) => localStorage.getItem("shuttl:draft:" + owner),
          actorA.id,
        ),
      )
      .toBeNull();
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    await expect(bDialog).toBeVisible();
    await expect(bDialog.getByLabel("Other side", { exact: true })).toHaveValue(
      "16",
    );
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Exact result submitted. Your rating stays unchanged until valid approvals.",
      }),
    ).toHaveCount(0);
    const draftB = await page.evaluate(
      (owner) => JSON.parse(localStorage.getItem("shuttl:draft:" + owner)!),
      actorB.id,
    );
    expect(draftB.unitId).toBe(payloadB.unitId);
    expect(draftB.scores).toEqual([["21", "16"]]);
    releaseB();
    await expect(bDialog).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Exact result submitted. Your rating stays unchanged until valid approvals.",
      }),
    ).toBeVisible();
    expect(
      (await page.request.get("/api/results/" + payloadB.unitId)).status(),
    ).toBe(200);
  } finally {
    releaseA();
    releaseB();
    await fixtureContext.close();
  }
});

test("replacing a login session for the same player refreshes CSRF and protects a retry from the old completion", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  const username = await signup(page, "Same Session Boundary Fixture");
  const originalIdentity = await (await page.request.get("/api/me")).json();
  const fixtureContext = await browser.newContext({ baseURL: origin });
  let releaseOriginal!: () => void, releaseRetry!: () => void;
  const originalGate = new Promise<void>((resolve) => {
    releaseOriginal = resolve;
  });
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  try {
    const opponentUsername = "boundary_o_" + randomUUID().slice(0, 8);
    const registration = await fixtureContext.request.post(
      "/api/auth/register",
      {
        headers: { origin },
        data: {
          username: opponentUsername,
          name: "Same Session Opponent Fixture",
          password,
          adult: true,
          timezone: "UTC",
        },
      },
    );
    expect(registration.ok()).toBe(true);
    let firstCaptured!: () => void, retryCaptured!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      firstCaptured = resolve;
    });
    const retryStarted = new Promise<void>((resolve) => {
      retryCaptured = resolve;
    });
    const requests: { csrf: string; key: string; payload: any }[] = [];
    await page.route("**/api/results", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const ordinal = requests.length;
      requests.push({
        csrf: route.request().headers()["x-csrf-token"],
        key: route.request().headers()["idempotency-key"],
        payload: route.request().postDataJSON(),
      });
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      if (ordinal === 0) {
        firstCaptured();
        await originalGate;
        return route.fulfill({
          response,
          headers: {
            ...response.headers(),
            "x-boundary-fixture": "old-same-player",
          },
        });
      }
      expect(ordinal).toBe(1);
      retryCaptured();
      await retryGate;
      return route.fulfill({ response });
    });
    await fillResult(page, opponentUsername);
    await page
      .getByRole("button", {
        name: "Send for exact-score approval",
        exact: true,
      })
      .click();
    await firstStarted;
    expect(requests[0].csrf).toBe(originalIdentity.csrf);
    const originalDraft = await page.evaluate(
      (owner) => JSON.parse(localStorage.getItem("shuttl:draft:" + owner)!),
      originalIdentity.id,
    );
    expect(originalDraft.submissionUncertain).toBe(true);

    const second = await context.newPage();
    await second.goto("/profile?tab=settings");
    await second
      .getByRole("button", { name: "Sign out", exact: true })
      .last()
      .click();
    await expect(
      second.getByRole("button", {
        name: "Create my player identity",
        exact: true,
      }),
    ).toBeVisible();
    await second
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .click();
    await second.getByLabel("Username", { exact: true }).fill(username);
    await second.getByLabel("Password", { exact: true }).fill(password);
    await second
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await expect(second.getByRole("heading", { level: 1 })).toContainText(
      "Your game.",
    );
    const replacementIdentity = await (
      await second.request.get("/api/me")
    ).json();
    expect(replacementIdentity.id).toBe(originalIdentity.id);
    expect(replacementIdentity.csrf).not.toBe(originalIdentity.csrf);

    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("dialog", { name: "Record a match", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your game.",
    );
    const retainedDraft = await page.evaluate(
      (owner) => JSON.parse(localStorage.getItem("shuttl:draft:" + owner)!),
      originalIdentity.id,
    );
    expect(retainedDraft.unitId).toBe(originalDraft.unitId);
    expect(retainedDraft.requestKey).toBe(originalDraft.requestKey);
    expect(retainedDraft.scores).toEqual(originalDraft.scores);
    expect(retainedDraft.submissionUncertain).toBe(true);
    await page
      .getByRole("button", { name: "Continue your draft", exact: true })
      .click();
    const retryDialog = page.getByRole("dialog", {
      name: "Record a match",
      exact: true,
    });
    await expect(
      retryDialog.getByLabel("Other side", { exact: true }),
    ).toBeDisabled();
    await expect(
      retryDialog.getByLabel("Other side", { exact: true }),
    ).toHaveValue("17");
    await retryDialog
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await retryDialog
      .getByRole("button", {
        name: "Send for exact-score approval",
        exact: true,
      })
      .click();
    await retryStarted;
    expect(requests[1].csrf).toBe(replacementIdentity.csrf);
    expect(requests[1].csrf).not.toBe(requests[0].csrf);
    expect(requests[1].key).toBe(requests[0].key);
    expect(requests[1].payload).toEqual(requests[0].payload);
    expect(
      (await (await page.request.get("/api/results")).json()).results,
    ).toHaveLength(1);

    const originalReturned = page.waitForResponse(
      (response) =>
        response.headers()["x-boundary-fixture"] === "old-same-player",
    );
    releaseOriginal();
    await (await originalReturned).finished();
    await expect
      .poll(async () =>
        page.evaluate(
          (owner) => localStorage.getItem("shuttl:draft:" + owner),
          originalIdentity.id,
        ),
      )
      .toBeNull();
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    await expect(retryDialog).toBeVisible();
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Exact result submitted. Your rating stays unchanged until valid approvals.",
      }),
    ).toHaveCount(0);
    releaseRetry();
    await expect(retryDialog).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Exact result submitted. Your rating stays unchanged until valid approvals.",
      }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/results")).json()).results,
    ).toHaveLength(1);
  } finally {
    releaseOriginal();
    releaseRetry();
    await fixtureContext.close();
  }
});

test("a dashboard identity that fails fresh identity verification is never activated and loading can be retried", async ({
  page,
}) => {
  const username = await signup(page, "Identity Verification Fixture");
  const actual = await (await page.request.get("/api/me")).json();
  let first = true;
  await page.route("**/api/dashboard", async (route) => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.me.id = randomUUID();
    snapshot.me.name = "Mismatched Identity Fixture";
    await route.fulfill({ response, json: snapshot });
  });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "We couldn’t load your court.",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Your account changed again",
  );
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(
    page.getByText("Mismatched Identity Fixture", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry loading my court", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your game.",
  );
  expect((await (await page.request.get("/api/me")).json()).id).toBe(actual.id);
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await page
    .getByRole("button", { name: /Record a match|Continue your draft/ })
    .click();
  await expect(page.getByRole("dialog").locator(".roster-self")).toContainText(
    "Identity Verification Fixture",
  );
  expect((await (await page.request.get("/api/me")).json()).username).toBe(
    username,
  );
});
