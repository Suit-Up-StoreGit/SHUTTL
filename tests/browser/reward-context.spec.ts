import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { LEAGUES } from "../../src/domain.ts";

const origin = "http://localhost:4174";
const password = "Reward-context-fixture-2026!";
type Actor = { client: APIRequestContext; me: any; username: string };
const headers = (actor: Actor) => ({
  origin,
  "x-csrf-token": actor.me.csrf,
  "idempotency-key": randomUUID(),
});
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
const changeFor = (result: any, actor: Actor) =>
  result.ratingChanges?.[actor.me.id];

async function register(
  client: APIRequestContext,
  name: string,
): Promise<Actor> {
  const username = "reward_" + randomUUID().slice(0, 8);
  const response = await client.post("/api/auth/register", {
    headers: { origin },
    data: { username, name, password, adult: true, timezone: "UTC" },
  });
  expect(response.status(), await response.text()).toBe(200);
  return { client, username, me: await (await client.get("/api/me")).json() };
}

async function publishWin(owner: Actor, opponent: Actor, playedAt: string) {
  const recorded = await owner.client.post("/api/results", {
    headers: headers(owner),
    data: {
      unitId: randomUUID(),
      scopeId: null,
      category: "Singles",
      format: "ONE_21",
      roster: [owner.me.id, opponent.me.id],
      games: [[21, 17]],
      playedAt,
      agree: true,
    },
  });
  expect(recorded.status(), await recorded.text()).toBe(200);
  const id = (await recorded.json()).id;
  const pending = await (
    await opponent.client.get("/api/results/" + id)
  ).json();
  const approved = await opponent.client.post(
    "/api/results/" + id + "/approve",
    {
      headers: headers(opponent),
      data: { revisionId: pending.revisionId, agree: true },
    },
  );
  expect(approved.status(), await approved.text()).toBe(200);
  await expect
    .poll(
      async () =>
        (await (await owner.client.get("/api/results/" + id)).json()).status,
      { timeout: 30000 },
    )
    .toBe("rated");
  return await (await owner.client.get("/api/results/" + id)).json();
}

