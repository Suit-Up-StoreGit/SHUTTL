import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:4174";
const password = "Guest-persona-fixture-2026!";

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);
});

async function closeRecipientContext(
  context: BrowserContext,
  testInfo: TestInfo,
  primaryError: unknown,
) {
  try {
    await context.close();
  } catch (cleanupError) {
    const detail = String(cleanupError);
    const disposedByTimeout =
      testInfo.status === "timedOut" &&
      context.pages().every((page) => page.isClosed()) &&
      /Target closed|Target page, context or browser has been closed|Browser has been closed/i.test(
        detail,
      );
    if (disposedByTimeout) {
      testInfo.annotations.push({
        type: "cleanup",
        description:
          "Playwright already disposed the recipient context after the test timeout.",
      });
    } else if (primaryError instanceof Error) {
      // Keep the original action's stack; record a genuine second failure too.
      primaryError.message +=
        "\nRecipient-context cleanup also failed: " + detail;
      testInfo.annotations.push({
        type: "cleanup-failure",
        description: detail,
      });
    } else if (primaryError) {
      throw new AggregateError(
        [primaryError, cleanupError],
        "The guest journey and recipient-context cleanup both failed.",
      );
    } else {
      throw cleanupError;
    }
  }
}

async function registerCurrentPage(page: Page, name: string) {
  const username = "gp_" + randomUUID().slice(0, 8);
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  return username;
}

async function signup(page: Page, name: string) {
  await page.goto("/");
  const username = await registerCurrentPage(page, name);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your game.",
  );
  return username;
}

async function recordInvitedOpponent(page: Page, nickname: string) {
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await page
    .getByRole("button", { name: /Record a match|Continue your draft/ })
    .click();
  await page
    .getByRole("button", { name: "Choose player", exact: true })
    .click();
  const lookup = page.getByRole("dialog", {
    name: "Find a player",
    exact: true,
  });
  await lookup.getByLabel("Invited player’s nickname").fill(nickname);
  await lookup
    .getByRole("button", { name: "Create a private invitation", exact: true })
    .click();
  const link = await lookup.getByLabel("Private invitation link").inputValue();
  expect(new URL(link).pathname).toMatch(/^\/claim\/[A-Za-z0-9_-]+$/);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (
            window as typeof window & { guestCopyFixture?: string }
          ).guestCopyFixture = value;
        },
      },
    }),
  );
  await lookup.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(
    lookup.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { guestCopyFixture?: string })
          .guestCopyFixture,
    ),
  ).toBe(link);
  await lookup
    .getByRole("button", { name: "Use this player", exact: true })
    .click();
  const result = page.getByRole("dialog", {
    name: "Record a match",
    exact: true,
  });
  await expect(
    result.locator(".picked-player").filter({ hasText: nickname }),
  ).toContainText("Private invitation");
  await result.getByLabel("Your side", { exact: true }).fill("21");
  await result.getByLabel("Other side", { exact: true }).fill("17");
  await result
    .getByRole("checkbox", { name: /I confirm these sides and scores/ })
    .check();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/results") &&
      response.request().method() === "POST",
  );
  await result
    .getByRole("button", { name: "Send for exact-score approval", exact: true })
    .click();
  const response = await submitted;
  expect(response.ok()).toBe(true);
  const payload = response.request().postDataJSON();
  expect(payload.category).toBe("Singles");
  expect(payload.roster).toHaveLength(2);
  expect(new Set(payload.roster).size).toBe(2);
  await expect(result).toHaveCount(0);
  const recorded = await (
    await page.request.get("/api/results/" + payload.unitId)
  ).json();
  expect(recorded.retrospective).toBe(true);
  expect(recorded.status).toBe("pending");
  expect(recorded.approvals).toHaveLength(1);
  return { link, id: payload.unitId as string };
}

