import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Database } from "../../server/database.ts";

const origin = "http://localhost:4174";
type Actor = { context: BrowserContext; page: Page; me: any; username: string };
async function actor(browser: Browser, name: string): Promise<Actor> {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  const username = "cons_" + randomUUID().slice(0, 8);
  const response = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: {
      username,
      name,
      password: "Consent-persona-2026!",
      adult: true,
      timezone: "Europe/Berlin",
    },
  });
  expect(response.status()).toBe(200);
  const me = await (await context.request.get("/api/me")).json();
  return { context, page: await context.newPage(), me, username };
}
function headers(who: Actor) {
  return {
    origin,
    "x-csrf-token": who.me.csrf,
    "idempotency-key": randomUUID(),
  };
}
async function fillRoster(page: Page, players: Actor[]) {
  for (const player of players) {
    await page
      .getByRole("button", { name: "Choose player", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Username or public display name")
      .fill(player.username);
    await page
      .getByRole("button", { name: new RegExp("@" + player.username) })
      .click();
  }
}
async function confirm(who: Actor, id: string) {
  await who.page.goto("/home?result=" + id);
  await who.page
    .getByRole("checkbox", { name: /These are the correct sides/ })
    .check();
  await who.page
    .getByRole("button", { name: "Confirm this exact score", exact: true })
    .click();
}
async function latest(who: Actor) {
  const values = await (await who.context.request.get("/api/results")).json();
  expect(values.results.length).toBeGreaterThan(0);
  return values.results[0];
}

test("a doubles regular creates an exact recurring agreement, records a covered series, revokes future consent and records Mixed separately", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const players = await Promise.all(
    [
      "Doubles regular persona",
      "Regular partner fixture",
      "Opponent fixture",
      "Opposing partner fixture",
    ].map((name) => actor(browser, name)),
  );
  const [self, partner, opponent, other] = players;
  try {
    await self.page.goto("/agreements");
    await self.page
      .getByRole("button", { name: "New agreement", exact: true })
      .click();
    await self.page
      .getByLabel("Category", { exact: true })
      .selectOption("Doubles");
    await self.page
      .getByLabel("Format", { exact: true })
      .selectOption("BO3_15");
    await fillRoster(self.page, players.slice(1));
    await self.page.getByLabel("Agreement length").selectOption("recurring");
    const agreementWindow = self.page.getByRole("region", {
      name: "Agreement window",
    });
    const windowStarts = await agreementWindow
      .locator("time")
      .nth(0)
      .getAttribute("datetime");
    const windowEnds = await agreementWindow
      .locator("time")
      .nth(1)
      .getAttribute("datetime");
    expect(Date.parse(windowEnds!) - Date.parse(windowStarts!)).toBe(
      30 * 86400000,
    );
    await expect(self.page.locator(".agreement-steps")).toContainText(
      "Every player agrees to rated play before the match starts.",
    );
    await self.page
      .getByRole("checkbox", { name: /I agree that covered completed matches/ })
      .check();
    await self.page
      .getByRole("button", { name: "Create agreement and accept for myself" })
      .click();
    await expect(self.page.getByRole("dialog")).toHaveCount(0);
    const created = await (
      await self.context.request.get("/api/scopes")
    ).json();
    expect(created.scopes).toHaveLength(1);
    const scope = created.scopes[0];
    expect(scope.category).toBe("Doubles");
    expect(scope.format).toBe("BO3_15");
    expect(scope.starts).toBe(windowStarts);
    expect(scope.ends).toBe(windowEnds);
    expect(
      new Date(scope.ends).getTime() - new Date(scope.starts).getTime(),
    ).toBe(30 * 86400000);
    for (const person of players.slice(1)) {
      await person.page.goto("/agreements");
      await person.page
        .getByRole("button", {
          name: "I agree to this exact scope",
          exact: true,
        })
        .click();
      await expect(
        person.page.getByRole("button", {
          name: "Stop future rated play",
          exact: true,
        }),
      ).toBeVisible();
    }
    await self.page.reload();
    await expect(
      self.page.getByText("All players agreed", { exact: true }),
    ).toBeVisible();
    // Consent is recorded to milliseconds, while the visible start-time field
    // accepts seconds. Simulate a match starting after every actual UI consent,
    // rather than accidentally placing its start just before the last choice.
    const clockFixture = new DatabaseSync("data/browser-tests.sqlite", {
      readOnly: true,
    });
    let matchStart: number;
    try {
      const consent = clockFixture
        .prepare(
          "SELECT max(accepted_at) AS latest FROM consent WHERE scope_id=?",
        )
        .get(scope.id) as { latest: string };
      matchStart =
        Math.floor(
          Math.max(Date.parse(consent.latest), Date.parse(scope.starts)) / 1000,
        ) *
          1000 +
        1000;
    } finally {
      clockFixture.close();
    }
    await self.page.goto("/home");
    await self.page.getByRole("button", { name: "Record a result" }).click();
    await self.page
      .getByLabel("Category", { exact: true })
      .selectOption("Doubles");
    await self.page.getByLabel("Played format").selectOption("BO3_15");
    await fillRoster(self.page, players.slice(1));
    await self.page.getByLabel("Your side", { exact: true }).nth(0).fill("15");
    await self.page.getByLabel("Other side", { exact: true }).nth(0).fill("10");
    await self.page.getByLabel("Your side", { exact: true }).nth(1).fill("10");
    await self.page.getByLabel("Other side", { exact: true }).nth(1).fill("15");
    await self.page
      .getByRole("button", { name: "Add the deciding third game" })
      .click();
    await expect(
      self.page.getByLabel("Your side", { exact: true }),
    ).toHaveCount(3);
    await self.page
      .getByRole("button", { name: "Remove the third game" })
      .click();
    await expect(
      self.page.getByLabel("Your side", { exact: true }),
    ).toHaveCount(2);
    await self.page
      .getByRole("button", { name: "Add the deciding third game" })
      .click();
    await self.page.getByLabel("Your side", { exact: true }).nth(2).fill("15");
    await self.page.getByLabel("Other side", { exact: true }).nth(2).fill("13");
    await self.page
      .getByLabel("Earlier rated agreement")
      .selectOption(scope.id);
    const earlierWindow = self.page.locator(
      ".result-agreement-details .agreement-window",
    );
    await expect(earlierWindow.locator("time").nth(0)).toHaveAttribute(
      "datetime",
      scope.starts,
    );
    await expect(earlierWindow.locator("time").nth(1)).toHaveAttribute(
      "datetime",
      scope.ends,
    );
    await expect(earlierWindow).toContainText(
      "Today’s approval count does not establish earlier coverage.",
    );
    await expect
      .poll(() => Date.now(), { timeout: 5000, intervals: [100, 200] })
      .toBeGreaterThanOrEqual(matchStart);
    const localStart = await self.page.evaluate((timestamp) => {
      const date = new Date(timestamp);
      return (
        new Date(timestamp - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 19)
          // Native datetime-local omits zero seconds without changing the instant.
          .replace(/:00$/, "")
      );
    }, matchStart);
    await self.page.getByLabel("Started at", { exact: true }).fill(localStart);
    const finalCheck = self.page.getByRole("region", {
      name: "Final result check",
    });
    await expect(finalCheck).toContainText("Doubles regular persona");
    await expect(finalCheck.locator(".result-check-lineup")).toContainText(
      other.username,
    );
    await expect(finalCheck.locator(".result-check-games")).toHaveText(
      "15–10 / 10–15 / 15–13",
    );
    await expect(finalCheck.locator("time")).toHaveAttribute(
      "datetime",
      new Date(matchStart).toISOString(),
    );
    await self.page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await self.page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(self.page.getByRole("dialog")).toHaveCount(0);
    const covered = await latest(self);
    expect(covered.retrospective).toBe(false);
    await partner.page.goto("/home?result=" + covered.id);
    await expect(
      partner.page.getByRole("button", {
        name: "Confirm this exact score",
        exact: true,
      }),
    ).toHaveCount(0);
    await confirm(opponent, covered.id);
    await expect(
      opponent.page.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await self.page.goto("/agreements");
    await self.page
      .getByRole("button", { name: "Stop future rated play", exact: true })
      .click();
    await expect(self.page.getByText("Revoked", { exact: true })).toBeVisible();
    expect(
      (
        await (
          await self.context.request.get("/api/results/" + covered.id)
        ).json()
      ).status,
    ).toBe("rated");
    await self.page.goto("/home");
    await self.page.getByRole("button", { name: "Record a result" }).click();
    await self.page
      .getByLabel("Category", { exact: true })
      .selectOption("Mixed");
    await self.page.getByLabel("Played format").selectOption("ONE_15");
    await fillRoster(self.page, players.slice(1));
    await self.page.getByLabel("Your side", { exact: true }).fill("15");
    await self.page.getByLabel("Other side", { exact: true }).fill("12");
    await expect(self.page.getByLabel("Earlier rated agreement")).toHaveValue(
      "",
    );
    await self.page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await self.page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(self.page.getByRole("dialog")).toHaveCount(0);
    const mixed = await latest(self);
    expect(mixed.category).toBe("Mixed");
    expect(mixed.retrospective).toBe(true);
    for (const person of [partner, opponent, other])
      await confirm(person, mixed.id);
    await expect(
      other.page.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const profile = await (await self.context.request.get("/api/me")).json();
    expect(
      profile.ratings.find((r: any) => r.category === "Singles").count,
    ).toBe(0);
    expect(
      profile.ratings.find((r: any) => r.category === "Doubles").count,
    ).toBe(1);
    expect(profile.ratings.find((r: any) => r.category === "Mixed").count).toBe(
      1,
    );
  } finally {
    await Promise.all(players.map((person) => person.context.close()));
  }
});

test("a competitive persona checks all formats, fixes an invalid score, proposes a correction, disputes and appeals a genuine void decision", async ({
  browser,
}) => {
  test.setTimeout(150000);
  const players = await Promise.all(
    [
      "Competitive persona",
      "Competitive opponent fixture",
      "Independent fixture reviewer",
    ].map((name) => actor(browser, name)),
  );
  const [self, opponent, reviewer] = players;
  try {
    await self.page.goto("/home");
    await self.page.getByRole("button", { name: "Record a result" }).click();
    await self.page
      .getByLabel("Category", { exact: true })
      .selectOption("Singles");
    await fillRoster(self.page, [opponent]);
    for (const format of ["BO3_21", "ONE_15", "BO3_15", "ONE_21"]) {
      await self.page.getByLabel("Played format").selectOption(format);
      await expect(
        self.page.getByLabel("Your side", { exact: true }),
      ).toHaveCount(format.startsWith("BO3") ? 2 : 1);
    }
    await self.page.getByLabel("Your side", { exact: true }).fill("21");
    await self.page.getByLabel("Other side", { exact: true }).fill("20");
    await expect(
      self.page.getByRole("region", { name: "Final result check" }),
    ).toHaveCount(0);
    await self.page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await self.page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(self.page.getByRole("alert")).toContainText("Win by two");
    await self.page.getByLabel("Your side", { exact: true }).fill("23");
    await self.page.getByLabel("Other side", { exact: true }).fill("21");
    await expect(
      self.page.getByRole("checkbox", {
        name: /I confirm these sides and scores/,
      }),
    ).not.toBeChecked();
    await self.page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await self.page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(self.page.getByRole("dialog")).toHaveCount(0);
    const result = await latest(self);
    await confirm(opponent, result.id);
    await expect(
      opponent.page.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await self.page.goto("/home?result=" + result.id);
    await self.page
      .getByRole("button", { name: "Correct the score", exact: true })
      .click();
    await expect(
      self.page.getByLabel("Category", { exact: true }),
    ).toBeDisabled();
    await self.page.getByLabel("Played format").selectOption("BO3_21");
    await self.page.getByLabel("Side A", { exact: true }).nth(0).fill("21");
    await self.page.getByLabel("Side B", { exact: true }).nth(0).fill("17");
    await self.page.getByLabel("Side A", { exact: true }).nth(1).fill("17");
    await self.page.getByLabel("Side B", { exact: true }).nth(1).fill("21");
    await self.page
      .getByRole("button", { name: "Add the deciding third game" })
      .click();
    await self.page.getByLabel("Side A", { exact: true }).nth(2).fill("21");
    await self.page.getByLabel("Side B", { exact: true }).nth(2).fill("19");
    const correctionCheck = self.page.getByRole("region", {
      name: "Final result check",
    });
    await expect(
      correctionCheck.getByText("Proposed score", { exact: true }),
    ).toBeVisible();
    await expect(correctionCheck.locator(".result-check-games")).toHaveText(
      "21–17 / 17–21 / 21–19",
    );
    await expect(
      correctionCheck.locator(".currently-counted-score"),
    ).toContainText("23–21");
    await self.page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await self.page
      .getByRole("button", { name: "Propose correction", exact: true })
      .click();
    await expect(self.page.getByRole("dialog")).toHaveCount(0);
    await opponent.page.goto("/home?result=" + result.id);
    await expect(
      opponent.page.getByText("Currently counted score", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      opponent.page.getByRole("checkbox", {
        name: /These are the correct sides/,
      }),
    ).not.toBeChecked();
    await opponent.page
      .getByRole("checkbox", { name: /These are the correct sides/ })
      .check();
    await opponent.page
      .getByRole("button", { name: "Confirm this exact score", exact: true })
      .click();
    await expect(
      opponent.page.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await opponent.page
      .getByRole("button", { name: "Ask for review", exact: true })
      .click();
    await opponent.page
      .getByLabel("What needs reviewing?")
      .fill(
        "Synthetic competitive persona disputes the recorded match format.",
      );
    await opponent.page
      .getByRole("button", {
        name: "Submit private review request",
        exact: true,
      })
      .click();
    await expect(
      opponent.page.getByText("Under independent review", { exact: true }),
    ).toBeVisible();
    // Local fixture setup promotes only this new synthetic identity. Production
    // exposes no browser-accessible role promotion. The appeal itself uses UI.
    const db = new Database("./data/browser-tests.sqlite");
    try {
      db.run("UPDATE users SET role='reviewer' WHERE id=?", reviewer.me.id);
    } finally {
      db.close();
    }
    const queue = await (
      await reviewer.context.request.get("/api/reviewer")
    ).json();
    const dispute = queue.reviews.find((r: any) => r.result.id === result.id);
    expect(dispute).toBeTruthy();
    expect(
      (
        await reviewer.context.request.post("/api/reviewer/" + dispute.id, {
          headers: headers(reviewer),
          data: {
            decision: "void",
            reason:
              "Synthetic independent fixture decision, requires appeal pathway check.",
          },
        })
      ).status(),
    ).toBe(200);
    await opponent.page.reload();
    await expect(
      opponent.page.getByRole("button", {
        name: "Appeal this decision",
        exact: true,
      }),
    ).toBeVisible();
    await opponent.page
      .getByRole("button", { name: "Appeal this decision", exact: true })
      .click();
    await opponent.page
      .getByLabel("What needs reviewing?")
      .fill(
        "Synthetic persona appeals and provides further format evidence for review.",
      );
    await opponent.page
      .getByRole("button", {
        name: "Submit private review request",
        exact: true,
      })
      .click();
    await expect(
      opponent.page.getByText("Under independent review", { exact: true }),
    ).toBeVisible();
    const after = await (
      await reviewer.context.request.get("/api/reviewer")
    ).json();
    expect(
      after.reviews.filter((r: any) => r.result.id === result.id),
    ).toHaveLength(1);
  } finally {
    await Promise.all(players.map((person) => person.context.close()));
  }
});