test("published milestone recaps and promotion exports preserve a pending first-reveal correction", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240000);
  const opponentContext = await browser.newContext({ baseURL: origin });
  const anonymousContext = await browser.newContext({ baseURL: origin });
  const anonymous = await anonymousContext.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  anonymous.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const privateName = "Reward Context Private Owner Fixture";
    const owner = await register(page.request, privateName);
    const opponent = await register(
      opponentContext.request,
      "Reward Context Opponent Fixture",
    );
    const firstStart = Date.now() - 2 * 86400000;
    const published: any[] = [];
    for (let match = 0; match < 5; match++) {
      published.push(
        await publishWin(
          owner,
          opponent,
          new Date(firstStart + match * 60000).toISOString(),
        ),
      );
    }
    const fifth = published[4];
    const revealed = changeFor(fifth, owner);
    expect(revealed.count).toBe(5);
    expect(revealed.before).not.toBe(revealed.after);
    await page.goto("/home");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    const reveal = page.locator(".latest-result .reward-reveal");
    await expect(
      reveal.getByRole("heading", { name: "Your starting rating is here" }),
    ).toBeVisible();
    await expect(reveal.locator(".reward-earned-evidence")).toHaveText(
      "5 confirmed singles results",
    );
    await expect(
      reveal.locator(".rating-motion [aria-hidden=true]"),
    ).toHaveText(revealed.after.toLocaleString("en"));
    await expect(
      reveal.locator(".reward-score > .positive, .reward-score > .negative"),
    ).toHaveCount(0);
    await expect(
      reveal.getByRole("button", { name: "Replay the visible rating change" }),
    ).toHaveCount(0);

    // Corrections currently preserve match time. The divergent legacy-date
    // projection is covered by experience.test.ts, not fabricated as a UI flow.
    await page.goto("/home?result=" + fifth.id);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Correct the score", exact: true })
      .click();
    const correction = page.getByRole("dialog", {
      name: "Correct the exact score",
      exact: true,
    });
    await correction.getByLabel("Side B", { exact: true }).fill("16");
    await correction
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await correction
      .getByRole("button", { name: "Propose correction", exact: true })
      .click();
    await expect(correction).toHaveCount(0);
    const pending = await (
      await owner.client.get("/api/results/" + fifth.id)
    ).json();
    expect(pending.status).toBe("correction_pending");
    expect(pending.publishedRevisionId).toBe(fifth.publishedRevisionId);
    expect(pending.publishedResult.playedAt).toBe(fifth.playedAt);
    expect(pending.playedAt).toBe(fifth.playedAt);
    expect(pending.games).toEqual([[21, 16]]);
    expect(pending.publishedResult.games).toEqual([[21, 17]]);
    expect(changeFor(pending, owner)).toEqual(revealed);
    await page.goto("/home?result=" + fifth.id);
    const historicalReview = page.getByRole("dialog", {
      name: "Review the exact result",
      exact: true,
    });
    const historicalReveal = historicalReview.locator(".reward-previous");
    await expect(
      historicalReveal.getByRole("heading", {
        name: "Previously published estimate",
      }),
    ).toBeVisible();
    await expect(
      historicalReveal.locator(".rating-motion [aria-hidden=true]"),
    ).toHaveText(revealed.after.toLocaleString("en"));
    await expect(historicalReveal).not.toContainText(String(revealed.before));
    await expect(
      historicalReveal.locator(
        ".reward-score > .positive, .reward-score > .negative",
      ),
    ).toHaveCount(0);
    await expect(
      historicalReveal.getByRole("button", {
        name: "Replay the visible rating change",
      }),
    ).toHaveCount(0);

    published.push(
      await publishWin(
        owner,
        opponent,
        new Date(firstStart + 5 * 60000).toISOString(),
      ),
    );
    const sixth = changeFor(published[5], owner);
    await page.goto("/home");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    const chart = page.getByRole("group", { name: "Inspect rating history" });
    await expect(chart.getByRole("button")).toHaveCount(2);
    const firstPoint = chart.getByRole("button").first();
    await expect(firstPoint).toHaveAttribute(
      "aria-label",
      `${shortDate(fifth.playedAt)}: ${revealed.after} points`,
    );
    await firstPoint.click();
    await expect(page.locator(".chart-inspection")).toContainText(
      shortDate(fifth.playedAt),
    );
    await expect(page.locator(".chart-inspection")).toContainText(
      "Starting rating",
    );
    await expect(
      page.locator(".weekly-facts > div").nth(0).locator("strong"),
    ).toHaveText("6");
    await expect(
      page.locator(".weekly-facts > div").nth(2).locator("strong"),
    ).toHaveText("+" + (sixth.after - revealed.after));
    await page.goto("/profile?tab=history");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    const pendingHistory = page
      .locator(".result-card")
      .filter({ hasText: "21–16" });
    await expect(pendingHistory).toContainText(shortDate(fifth.playedAt));
    await expect(pendingHistory).toContainText("Starting rating revealed");

    for (let match = 6; match < 18; match++) {
      published.push(
        await publishWin(
          owner,
          opponent,
          new Date(firstStart + match * 60000).toISOString(),
        ),
      );
    }
    const dashboard = await (await owner.client.get("/api/dashboard")).json();
    expect(dashboard.me.id).toBe(owner.me.id);
    expect(dashboard.results).toHaveLength(18);
    const preservedReveal = dashboard.results.find(
      (result: any) => result.id === fifth.id,
    );
    expect(preservedReveal.status).toBe("correction_pending");
    expect(changeFor(preservedReveal, owner)).toEqual(revealed);
    const milestones = await (
      await owner.client.get("/api/milestones?category=Singles")
    ).json();
    const promotion = milestones.promotion;
    expect(promotion).not.toBeNull();
    expect(promotion.count).toBeGreaterThan(5);
    const promotionResult = dashboard.results.find((result: any) => {
      const change = changeFor(result, owner);
      return (
        change &&
        change.count === promotion.count &&
        change.after === promotion.score &&
        result.playedAt === promotion.asOf
      );
    });
    expect(promotionResult).toBeTruthy();
    const promotionChange = changeFor(promotionResult, owner);
    const previousLeague = LEAGUES.find(
      (league) => league.name === promotion.previousLeague,
    )!;
    const earnedLeague = LEAGUES.find(
      (league) => league.name === promotion.league,
    )!;
    expect(previousLeague.floor).toBeLessThan(earnedLeague.floor);
    expect(promotionChange.before).toBeLessThan(earnedLeague.floor);
    expect(promotionChange.after).toBeGreaterThanOrEqual(earnedLeague.floor);
    await page.goto("/home?result=" + promotionResult.id);
    const promotionReview = page.getByRole("dialog", {
      name: "Your confirmed result",
      exact: true,
    });
    const promotionRecap = promotionReview.locator(".reward-promotion");
    await expect(
      promotionRecap.getByRole("heading", {
        name: promotion.league + " reached",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      promotionRecap.getByRole("group", { name: "Earned league progression" }),
    ).toBeVisible();
    await expect(promotionRecap.locator(".reward-league-before")).toHaveText(
      promotion.previousLeague,
    );
    await expect(promotionRecap.locator(".reward-league-earned")).toHaveText(
      promotion.league,
    );
    await expect(
      promotionRecap.locator(".reward-league-before .gem"),
    ).toHaveAttribute("src", "/leagues/" + previousLeague.slug + ".svg");
    await expect(
      promotionRecap.locator(".reward-league-earned .gem"),
    ).toHaveAttribute("src", "/leagues/" + earnedLeague.slug + ".svg");
    await expect(
      promotionRecap.locator(".rating-motion [aria-hidden=true]"),
    ).toHaveText(promotionChange.after.toLocaleString("en"));

    const currentBest = changeFor(published.at(-1), owner);
    expect(currentBest.count).toBe(18);
    expect(currentBest.peakAfter).toBe(currentBest.after);
    expect(currentBest.peakAfter).toBeGreaterThan(currentBest.peakBefore);
    expect(currentBest.after).toBeGreaterThan(promotion.score);
    await page.goto("/home");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    const bestRecap = page.locator(".latest-result .reward-best");
    await expect(
      bestRecap.getByRole("heading", {
        name: "A new personal best",
        exact: true,
      }),
    ).toBeVisible();
    await expect(bestRecap.locator(".reward-previous-peak strong")).toHaveText(
      currentBest.peakBefore.toLocaleString("en"),
    );
    await expect(
      bestRecap.locator(".reward-new-peak .rating-motion [aria-hidden=true]"),
    ).toHaveText(currentBest.peakAfter.toLocaleString("en"));

    await page.goto("/home?result=" + promotionResult.id);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Share your progress", exact: true })
      .click();
    const share = page.getByRole("dialog", {
      name: "A number worth earning",
      exact: true,
    });
    await expect(
      share.locator("#share-template option[value=promotion]"),
    ).not.toBeDisabled();
    await share.getByLabel("Your story").selectOption("promotion");
    await expect(share.locator(".passport-evidence-line")).toHaveCount(0);
    await expect(share.locator(".rating-number")).toHaveText(
      promotion.score.toLocaleString("en"),
    );
    await expect(share).toContainText(
      promotion.previousLeague + " → " + promotion.league,
    );
    await share.getByLabel("Image shape").selectOption("feed");
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/shares") &&
        response.request().method() === "POST",
    );
    const feedDownload = page.waitForEvent("download");
    await share
      .getByRole("button", { name: "Download my rating snapshot", exact: true })
      .click();
    const shareResponse = await created;
    expect(shareResponse.status()).toBe(200);
    expect(shareResponse.request().postDataJSON()).toEqual({
      category: "Singles",
      template: "promotion",
      includeName: false,
      includeDistrict: false,
    });
    const snapshot = await shareResponse.json();
    expect(snapshot.payload).toMatchObject({
      template: "promotion",
      category: "Singles",
      score: promotion.score,
      league: promotion.league,
      previousLeague: promotion.previousLeague,
      asOf: promotion.asOf,
    });
    const feed = await feedDownload;
    await feed.saveAs(testInfo.outputPath("real-promotion-feed.png"));
    const feedPng = readFileSync((await feed.path())!);
    expect(feedPng.readUInt32BE(16)).toBe(1080);
    expect(feedPng.readUInt32BE(20)).toBe(1080);
    await expect(share.getByLabel("Your public snapshot link")).toHaveValue(
      origin + snapshot.path,
    );
    await share.getByLabel("Image shape").selectOption("story");
    const storyDownload = page.waitForEvent("download");
    await share
      .getByRole("button", { name: "Download my rating snapshot", exact: true })
      .click();
    const story = await storyDownload;
    await story.saveAs(testInfo.outputPath("real-promotion-story.png"));
    const storyPng = readFileSync((await story.path())!);
    expect(storyPng.readUInt32BE(16)).toBe(1080);
    expect(storyPng.readUInt32BE(20)).toBe(1920);
    await anonymous.goto(snapshot.path);
    await expect(
      anonymous.getByText(
        `A historical league milestone · ${promotion.previousLeague} → ${promotion.league}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(anonymous.locator(".rating-number")).toHaveText(
      promotion.score.toLocaleString("en"),
    );
    await expect(anonymous.locator("body")).not.toContainText(privateName);
    await expect(anonymous.locator("body")).not.toContainText(owner.username);
    expect(pageErrors).toEqual([]);
  } finally {
    await opponentContext.close();
    await anonymousContext.close();
  }
});