test("an invited player registers through the retained private link, is verified separately, and approves the exact result into history", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  await signup(page, "Guest Invitation Author Fixture");
  const { link, id } = await recordInvitedOpponent(page, "Guest Rally Fixture");
  const recipientContext = await browser.newContext({ baseURL: origin });
  recipientContext.setDefaultTimeout(20000);
  recipientContext.setDefaultNavigationTimeout(20000);
  let primaryError: unknown;
  try {
    const recipient = await recipientContext.newPage();
    let readFailed = false,
      requestFailed = false;
    await recipient.route("**/api/claims/**", async (route) => {
      if (route.request().method() === "GET" && !readFailed) {
        readFailed = true;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Fixture invitation loading temporarily unavailable.",
          }),
        });
      }
      if (route.request().method() === "POST" && !requestFailed) {
        requestFailed = true;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Fixture identity request temporarily unavailable.",
          }),
        });
      }
      return route.continue();
    });
    await recipient.goto(link);
    await expect(recipient.getByRole("heading", { level: 1 })).toHaveText(
      "We couldn’t open this link.",
    );
    await recipient
      .getByRole("button", { name: "Retry this link", exact: true })
      .click();
    await expect(recipient.getByRole("heading", { level: 1 })).toContainText(
      "invited you.",
    );
    await expect(
      recipient.getByText("Guest Rally Fixture", { exact: true }),
    ).toBeVisible();
    await expect(recipient.locator(".score-games")).toContainText("21");
    await expect(recipient.locator(".score-games")).toContainText("17");
    await recipient
      .getByRole("button", {
        name: "Sign in and keep this exact invitation",
        exact: true,
      })
      .click();
    await expect(
      recipient.getByText(/Your private player invitation stays with you/),
    ).toBeVisible();
    await registerCurrentPage(recipient, "Guest Recipient Fixture");
    expect(new URL(recipient.url()).pathname).toBe(new URL(link).pathname);
    await recipient
      .getByRole("button", { name: "This invitation is for me", exact: true })
      .click();
    await expect(recipient.getByRole("alert")).toContainText(
      "Fixture identity request temporarily unavailable.",
    );
    await recipient
      .getByRole("button", { name: "This invitation is for me", exact: true })
      .click();
    await expect(
      recipient.getByText("Waiting for the inviter’s identity check", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(recipient.getByRole("alert")).toHaveCount(0);
    expect(
      (await (await recipient.request.get("/api/results")).json()).results,
    ).toHaveLength(0);
    await page.goto("/inbox");
    const claim = page.locator(".notice").filter({
      has: page.getByRole("button", {
        name: "I know this player",
        exact: true,
      }),
    });
    await expect(claim).toContainText("wants to claim Guest Rally Fixture");
    await claim
      .getByRole("button", { name: "I know this player", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Identity verified. The player still approves each exact result.",
      }),
    ).toBeVisible();
    const beforeApproval = await (
      await recipient.request.get("/api/results/" + id)
    ).json();
    expect(beforeApproval.status).toBe("pending");
    expect(beforeApproval.approvals).toHaveLength(1);
    expect(
      (
        await (await recipient.request.get("/api/dashboard")).json()
      ).me.ratings.find((rating: any) => rating.category === "Singles").count,
    ).toBe(0);
    await recipient
      .getByRole("link", { name: "Go to my inbox", exact: true })
      .click();
    await recipient
      .getByRole("button", { name: "Open this exact result", exact: true })
      .click();
    await expect(
      recipient.getByRole("dialog", {
        name: "Review the exact result",
        exact: true,
      }),
    ).toBeVisible();
    const review = recipient.getByRole("dialog");
    await expect(review.locator(".score-games")).toContainText("21");
    await expect(review.locator(".score-games")).toContainText("17");
    await review
      .getByRole("checkbox", {
        name: /These are the correct sides and scores/,
      })
      .check();
    await review
      .getByRole("button", { name: "Confirm this exact score", exact: true })
      .click();
    await expect(
      review.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await review
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await recipient
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await expect(
      recipient.locator(".profile-rating-line").filter({ hasText: "Singles" }),
    ).toContainText("1 confirmed result");
    await recipient
      .getByRole("button", { name: "History", exact: true })
      .click();
    await recipient
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    await expect(recipient.locator(".result-card")).toHaveCount(1);
    await expect(recipient.locator(".result-card")).toContainText(
      "Rating published",
    );
    await expect(recipient.locator(".result-card")).toContainText("21–17");
    expect(
      (await (await recipient.request.get("/api/results")).json()).results,
    ).toHaveLength(1);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeRecipientContext(recipientContext, testInfo, primaryError);
  }
});

