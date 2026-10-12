import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { preferenceValues } from "../../src/preference-draft.ts";

const origin = "http://localhost:4174";
const password = "Public-share-persona-2026!";
type FictionalActor = { client: APIRequestContext; me: any; username: string };
const headers = (who: FictionalActor) => ({
  origin,
  "x-csrf-token": who.me.csrf,
  "idempotency-key": randomUUID(),
});
const utcDate = (value: string) =>
  new Date(value).toLocaleDateString("en-SG", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

async function publish(
  owner: FictionalActor,
  opponent: FictionalActor,
  game: number,
  wins = true,
) {
  const recorded = await owner.client.post("/api/results", {
    headers: headers(owner),
    data: {
      unitId: randomUUID(),
      scopeId: null,
      category: "Singles",
      format: "ONE_21",
      roster: [owner.me.id, opponent.me.id],
      games: [wins ? [21, 17] : [17, 21]],
      playedAt: new Date(Date.now() - 600000 + game * 60000).toISOString(),
      agree: true,
    },
  });
  expect(recorded.status(), await recorded.text()).toBe(200);
  const resultId = (await recorded.json()).id;
  const result = await (
    await opponent.client.get("/api/results/" + resultId)
  ).json();
  const approved = await opponent.client.post(
    "/api/results/" + resultId + "/approve",
    {
      headers: headers(opponent),
      data: { revisionId: result.revisionId, agree: true },
    },
  );
  expect(approved.status(), await approved.text()).toBe(200);
  await expect
    .poll(
      async () =>
        (await (await owner.client.get("/api/results/" + resultId)).json())
          .status,
      { timeout: 30000 },
    )
    .toBe("rated");
}

async function signIn(page: Page, username: string) {
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
}

test("public share personas inspect captured private and named snapshots, change profile visibility, revoke an exact link and keep arrival continuity", async ({
  page,
  browser,
  playwright,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const actors: FictionalActor[] = [];
  const ownerContexts: BrowserContext[] = [];
  const newcomerContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  const newcomer = await newcomerContext.newPage();
  newcomer.on("pageerror", (e) => errors.push(e.message));
  const privateName = "Public Snapshot Private Owner Fixture";
  const privateDistrict = "Private Share District Fixture";
  try {
    for (const name of [privateName, "Public Snapshot Opponent Fixture"]) {
      const client = await playwright.request.newContext({ baseURL: origin });
      const username = "pub_" + randomUUID().slice(0, 8);
      const registered = await client.post("/api/auth/register", {
        headers: { origin },
        data: { username, name, password, adult: true },
      });
      expect(registered.status(), await registered.text()).toBe(200);
      actors.push({
        client,
        username,
        me: await (await client.get("/api/me")).json(),
      });
    }
    const [owner, opponent] = actors;
    const preferences = await owner.client.patch("/api/profile", {
      headers: headers(owner),
      data: {
        ...preferenceValues(owner.me),
        district: privateDistrict,
        country: "DE",
        city: "Berlin",
        publicName: false,
        publicDistrict: false,
        publicHistory: false,
        publicPortrait: false,
        localOptIn: false,
      },
    });
    expect(preferences.status(), await preferences.text()).toBe(200);
    for (let game = 0; game < 5; game++) await publish(owner, opponent, game);
    const snapshots = new Map<string, any>();
    for (const template of ["passport", "reveal", "best"]) {
      const created = await owner.client.post("/api/shares", {
        headers: headers(owner),
        data: {
          category: "Singles",
          template,
          includeName: false,
          includeDistrict: false,
        },
      });
      expect(created.status(), await created.text()).toBe(200);
      const snapshot = await created.json();
      snapshots.set(template, snapshot);
      await page.goto(snapshot.path);
      await expect(
        page.getByRole("heading", {
          name: "A number worth earning.",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".rating-number")).toHaveText(
        snapshot.payload.score.toLocaleString("en-SG"),
      );
      await expect(page.locator(".passport-evidence-line")).toHaveCount(0);
      await expect(
        page.getByText(
          template === "passport"
            ? "This number matches the current rating"
            : template === "reveal"
              ? "A historical starting point"
              : "A historical personal best",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.locator(".share-public")).toContainText(
        utcDate(snapshot.payload.asOf) + " UTC",
      );
      await expect(page.locator(".share-public")).toContainText(
        "This is not a whole-neighborhood ranking or a live title.",
      );
      if (template !== "passport")
        await expect(page.locator(".share-public")).toContainText(
          "Created from published history on " +
            utcDate(snapshot.payload.createdAt),
        );
      for (const withheld of [privateName, privateDistrict, owner.username])
        await expect(page.locator("body")).not.toContainText(withheld);
      const publicResult = await page.request.get("/api/shares/" + snapshot.id);
      expect(publicResult.status()).toBe(200);
      const publicData = await publicResult.json();
      for (const key of [
        "owner",
        "name",
        "district",
        "username",
        "password",
        "recovery",
        "csrf",
      ])
        expect(Object.hasOwn(publicData, key)).toBe(false);
      expect((await page.request.get("/api/me")).status()).toBe(401);
    }

    // Keep automatic privacy withdrawal separate from the original anonymous
    // snapshots used below for historical and arrival-continuity checks.
    const visibilityActors: FictionalActor[] = [];
    const visibleName = "Public Link Visibility Owner Fixture";
    for (const name of [
      visibleName,
      "Public Link Visibility Opponent Fixture",
    ]) {
      const client = await playwright.request.newContext({ baseURL: origin });
      const username = "vis_" + randomUUID().slice(0, 8);
      const registered = await client.post("/api/auth/register", {
        headers: { origin },
        data: { username, name, password, adult: true },
      });
      expect(registered.status(), await registered.text()).toBe(200);
      const actor = {
        client,
        username,
        me: await (await client.get("/api/me")).json(),
      };
      actors.push(actor);
      visibilityActors.push(actor);
    }
    const [visibilityOwner, visibilityOpponent] = visibilityActors;
    for (let game = 0; game < 5; game++)
      await publish(visibilityOwner, visibilityOpponent, game);
    const namedPreferences = await visibilityOwner.client.patch(
      "/api/profile",
      {
        headers: headers(visibilityOwner),
        data: {
          ...preferenceValues(
            await (await visibilityOwner.client.get("/api/me")).json(),
          ),
          district: privateDistrict,
          country: "DE",
          city: "Berlin",
          publicName: true,
          publicDistrict: true,
        },
      },
    );
    expect(namedPreferences.status(), await namedPreferences.text()).toBe(200);
    const namedCreated = await visibilityOwner.client.post("/api/shares", {
      headers: headers(visibilityOwner),
      data: {
        category: "Singles",
        template: "passport",
        includeName: true,
        includeDistrict: true,
      },
    });
    expect(namedCreated.status(), await namedCreated.text()).toBe(200);
    const namedSnapshot = await namedCreated.json();
    const anonymousCreated = await visibilityOwner.client.post("/api/shares", {
      headers: headers(visibilityOwner),
      data: {
        category: "Singles",
        template: "passport",
        includeName: false,
        includeDistrict: false,
      },
    });
    expect(anonymousCreated.status(), await anonymousCreated.text()).toBe(200);
    const anonymousSnapshot = await anonymousCreated.json();
    const ownerContext = await browser.newContext({
      baseURL: origin,
      storageState: await visibilityOwner.client.storageState(),
      viewport: { width: 390, height: 844 },
    });
    ownerContexts.push(ownerContext);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on("pageerror", (e) => errors.push(e.message));
    await ownerPage.goto("/profile?tab=settings");
    const namedEntry = ownerPage.locator(
      '.public-share-entry[data-share-id="' + namedSnapshot.id + '"]',
    );
    await expect(namedEntry).toContainText("Player passport · Singles");
    await expect(namedEntry).toContainText("Name: " + visibleName);
    await expect(namedEntry).toContainText("Area: " + privateDistrict);
    await expect(namedEntry).toContainText("Rating snapshot:");
    await expect(namedEntry).toContainText("Shared:");
    await expect(
      ownerPage.locator(
        '.public-share-entry[data-share-id="' + anonymousSnapshot.id + '"]',
      ),
    ).toContainText("Name omitted · Area omitted");
    await expect(ownerPage.locator("#public-links-policy")).toContainText(
      "Turning off Public display name or Public declared district automatically revokes all existing share links when you save.",
    );
    await page.goto(namedSnapshot.path);
    await expect(page.locator(".share-public")).toContainText(visibleName);
    await expect(page.locator(".share-public")).toContainText(privateDistrict);
    const captured = await (
      await page.request.get("/api/shares/" + namedSnapshot.id)
    ).json();
    expect(captured.name).toBe(visibleName);
    expect(captured.district).toBe(privateDistrict);
    await ownerPage
      .getByRole("checkbox", { name: /^Public display name/ })
      .uncheck();
    await ownerPage
      .getByRole("checkbox", { name: /^Public declared district/ })
      .uncheck();
    await ownerPage
      .getByRole("button", { name: "Save my preferences", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await ownerPage.request.get("/api/me")).json()).publicName,
      )
      .toBe(false);
    expect(
      (await (await ownerPage.request.get("/api/me")).json()).publicDistrict,
    ).toBe(false);
    await expect(namedEntry).toHaveCount(0);
    await expect(ownerPage.locator(".public-share-entry")).toHaveCount(0);
    expect(
      (await page.request.get("/api/shares/" + namedSnapshot.id)).status(),
    ).toBe(404);
    expect(
      (await page.request.get("/api/shares/" + anonymousSnapshot.id)).status(),
    ).toBe(404);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "This link is unavailable.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".share-public")).not.toContainText(visibleName);

    // Anonymous links can be shared again with the saved private choices.
    // Revoke one recognizable entry without withdrawing another active link.
    const freshSnapshots = [];
    for (const template of ["passport", "reveal"]) {
      const fresh = await visibilityOwner.client.post("/api/shares", {
        headers: headers(visibilityOwner),
        data: {
          category: "Singles",
          template,
          includeName: false,
          includeDistrict: false,
        },
      });
      expect(fresh.status(), await fresh.text()).toBe(200);
      freshSnapshots.push(await fresh.json());
    }
    await ownerPage.reload();
    const freshEntry = ownerPage.locator(
      '.public-share-entry[data-share-id="' + freshSnapshots[0].id + '"]',
    );
    await expect(freshEntry).toContainText("Player passport · Singles");
    await expect(freshEntry).toContainText("Name omitted · Area omitted");
    await freshEntry
      .getByRole("button", { name: /^Revoke Player passport Singles link / })
      .click();
    await expect(freshEntry).toHaveCount(0);
    expect(
      (await page.request.get("/api/shares/" + freshSnapshots[0].id)).status(),
    ).toBe(404);
    expect(
      (await page.request.get("/api/shares/" + freshSnapshots[1].id)).status(),
    ).toBe(200);
    expect(
      (
        await page.request.get("/api/shares/" + snapshots.get("passport").id)
      ).status(),
    ).toBe(200);
    await page.goto(freshSnapshots[0].path);
    await expect(
      page.getByRole("heading", {
        name: "This link is unavailable.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".rating-number")).toHaveCount(0);
    await expect(page.locator(".share-public")).not.toContainText(visibleName);

    const passport = snapshots.get("passport");
    const reveal = snapshots.get("reveal");
    await publish(owner, opponent, 5, false);
    await page.goto(passport.path);
    await expect(
      page.getByText("This is a historical snapshot", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".rating-number")).toHaveText(
      passport.payload.score.toLocaleString("en-SG"),
    );
    expect(
      (await (await page.request.get("/api/shares/" + passport.id)).json())
        .isCurrent,
    ).toBe(false);
    let failNextShareRead = true;
    await page.route("**/api/shares/" + passport.id, async (route) => {
      if (failNextShareRead) {
        failNextShareRead = false;
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic public share interruption." },
        });
      }
      return route.continue();
    });
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "We couldn’t open this link.",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Retry this link", exact: true })
      .click();
    await expect(
      page.getByText("This is a historical snapshot", { exact: true }),
    ).toBeVisible();

    // Existing-player branch: real anonymous landing -> real visible password
    // sign-in, with the share context retained through authentication.
    failNextShareRead = true;
    await page
      .getByRole("link", {
        name: "Start your own badminton story",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp("/home\\?fromShare=" + passport.id + "$"),
    );
    await signIn(page, opponent.username);
    await expect(
      page.getByText("Your shared story couldn’t be opened.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Retry shared story", exact: true })
      .click();
    await expect(
      page.getByText("A singles story brought you here.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(
      page.getByText("A singles story brought you here.", { exact: true }),
    ).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("fromShare")).toBe(false);
    await page.reload();
    await expect(
      page.getByText("A singles story brought you here.", { exact: true }),
    ).toHaveCount(0);
    failNextShareRead = true;
    await page.goto("/home?fromShare=" + passport.id);
    await expect(
      page.getByText("Your shared story couldn’t be opened.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Dismiss shared story", exact: true })
      .click();
    await expect(
      page.getByText("Your shared story couldn’t be opened.", { exact: true }),
    ).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("fromShare")).toBe(false);
    await page.reload();
    await expect(
      page.getByText("Your shared story couldn’t be opened.", { exact: true }),
    ).toHaveCount(0);

    // New-player branch: the actual visible registration and recovery gate.
    await newcomer.goto(reveal.path);
    await newcomer
      .getByRole("link", {
        name: "Start your own badminton story",
        exact: true,
      })
      .click();
    const newcomerName = "newshare_" + randomUUID().slice(0, 8);
    await newcomer
      .getByLabel("Your display name")
      .fill("Share Arrival New Player Fixture");
    await newcomer.getByLabel("Username", { exact: true }).fill(newcomerName);
    await newcomer.getByLabel("Password", { exact: true }).fill(password);
    await newcomer.getByRole("checkbox", { name: /I am 18 or older/ }).check();
    await newcomer
      .getByRole("button", { name: "Create my player identity", exact: true })
      .click();
    await newcomer
      .getByRole("checkbox", {
        name: /I have saved my recovery code privately/,
      })
      .check();
    await newcomer
      .getByRole("button", { name: "Continue to my court", exact: true })
      .click();
    await expect(
      newcomer.getByText("A singles story brought you here.", { exact: true }),
    ).toBeVisible();
    await newcomer
      .getByRole("button", { name: "Start my singles story", exact: true })
      .click();
    await expect(
      newcomer.getByRole("dialog", {
        name: "Record a match",
        exact: true,
      }),
    ).toBeVisible();
    await expect(newcomer.getByLabel("Category", { exact: true })).toHaveValue(
      "Singles",
    );
    expect(new URL(newcomer.url()).searchParams.has("fromShare")).toBe(false);
    const freshAccount = await (await newcomer.request.get("/api/me")).json();
    expect(
      freshAccount.ratings.every(
        (rating: any) => rating.count === 0 && rating.score === null,
      ),
    ).toBe(true);
    await newcomer
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await newcomer.reload();
    await expect(
      newcomer.getByText("A singles story brought you here.", { exact: true }),
    ).toHaveCount(0);

    const revoked = await owner.client.delete("/api/shares/" + passport.id, {
      headers: headers(owner),
      data: {},
    });
    expect(revoked.status()).toBe(200);
    await page.goto(passport.path);
    await expect(
      page.getByRole("heading", {
        name: "This link is unavailable.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".rating-number")).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Start your own badminton story",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Return to your court", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your game.", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await newcomerContext.close();
    await Promise.all(ownerContexts.map((context) => context.close()));
    await Promise.all(actors.map((actor) => actor.client.dispose()));
  }
});
