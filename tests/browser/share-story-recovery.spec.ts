import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { preferenceValues } from "../../src/preference-draft.ts";
import { Database } from "../../server/database.ts";

const origin = "http://localhost:4174";
async function fictionalAccount(context: BrowserContext, name: string) {
  const registered = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: {
      username: "story_" + randomUUID().slice(0, 8),
      name,
      password: "Story-recovery-fixture-2026!",
      adult: true,
      timezone: "UTC",
    },
  });
  expect(registered.status()).toBe(200);
  return (await context.request.get("/api/me")).json();
}
const headers = (me: any) => ({
  origin,
  "x-csrf-token": me.csrf,
  "idempotency-key": randomUUID(),
});

test("share story recovery retains selections, creates only on intent and recovers a committed snapshot after a real result is voided", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  const opponentContext = await browser.newContext({ baseURL: origin });
  let reviewerContext: BrowserContext | undefined;
  let release!: () => void;
  const heldRetry = new Promise<void>((resolve) => {
    release = resolve;
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const owner = await fictionalAccount(
      context,
      "Available Stories Owner Fixture",
    );
    const opponent = await fictionalAccount(
      opponentContext,
      "Available Stories Opponent Fixture",
    );
    const profile = await context.request.patch("/api/profile", {
      headers: headers(owner),
      data: {
        ...preferenceValues(owner),
        publicName: true,
        publicDistrict: true,
        country: "SG",
        city: "Singapore",
        district: "Stories Fixture Area",
      },
    });
    expect(profile.status()).toBe(200);
    const startingTime = Date.now() - 3600000;
    let latestResultId = "";
    for (let game = 0; game < 5; game++) {
      const recorded = await context.request.post("/api/results", {
        headers: headers(owner),
        data: {
          unitId: randomUUID(),
          category: "Singles",
          format: "ONE_21",
          roster: [owner.id, opponent.id],
          games: [[21, 17]],
          playedAt: new Date(startingTime + game * 120000).toISOString(),
          scopeId: null,
          agree: true,
        },
      });
      expect(recorded.status()).toBe(200);
      const id = (await recorded.json()).id;
      latestResultId = id;
      const proposed = await (
        await opponentContext.request.get("/api/results/" + id)
      ).json();
      const approved = await opponentContext.request.post(
        "/api/results/" + id + "/approve",
        {
          headers: headers(opponent),
          data: { revisionId: proposed.revisionId, agree: true },
        },
      );
      expect(approved.status()).toBe(200);
      await expect
        .poll(
          async () =>
            (await (await context.request.get("/api/results/" + id)).json())
              .status,
          { timeout: 30000 },
        )
        .toBe("rated");
    }
    let reads = 0;
    let failLaterStories = false;
    let started!: () => void;
    const retryStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route("**/api/milestones?category=Singles", async (route) => {
      reads++;
      if (reads === 1 || failLaterStories) {
        await route.fulfill({
          status: 503,
          json: { error: "Fixture stories are temporarily unavailable." },
        });
      } else {
        const response = await route.fetch();
        started();
        await heldRetry;
        await route.fulfill({ response });
      }
    });
    let sharePosts = 0;
    let submitted: any;
    let loseCommittedShare = true;
    let receivedShare: any;
    const shareKeys: string[] = [];
    await page.route("**/api/shares", async (route) => {
      if (route.request().method() === "POST") {
        sharePosts++;
        submitted = route.request().postDataJSON();
        shareKeys.push(route.request().headers()["idempotency-key"]);
        if (loseCommittedShare) {
          loseCommittedShare = false;
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          receivedShare = await response.json();
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });
    await page.goto("/home");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "A number worth earning",
      exact: true,
    });
    await expect(dialog.getByRole("alert")).toContainText(
      "Fixture stories are temporarily unavailable.",
    );
    await expect(
      dialog.locator('#share-template option[value="best"]'),
    ).toBeDisabled();
    await dialog.getByLabel("Include my public name").check();
    await dialog.getByLabel("Include my declared district").check();
    await dialog
      .getByLabel("Image shape", { exact: true })
      .selectOption("feed");
    await dialog
      .getByRole("button", { name: "Retry available stories", exact: true })
      .click();
    await retryStarted;
    await expect(
      dialog.getByText("Checking your available stories…", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", {
        name: "Retry available stories",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("Include my public name")).toBeChecked();
    await expect(
      dialog.getByLabel("Include my declared district"),
    ).toBeChecked();
    await expect(dialog.getByLabel("Image shape", { exact: true })).toHaveValue(
      "feed",
    );
    await expect(dialog.getByLabel("Your story", { exact: true })).toHaveValue(
      "passport",
    );
    expect(sharePosts).toBe(0);
    expect(reads).toBe(2);
    release();
    await expect(
      dialog.getByText("Checking your available stories…", { exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", {
        name: "Retry available stories",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(
      dialog.locator('#share-template option[value="best"]'),
    ).toBeEnabled();
    await expect(dialog.getByLabel("Your story", { exact: true })).toHaveValue(
      "passport",
    );
    await expect(dialog.getByLabel("Include my public name")).toBeChecked();
    await expect(
      dialog.getByLabel("Include my declared district"),
    ).toBeChecked();
    await expect(dialog.getByLabel("Image shape", { exact: true })).toHaveValue(
      "feed",
    );
    expect(sharePosts).toBe(0);
    await dialog.getByLabel("Your story", { exact: true }).selectOption("best");
    await expect(dialog.locator(".passport-evidence-line")).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Create a shareable link", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Recover this snapshot link",
        exact: true,
      }),
    ).toBeVisible();
    expect(sharePosts).toBe(1);
    expect(submitted).toEqual({
      category: "Singles",
      includeName: true,
      includeDistrict: true,
      template: "best",
    });
    const savedBeforeRecovery = await (
      await context.request.get("/api/my-shares")
    ).json();
    expect(savedBeforeRecovery.shares).toHaveLength(1);

    // A normal independent review of one disposable fixture result reduces
    // the actual published category count to four. No rating is overwritten.
    reviewerContext = await browser.newContext({ baseURL: origin });
    const reviewer = await fictionalAccount(
      reviewerContext,
      "Available Stories Independent Reviewer Fixture",
    );
    const fixtureDb = new Database("data/browser-tests.sqlite");
    try {
      fixtureDb.run("UPDATE users SET role='reviewer' WHERE id=?", reviewer.id);
    } finally {
      fixtureDb.close();
    }
    const exact = await (
      await context.request.get("/api/results/" + latestResultId)
    ).json();
    const disputed = await context.request.post(
      "/api/results/" + latestResultId + "/dispute",
      {
        headers: headers(owner),
        data: {
          revisionId: exact.revisionId,
          reason: "Synthetic fixture review for captured snapshot continuity.",
        },
      },
    );
    expect(disputed.status()).toBe(200);
    const desk = await (
      await reviewerContext.request.get("/api/reviewer")
    ).json();
    const review = desk.reviews.find((r: any) => r.unit_id === latestResultId);
    expect(review).toBeTruthy();
    const decision = await reviewerContext.request.post(
      "/api/reviewer/" + review.id,
      {
        headers: headers(reviewer),
        data: {
          decision: "void",
          reason:
            "Independent synthetic fixture decision excludes this result.",
        },
      },
    );
    expect(decision.status()).toBe(200);
    await expect
      .poll(
        async () =>
          (await (await context.request.get("/api/me")).json()).ratings.find(
            (r: any) => r.category === "Singles",
          ).score,
        { timeout: 30000 },
      )
      .toBeNull();
    failLaterStories = true;
    await page.reload();
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Fixture stories are temporarily unavailable.",
    );
    await expect(dialog.getByLabel("Your story", { exact: true })).toHaveValue(
      "best",
    );
    await expect(
      dialog.getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("Include my public name")).toBeChecked();
    await expect(
      dialog.getByLabel("Include my declared district"),
    ).toBeChecked();
    await expect(dialog.getByLabel("Image shape", { exact: true })).toHaveValue(
      "feed",
    );
    await expect(dialog.locator(".rating-passport")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", {
        name: "Retry available stories",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Recover this snapshot link", exact: true })
      .click();
    await expect(
      dialog.getByLabel("Your public snapshot link", { exact: true }),
    ).toHaveValue(origin + receivedShare.path);
    expect(sharePosts).toBe(2);
    expect(shareKeys[1]).toBe(shareKeys[0]);
    await expect(dialog.locator(".rating-passport .rating-number")).toHaveText(
      receivedShare.payload.score.toLocaleString("en-SG"),
    );
    const download = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download my rating snapshot", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe(
      "shuttl-singles-feed.png",
    );
    expect(sharePosts).toBe(2);
    const saved = await (await context.request.get("/api/my-shares")).json();
    expect(saved.shares).toHaveLength(1);
    expect(saved.shares[0]).toMatchObject({
      category: "Singles",
      template: "best",
      name: owner.name,
      district: "Stories Fixture Area",
    });
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Fixture stories are temporarily unavailable.",
    );
    await expect(
      dialog.locator('#share-template option[value="best"]'),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", {
        name: "Create a shareable link",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", {
        name: "Download my rating snapshot",
        exact: true,
      }),
    ).toBeDisabled();
    expect(sharePosts).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    release();
    await reviewerContext?.close();
    await opponentContext.close();
  }
});