test("a guest invitation with a lost committed response retains its nickname, original player and claim link across lookup reopening", async ({
  page,
}) => {
  test.setTimeout(90000);
  await signup(page, "Guest Retry Author Fixture");
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await page.getByRole("button", { name: /Record a match/ }).click();
  await page
    .getByRole("button", { name: "Choose player", exact: true })
    .click();
  const lookup = page.getByRole("dialog", {
    name: "Find a player",
    exact: true,
  });
  const attempts: { key: string; name: string }[] = [];
  let original: any;
  await page.route("**/api/guests", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push({
      key: route.request().headers()["idempotency-key"],
      name: route.request().postDataJSON().name,
    });
    if (original) return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    original = await response.json();
    await route.abort("failed");
  });
  await lookup
    .getByLabel("Invited player’s nickname")
    .fill("Retry Guest Fixture");
  await lookup
    .getByRole("button", { name: "Create a private invitation", exact: true })
    .click();
  await expect(lookup.getByRole("alert")).toContainText("It may already exist");
  await expect(lookup.getByLabel("Invited player’s nickname")).toBeDisabled();
  await lookup
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Record a match", exact: true })
    .getByRole("button", { name: "Choose player", exact: true })
    .click();
  await expect(lookup.getByLabel("Invited player’s nickname")).toHaveValue(
    "Retry Guest Fixture",
  );
  await expect(lookup.getByLabel("Invited player’s nickname")).toBeDisabled();
  const recovered = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/guests") &&
      response.request().method() === "POST",
  );
  await lookup
    .getByRole("button", { name: "Retry this same invitation", exact: true })
    .click();
  const response = await recovered;
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual(original);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  const originalLink = origin + original.invitePath;
  await expect(lookup.getByLabel("Private invitation link")).toHaveValue(
    originalLink,
  );
  await lookup
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Record a match", exact: true })
    .getByRole("button", { name: "Choose player", exact: true })
    .click();
  await expect(lookup.getByLabel("Private invitation link")).toHaveValue(
    originalLink,
  );
  expect(attempts).toHaveLength(2);
  await lookup
    .getByRole("button", { name: "Create another invitation", exact: true })
    .click();
  await expect(lookup.getByLabel("Invited player’s nickname")).toBeEnabled();
  await expect(lookup.getByLabel("Invited player’s nickname")).toHaveValue("");
  await lookup
    .getByLabel("Invited player’s nickname")
    .fill("Separate Guest Fixture");
  const created = page.waitForResponse(
    (next) =>
      next.url().endsWith("/api/guests") && next.request().method() === "POST",
  );
  await lookup
    .getByRole("button", { name: "Create a private invitation", exact: true })
    .click();
  const separate = await (await created).json();
  expect(separate.player.id).not.toBe(original.player.id);
  expect(separate.invitePath).not.toBe(original.invitePath);
  expect(attempts[2].key).not.toBe(attempts[0].key);
  const originalToken = new URL(originalLink).pathname.split("/").pop();
  expect(
    (await (await page.request.get("/api/claims/" + originalToken)).json())
      .state,
  ).toBe("invited");
  await lookup
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const result = page.getByRole("dialog", {
    name: "Record a match",
    exact: true,
  });
  await result.getByLabel("Category", { exact: true }).selectOption("Doubles");
  await result
    .getByRole("button", { name: "Choose player", exact: true })
    .first()
    .click();
  await expect(lookup.getByLabel("Private invitation link")).toHaveValue(
    origin + separate.invitePath,
  );
  await lookup
    .getByRole("button", { name: "Use this player", exact: true })
    .click();
  await result
    .getByRole("button", { name: "Choose player", exact: true })
    .first()
    .click();
  await expect(
    lookup.getByRole("button", { name: "Use this player", exact: true }),
  ).toBeDisabled();
  await expect(
    lookup.getByText(
      "This invited player is already selected in this lineup.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("an existing player keeps a guest invitation through sign-in and wrong-person rejection grants no result access or rating", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  await test.step(
    "Register the inviter",
    () => signup(page, "Wrong Guest Author Fixture"),
    { timeout: 30000 },
  );
  const { link, id } = await test.step(
    "Create a private guest identity and submit its exact result",
    () => recordInvitedOpponent(page, "Different Guest Fixture"),
    { timeout: 30000 },
  );
  const recipientContext = await browser.newContext({ baseURL: origin });
  recipientContext.setDefaultTimeout(20000);
  recipientContext.setDefaultNavigationTimeout(20000);
  let primaryError: unknown;
  try {
    const recipient = await recipientContext.newPage();
    const username = await test.step(
      "Register the existing recipient identity",
      () => signup(recipient, "Wrong Guest Claimant Fixture"),
      { timeout: 30000 },
    );
    await test.step(
      "Finish signing out before opening the private invitation",
      async () => {
        await recipient
          .getByRole("button", { name: "Profile", exact: true })
          .last()
          .click();
        await recipient
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        const [signedOut] = await Promise.all([
          recipient.waitForResponse(
            (response) =>
              response.url().endsWith("/api/logout") &&
              response.request().method() === "POST",
            { timeout: 20000 },
          ),
          recipient
            .getByRole("button", { name: "Sign out", exact: true })
            .last()
            .click(),
        ]);
        expect(signedOut.status()).toBe(200);
        await expect(recipient.locator(".auth-shell")).toBeVisible();
        await expect(
          recipient.getByRole("button", {
            name: "Create my player identity",
            exact: true,
          }),
        ).toBeVisible();
      },
      { timeout: 30000 },
    );
    const token = new URL(link).pathname.split("/").pop();
    await test.step(
      "Declining the invitation leaves its identity unclaimed",
      async () => {
        await recipient.goto(link);
        await recipient
          .getByRole("link", {
            name: "This invitation is not for me",
            exact: true,
          })
          .click();
        expect(new URL(recipient.url()).pathname).toBe("/home");
        expect(
          (
            await (
              await recipient.request.get("/api/claims/" + token, {
                timeout: 20000,
              })
            ).json()
          ).state,
        ).toBe("invited");
      },
      { timeout: 30000 },
    );
    await test.step(
      "Sign in to the existing identity while retaining the private link",
      async () => {
        await recipient.goto(link);
        await recipient
          .getByRole("button", {
            name: "Sign in and keep this exact invitation",
            exact: true,
          })
          .click();
        await recipient
          .getByRole("button", { name: "Sign in", exact: true })
          .first()
          .click();
        await recipient.getByLabel("Username", { exact: true }).fill(username);
        await recipient.getByLabel("Password", { exact: true }).fill(password);
        await recipient
          .getByRole("button", { name: "Sign in", exact: true })
          .last()
          .click();
        await expect(
          recipient.getByRole("button", {
            name: "This invitation is for me",
            exact: true,
          }),
        ).toBeVisible();
      },
      { timeout: 30000 },
    );
    await test.step(
      "Request the inviter’s separate identity verification",
      async () => {
        const [requested] = await Promise.all([
          recipient.waitForResponse(
            (response) =>
              response.url().endsWith("/api/claims/" + token + "/request") &&
              response.request().method() === "POST",
            { timeout: 20000 },
          ),
          recipient
            .getByRole("button", {
              name: "This invitation is for me",
              exact: true,
            })
            .click(),
        ]);
        expect(requested.status()).toBe(200);
        expect(new URL(recipient.url()).pathname).toBe(new URL(link).pathname);
        await expect(
          recipient.getByText("Waiting for the inviter’s identity check", {
            exact: true,
          }),
        ).toBeVisible();
      },
      { timeout: 30000 },
    );
    await test.step(
      "The inviter rejects the wrong person without approving the score",
      async () => {
        await page.goto("/inbox");
        const claim = page.locator(".notice").filter({
          has: page.getByRole("button", {
            name: "Wrong person",
            exact: true,
          }),
        });
        await expect(claim).toContainText(
          "wants to claim Different Guest Fixture",
        );
        const [rejected] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.url().includes("/api/guest-claims/") &&
              response.url().endsWith("/verify") &&
              response.request().method() === "POST",
            { timeout: 20000 },
          ),
          claim
            .getByRole("button", { name: "Wrong person", exact: true })
            .click(),
        ]);
        expect(rejected.status()).toBe(200);
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: "The identity claim was rejected." }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Wrong person", exact: true }),
        ).toHaveCount(0);
      },
      { timeout: 30000 },
    );
    await test.step(
      "The rejected recipient receives the decision and has no score or rating access",
      async () => {
        await recipient
          .getByRole("link", { name: "Go to my inbox", exact: true })
          .click();
        await expect(
          recipient.getByText("No result needs chasing", { exact: true }),
        ).toBeVisible();
        await expect(
          recipient.getByText("Your identity could not be verified", {
            exact: true,
          }),
        ).toBeVisible();
        expect(
          (
            await (
              await recipient.request.get("/api/results", { timeout: 20000 })
            ).json()
          ).results,
        ).toHaveLength(0);
        expect(
          (
            await recipient.request.get("/api/results/" + id, {
              timeout: 20000,
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await (
              await recipient.request.get("/api/claims/" + token, {
                timeout: 20000,
              })
            ).json()
          ).state,
        ).toBe("invited");
        expect(
          (
            await (
              await recipient.request.get("/api/dashboard", { timeout: 20000 })
            ).json()
          ).me.ratings.find((rating: any) => rating.category === "Singles")
            .count,
        ).toBe(0);
        const untouched = await (
          await page.request.get("/api/results/" + id, { timeout: 20000 })
        ).json();
        expect(untouched.status).toBe("pending");
        expect(untouched.approvals).toHaveLength(1);
      },
      { timeout: 30000 },
    );
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeRecipientContext(recipientContext, testInfo, primaryError);
  }
});
