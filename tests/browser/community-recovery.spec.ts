import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:4174";
type Account = { id: string; username: string; csrf: string };

// Disposable API-created identities provide the prerequisite relationships;
// the visible choices under test still run through the application UI.
async function account(
  context: BrowserContext,
  name: string,
): Promise<Account> {
  const username = "flow_" + randomUUID().slice(0, 8);
  const response = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { username, name, password: "Recovery-fixture-2026!", adult: true },
  });
  expect(response.status()).toBe(200);
  const data = await response.json();
  return { id: data.user.id, username, csrf: data.csrf };
}
async function change(page: Page, actor: Account, path: string, data = {}) {
  const response = await page.request.post("/api" + path, {
    headers: {
      origin,
      "x-csrf-token": actor.csrf,
      "idempotency-key": randomUUID(),
    },
    data,
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function group(
  ownerPage: Page,
  owner: Account,
  memberPage: Page,
  member: Account,
) {
  const created = await change(ownerPage, owner, "/circles", {
    name: "Continuity Fixture " + randomUUID().slice(0, 8),
  });
  await change(ownerPage, owner, `/circles/${created.id}/invite`, {
    playerId: member.id,
  });
  await change(memberPage, member, `/circles/${created.id}/accept`);
  return created.id as string;
}

test("private connection links show self, outgoing, incoming and accepted states accurately", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  const owner = await account(context, "Invitation Owner Fixture");
  const recipientContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  const incomingContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const recipient = await account(
      recipientContext,
      "Invitation Recipient Fixture",
    );
    const incoming = await account(
      incomingContext,
      "Incoming Connection Fixture",
    );
    const recipientPage = await recipientContext.newPage();
    const incomingPage = await incomingContext.newPage();
    const invitation = await change(page, owner, "/player-invites");
    await page.goto(invitation.path);
    await expect(
      page.getByRole("heading", {
        name: "This is your invitation.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Request this connection" }),
    ).toHaveCount(0);

    await recipientPage.goto(invitation.path);
    await recipientPage
      .getByRole("button", { name: "Request this connection" })
      .click();
    await expect(
      recipientPage.getByText("Your request is with the inviter.", {
        exact: true,
      }),
    ).toBeVisible();
    await recipientPage.reload();
    await expect(
      recipientPage.getByText("Your request is with the inviter.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      recipientPage.getByRole("button", { name: "Request this connection" }),
    ).toHaveCount(0);
    await change(page, owner, `/friends/${recipient.id}/accept`);
    await recipientPage.reload();
    await expect(
      recipientPage.getByText("You are already connected.", { exact: true }),
    ).toBeVisible();

    await change(page, owner, "/friends", { playerId: incoming.id });
    await incomingPage.goto(invitation.path);
    await expect(
      incomingPage.getByText("This player already requested your friendship.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      incomingPage.getByRole("button", { name: "Request this connection" }),
    ).toHaveCount(0);
    await incomingPage
      .getByRole("link", { name: "Review friendship request" })
      .click();
    await expect(incomingPage).toHaveURL(/\/inbox$/);
    const requestRow = incomingPage
      .locator(".ranking-row")
      .filter({ hasText: owner.username });
    await requestRow
      .getByRole("button", { name: "Accept", exact: true })
      .click();
    await expect(requestRow).toHaveCount(0);
    await incomingPage.goto(invitation.path);
    await expect(
      incomingPage.getByText("You are already connected.", { exact: true }),
    ).toBeVisible();
  } finally {
    await recipientContext.close();
    await incomingContext.close();
  }
});

test("rescanning a username code preserves pending requests and supports cancellation before explicit acceptance", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  const owner = await account(context, "Username Code Owner Fixture");
  const recipientContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const recipient = await account(
      recipientContext,
      "Username Code Recipient Fixture",
    );
    const recipientPage = await recipientContext.newPage();
    const ownerCode = "/home?player=" + owner.username;
    await recipientPage.goto(ownerCode);
    const arrival = recipientPage.getByRole("dialog", {
      name: "Your next playing connection",
    });
    await arrival
      .getByRole("button", { name: "Ask to connect", exact: true })
      .click();
    await expect(arrival).toHaveCount(0);
    await recipientPage.goto(ownerCode);
    await expect(
      arrival.getByRole("button", { name: "Request pending", exact: true }),
    ).toBeDisabled();
    await expect(
      arrival.getByRole("button", { name: "Ask to connect", exact: true }),
    ).toHaveCount(0);
    await arrival
      .getByRole("button", { name: "Cancel friend request", exact: true })
      .click();
    await expect(
      arrival.getByRole("button", { name: "Ask to connect", exact: true }),
    ).toBeEnabled();
    await recipientPage.reload();
    await expect(
      arrival.getByRole("button", { name: "Ask to connect", exact: true }),
    ).toBeEnabled();
    await expect(arrival.getByRole("alert")).toHaveCount(0);
    await arrival
      .getByRole("button", { name: "Ask to connect", exact: true })
      .click();
    await expect(arrival).toHaveCount(0);
    await page.goto("/home?player=" + recipient.username);
    const incoming = page.getByRole("dialog", {
      name: "Your next playing connection",
    });
    await incoming
      .getByRole("link", { name: "Review friendship request", exact: true })
      .click();
    await expect(page).toHaveURL(/\/inbox$/);
    const request = page
      .locator(".ranking-row")
      .filter({ hasText: recipient.username });
    await request.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(request).toHaveCount(0);
    await recipientPage.goto(ownerCode);
    await expect(
      arrival.getByRole("button", { name: "Already connected", exact: true }),
    ).toBeDisabled();
    await expect(arrival.getByRole("alert")).toHaveCount(0);
    await page.goto("/home?player=" + owner.username);
    await expect(
      page.getByRole("button", {
        name: "This is your player code",
        exact: true,
      }),
    ).toBeDisabled();
  } finally {
    await recipientContext.close();
  }
});

test("invitation creation locks repeated actions and QR/copy fallback track the current link", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await account(context, "QR Continuity Fixture");
  await page.goto("/profile");
  await page.getByRole("button", { name: "Show my player code" }).click();
  const image = page.getByRole("img", {
    name: "QR code for this player connection link",
  });
  await expect(image).toBeVisible();
  const initialQR = await image.getAttribute("src");
  await page.getByText("Connection link", { exact: true }).click();
  const initialLink = await page.locator(".wrap-anywhere").innerText();
  await page.evaluate(() => {
    const snapshots: { link: string; image: string | null }[] = [];
    (window as any).__qrSnapshots = snapshots;
    const collect = () =>
      snapshots.push({
        link: document.querySelector(".wrap-anywhere")?.textContent || "",
        image:
          document.querySelector(".player-code img")?.getAttribute("src") ||
          null,
      });
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(document.querySelector("dialog")!, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    (window as any).__qrObserver = observer;
  });
  let release!: () => void;
  let captured!: () => void;
  let postCount = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/player-invites", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    postCount++;
    const response = await route.fetch();
    captured();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole("button", { name: "Create private invitation" })
      .click();
    await started;
    const create = page.getByRole("button", {
      name: "Creating private invitation…",
      exact: true,
    });
    await expect(create).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Copy link", exact: true }),
    ).toBeDisabled();
    await create.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    expect(postCount).toBe(1);
    release();
    await expect(
      page.getByRole("button", { name: "Revoke invitation", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".wrap-anywhere")).toContainText("/connect/");
    await expect(image).toBeVisible();
    await expect(image).not.toHaveAttribute("src", initialQR!);
    const invitationQR = await image.getAttribute("src");
    const invitationLink = await page.locator(".wrap-anywhere").innerText();
    await page
      .getByRole("button", { name: "Revoke invitation", exact: true })
      .click();
    await expect(page.locator(".wrap-anywhere")).toHaveText(initialLink);
    await expect(image).toHaveAttribute("src", initialQR!);
    const snapshots = await page.evaluate(() => {
      (window as any).__qrObserver.disconnect();
      return (window as any).__qrSnapshots as {
        link: string;
        image: string | null;
      }[];
    });
    expect(
      snapshots.filter(
        (s) => s.link === invitationLink && s.image === initialQR,
      ),
    ).toEqual([]);
    expect(
      snapshots.filter(
        (s) => s.link === initialLink && s.image === invitationQR,
      ),
    ).toEqual([]);

    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new DOMException("Fixture copy denied", "NotAllowedError");
          },
        },
      }),
    );
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Copy was unavailable");
    const linkInput = page.getByLabel("Select connection link", {
      exact: true,
    });
    await expect(linkInput).toHaveAttribute("readonly", "");
    await expect(linkInput).toHaveValue(initialLink);
    await linkInput.click();
    expect(
      await linkInput.evaluate((input) => {
        const field = input as HTMLInputElement;
        return (
          field.selectionStart === 0 &&
          field.selectionEnd === field.value.length
        );
      }),
    ).toBe(true);
  } finally {
    release();
  }
});

