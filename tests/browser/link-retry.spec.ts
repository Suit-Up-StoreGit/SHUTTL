import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function signup(page: Page, name: string) {
  const username = "retry_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Link-browser-2026!");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
  return username;
}

async function mutation(page: Page, path: string, body: unknown) {
  const identity = await (await page.request.get("/api/me")).json();
  const response = await page.request.post("/api" + path, {
    headers: {
      Origin: "http://localhost:4174",
      "X-CSRF-Token": identity.csrf,
      "Idempotency-Key": randomUUID(),
    },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
  return { identity, data: await response.json() };
}

test("a committed invitation whose response is lost survives reload and replays the same private link", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page, "Lost Link Fixture");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Show my player code" }).click();
  let loseFirstResponse = true;
  const attempts: { token: string; requestId: string }[] = [];
  await page.route("**/api/player-invites", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push({
      token: route.request().postDataJSON().token,
      requestId: route.request().headers()["idempotency-key"],
    });
    if (loseFirstResponse) {
      loseFirstResponse = false;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      return route.abort("connectionfailed");
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Create private invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry private invitation", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(/Your private invitation has not been confirmed/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeDisabled();
  const identity = await (await page.request.get("/api/me")).json();
  const before = await (
    await page.request.get("/api/account/player-invites")
  ).json();
  expect(
    before.invitations.filter((invite: any) => !invite.revoked),
  ).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "Show my player code" }).click();
  await page
    .getByRole("button", { name: "Retry private invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revoke invitation", exact: true }),
  ).toBeEnabled();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await page.getByText("Connection link", { exact: true }).click();
  await expect(page.getByLabel("Select connection link")).toHaveValue(
    "http://localhost:4174/connect/" + attempts[0].token,
  );
  const after = await (
    await page.request.get("/api/account/player-invites")
  ).json();
  expect(
    after.invitations.filter((invite: any) => !invite.revoked),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      "shuttl:pending-player-invite:" + identity.id,
    ),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  const invalid = await page.request.get(
    "/api/auth/player-invite/" + attempts[0].token,
  );
  expect(invalid.status()).toBe(404);
  expect(errors).toEqual([]);
});

test("cancelling a friendship accepted in another tab refreshes the open player-code state", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const ownerName = await signup(page, "Request Owner Fixture");
  const recipientContext = await browser.newContext({
    baseURL: "http://localhost:4174",
  });
  const recipient = await recipientContext.newPage();
  try {
    const recipientName = await signup(recipient, "Request Recipient Fixture");
    const recipientIdentity = await (
      await recipient.request.get("/api/me")
    ).json();
    const { identity: owner } = await mutation(page, "/friends", {
      playerId: recipientIdentity.id,
    });
    let interruptedLookup = true;
    await page.route(
      "**/api/players/by-username/" + recipientName,
      async (route) => {
        if (interruptedLookup) {
          interruptedLookup = false;
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Connection fixture could not load.",
            }),
          });
        }
        return route.continue();
      },
    );
    await page.goto("/home?player=" + recipientName);
    await page
      .getByRole("button", { name: "Retry loading connection", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel friend request", exact: true }),
    ).toBeVisible();
    await mutation(recipient, "/friends/" + owner.id + "/accept", {});
    await page
      .getByRole("button", { name: "Cancel friend request", exact: true })
      .click();
    await expect(
      page.getByText(/This request has already been accepted/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Already connected", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Cancel friend request", exact: true }),
    ).toHaveCount(0);
    const current = await (
      await page.request.get("/api/players/by-username/" + recipientName)
    ).json();
    expect(current.connection).toBe("accepted");
    expect(current.friend).toBe(true);
    const reverse = await (
      await recipient.request.get("/api/players/by-username/" + ownerName)
    ).json();
    expect(reverse.connection).toBe("accepted");
  } finally {
    await recipientContext.close();
  }
});

test("an interrupted invitation read can be retried in place without changing its token or signing up again", async ({
  page,
}) => {
  await signup(page, "Invitation Read Fixture");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Show my player code", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create private invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revoke invitation", exact: true }),
  ).toBeVisible();
  await page.getByText("Connection link", { exact: true }).click();
  const link = await page.getByLabel("Select connection link").inputValue();
  const token = link.split("/connect/")[1];
  let interruptedRead = true;
  await page.route("**/api/player-invites/" + token, async (route) => {
    if (interruptedRead) {
      interruptedRead = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invitation fixture could not load." }),
      });
    }
    return route.continue();
  });
  await page.goto(link);
  await expect(
    page.getByRole("heading", {
      name: "We couldn’t open this invitation.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry invitation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "This is your invitation.",
      exact: true,
    }),
  ).toBeVisible();
  expect(page.url()).toBe(link);
  await page.getByRole("link", { name: "Go to my court" }).click();
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
});