test("inbox fetch and declined invitations recover from failure without accepting or duplicating choices", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  const recipient = await account(context, "Inbox Recovery Fixture");
  const ownerContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  let release!: () => void;
  try {
    const owner = await account(ownerContext, "Request Owner Fixture");
    const ownerPage = await ownerContext.newPage();
    await change(ownerPage, owner, "/friends", { playerId: recipient.id });
    const circle = await change(ownerPage, owner, "/circles", {
      name: "Decline Fixture Group",
    });
    await change(ownerPage, owner, `/circles/${circle.id}/invite`, {
      playerId: recipient.id,
    });
    let failInbox = true;
    await page.route("**/api/inbox", async (route) => {
      if (failInbox)
        await route.fulfill({
          status: 503,
          json: { error: "Fixture requests are temporarily unavailable." },
        });
      else await route.continue();
    });
    await page.goto("/inbox");
    await expect(
      page.getByRole("button", { name: "Retry loading requests" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      "Fixture requests are temporarily unavailable.",
    );
    failInbox = false;
    await page.getByRole("button", { name: "Retry loading requests" }).click();
    const friendRow = page
      .locator(".ranking-row")
      .filter({ hasText: owner.username });
    await expect(
      friendRow.getByRole("button", { name: "Decline friend request" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry loading requests" }),
    ).toHaveCount(0);
    let failDecline = true;
    let deletions = 0;
    let captured!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      captured = resolve;
    });
    await page.route(`**/api/friends/${owner.id}`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      deletions++;
      if (failDecline) {
        failDecline = false;
        await route.fulfill({
          status: 503,
          json: { error: "Fixture decline could not be confirmed." },
        });
        return;
      }
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
    });
    await friendRow
      .getByRole("button", { name: "Decline friend request" })
      .click();
    await expect(page.locator(".form-error")).toHaveText(
      "Fixture decline could not be confirmed.",
    );
    await expect(friendRow).toBeVisible();
    await friendRow
      .getByRole("button", { name: "Decline friend request" })
      .click();
    await started;
    await expect(
      page.getByRole("button", { name: "Decline group invitation" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Mark updates read" }),
    ).toBeDisabled();
    release();
    await expect(friendRow).toHaveCount(0);
    await expect(page.locator(".form-error")).toHaveCount(0);
    expect(deletions).toBe(2);
    await page
      .getByRole("button", { name: "Decline group invitation" })
      .click();
    await expect(
      page.getByRole("button", { name: "Decline group invitation" }),
    ).toHaveCount(0);
    const inbox = await (await page.request.get("/api/inbox")).json();
    expect(inbox.friendRequests).toEqual([]);
    expect(inbox.circleInvites).toEqual([]);
    expect(inbox.agreements).toEqual([]);
  } finally {
    if (release) release();
    await ownerContext.close();
  }
});

test("group URLs survive reload and browser Back; choosing an owner requires separate confirmation", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  const owner = await account(context, "Group Navigation Owner Fixture");
  const memberContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const member = await account(
      memberContext,
      "Group Navigation Member Fixture",
    );
    const memberPage = await memberContext.newPage();
    const id = await group(page, owner, memberPage, member);
    const original = await (
      await page.request.get(`/api/circles/${id}`)
    ).json();
    await page.goto("/friends");
    await page
      .getByRole("button", {
        name: new RegExp(original.name + ".*accepted players"),
      })
      .click();
    await expect(page).toHaveURL(new RegExp("\\?circle=" + id + "$"));
    const heading = page
      .getByRole("heading", { name: original.name, exact: true })
      .first();
    await expect(heading).toBeVisible();
    await page.reload();
    await expect(heading).toBeVisible();
    await page.getByRole("button", { name: "Back to your friends" }).click();
    await expect(page).toHaveURL(/\/friends$/);
    await expect(
      page.getByRole("heading", { name: "Your circle", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp("\\?circle=" + id + "$"));
    await expect(heading).toBeVisible();

    let failGroup = true;
    await page.route(`**/api/circles/${id}`, async (route) => {
      if (route.request().method() === "GET" && failGroup)
        await route.fulfill({
          status: 503,
          json: { error: "Fixture group cannot load yet." },
        });
      else await route.continue();
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Retry loading this group" }),
    ).toBeVisible();
    failGroup = false;
    await page
      .getByRole("button", { name: "Retry loading this group" })
      .click();
    await expect(heading).toBeVisible();
    await expect(page.locator(".form-error")).toHaveCount(0);
    let transferPosts = 0;
    await page.route(`**/api/circles/${id}/owner`, async (route) => {
      transferPosts++;
      await route.continue();
    });
    await page
      .getByLabel("Transfer ownership", { exact: true })
      .selectOption(member.id);
    await expect(
      page.getByRole("button", { name: "Review ownership transfer" }),
    ).toBeEnabled();
    expect(transferPosts).toBe(0);
    expect(
      (await (await page.request.get(`/api/circles/${id}`)).json()).owner,
    ).toBe(owner.id);
    await page
      .getByRole("button", { name: "Review ownership transfer" })
      .click();
    const review = page.getByRole("dialog", {
      name: "Transfer circle ownership",
    });
    await expect(review).toContainText("give up ownership controls");
    await review.getByRole("button", { name: "Close dialog" }).click();
    expect(transferPosts).toBe(0);
    expect(
      (await (await page.request.get(`/api/circles/${id}`)).json()).owner,
    ).toBe(owner.id);
    await page
      .getByRole("button", { name: "Review ownership transfer" })
      .click();
    await review
      .getByRole("button", { name: "Confirm ownership transfer" })
      .click();
    await expect(review).toHaveCount(0);
    await expect(
      page.getByLabel("Transfer ownership", { exact: true }),
    ).toHaveCount(0);
    expect(transferPosts).toBe(1);
    expect(
      (await (await page.request.get(`/api/circles/${id}`)).json()).owner,
    ).toBe(member.id);
    await expect(heading).toBeVisible();
  } finally {
    await memberContext.close();
  }
});

test("group recap retry clears old errors and cancelled identity drafts never overwrite saved identity", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  const owner = await account(context, "Recap Recovery Owner Fixture");
  const memberContext = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const member = await account(
      memberContext,
      "Recap Recovery Member Fixture",
    );
    const memberPage = await memberContext.newPage();
    const id = await group(page, owner, memberPage, member);
    await page.goto(`/friends?circle=${id}`);
    await expect(
      page.getByRole("button", { name: "Edit group identity" }),
    ).toBeVisible();
    let failRecap = true;
    await page.route(`**/api/circles/${id}/recap?**`, async (route) => {
      if (failRecap) {
        failRecap = false;
        await route.fulfill({
          status: 503,
          json: { error: "Fixture recap is temporarily unavailable." },
        });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "30 days", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Retry group recap" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry group recap" }).click();
    await expect(
      page.getByText("published matches", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".form-error")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit group identity" }).click();
    const identityModal = page.getByRole("dialog", {
      name: "Make this circle yours",
    });
    await page.getByLabel("Group motto").fill("Unsubmitted fixture draft");
    await identityModal.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Edit group identity" }).click();
    await expect(page.getByLabel("Group motto")).toHaveValue("");
    let failSave = true;
    await page.route(`**/api/circles/${id}/identity`, async (route) => {
      if (failSave) {
        failSave = false;
        await route.fulfill({
          status: 503,
          json: { error: "Fixture identity save was not confirmed." },
        });
      } else await route.continue();
    });
    await page.getByLabel("Group motto").fill("Saved after retry");
    await page.getByRole("button", { name: "Save group identity" }).click();
    await expect(identityModal.getByRole("alert")).toHaveText(
      "Fixture identity save was not confirmed.",
    );
    expect(
      (
        await (
          await page.request.get(
            `/api/circles/${id}/recap?category=Singles&period=month`,
          )
        ).json()
      ).identity.tagline,
    ).toBe("");
    await page.getByRole("button", { name: "Save group identity" }).click();
    await expect(identityModal).toHaveCount(0);
    await expect(
      page.getByText("Saved after retry", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".form-error")).toHaveCount(0);
    await memberPage.goto(`/friends?circle=${id}`);
    await expect(
      memberPage.getByText("Saved after retry", { exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: "Edit group identity" }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByLabel("Transfer ownership", { exact: true }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("button", { name: "Invite to group", exact: true }),
    ).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
});
