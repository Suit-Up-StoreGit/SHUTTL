import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const password = "Account-journey-fixture-2026!";
const origin = "http://localhost:4174";
async function startSignup(page: Page, name: string) {
  const username = "acct_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await expect(
    page.getByRole("dialog", { name: "Keep a way back to your court" }),
  ).toBeVisible();
  return username;
}
async function finishSignup(page: Page) {
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
}
async function signup(page: Page, name: string) {
  const username = await startSignup(page, name);
  await finishSignup(page);
  return username;
}
async function fillResult(page: Page, opponent: string) {
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
  await page.getByLabel("Other side", { exact: true }).fill("17");
  await page
    .getByRole("checkbox", { name: /I confirm these sides and scores/ })
    .check();
}
function apiHeaders(csrf: string, requestKey: string = randomUUID()) {
  return { origin, "x-csrf-token": csrf, "idempotency-key": requestKey };
}

test("recovery acknowledgement cannot be bypassed and copy failure provides a selectable code", async ({
  page,
}) => {
  await startSignup(page, "Recovery acknowledgement fixture");
  const dialog = page.getByRole("dialog", {
    name: "Keep a way back to your court",
  });
  await expect(
    dialog.getByRole("button", { name: "Continue to my court" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(0, 0);
  await expect(dialog).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Fixture clipboard unavailable");
        },
      },
    }),
  );
  await dialog.getByRole("button", { name: "Copy recovery code" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Automatic copying is unavailable",
  );
  const code = dialog.getByLabel("Private recovery code");
  await code.focus();
  expect(
    await code.evaluate(
      (element: HTMLTextAreaElement) =>
        element.selectionStart === 0 &&
        element.selectionEnd === element.value.length,
    ),
  ).toBe(true);
  await finishSignup(page);
});

test("authentication mode changes retain username and clear stale errors and secret fields", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  const username = "missing_" + randomUUID().slice(0, 8);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Use my recovery code" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    username,
  );
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Private recovery code").fill("Private fixture code");
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Return to sign in" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Use my recovery code" }).click();
  await expect(page.getByLabel("Private recovery code")).toHaveValue("");
});

test("an interrupted committed registration offers sign-in without losing the private invitation or chosen username", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const fixture = await browser.newContext({ baseURL: origin });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const committed = new Promise<void>((resolve) => {
    captured = resolve;
  });
  try {
    const author = await fixture.request.post("/api/auth/register", {
      headers: { origin },
      data: {
        username: "invite_" + randomUUID().slice(0, 8),
        name: "Interrupted registration inviter fixture",
        password,
        adult: true,
        timezone: "UTC",
      },
    });
    expect(author.status()).toBe(200);
    const authorIdentity = await (await fixture.request.get("/api/me")).json();
    const invitation = await fixture.request.post("/api/guests", {
      headers: apiHeaders(authorIdentity.csrf),
      data: { name: "Interrupted registration invited fixture" },
    });
    expect(invitation.status()).toBe(200);
    const invitePath = (await invitation.json()).invitePath;
    await page.goto(invitePath);
    await page
      .getByRole("button", {
        name: "Sign in and keep this exact invitation",
        exact: true,
      })
      .click();
    const username = "acct_" + randomUUID().slice(0, 8);
    await page
      .getByLabel("Your display name")
      .fill("Interrupted registration recipient fixture");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
    let registered: any;
    await page.route("**/api/auth/register", async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      registered = await response.json();
      captured();
      await gate;
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Create my player identity", exact: true })
      .click();
    await committed;
    await expect(
      page.getByRole("button", {
        name: "Creating your player identity…",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.getByLabel("Username", { exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("alert")).toContainText(
      "Your account may already exist",
    );
    await page
      .getByRole("button", {
        name: "Sign in to check this account",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
      username,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(
      page.getByText(/Your private player invitation stays with you/),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(invitePath);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", {
        name: "This invitation is for me",
        exact: true,
      }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(invitePath);
    expect((await (await page.request.get("/api/me")).json()).id).toBe(
      registered.user.id,
    );
  } finally {
    release();
    await fixture.close();
  }
});

test("an interrupted committed recovery guides sign-in with the chosen new password and consumes the old code only once", async ({
  page,
}) => {
  const username = await startSignup(page, "Interrupted recovery fixture");
  const oldCode = await page.getByLabel("Private recovery code").inputValue();
  await finishSignup(page);
  const identity = await (await page.request.get("/api/me")).json();
  await page.goto("/profile?tab=settings");
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Use my recovery code", exact: true })
    .click();
  const newPassword = "Recovered-fixture-new-password-2026!";
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Private recovery code").fill(oldCode);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const committed = new Promise<void>((resolve) => {
    captured = resolve;
  });
  try {
    await page.route("**/api/auth/recover", async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      captured();
      await gate;
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Recover my account", exact: true })
      .click();
    await committed;
    await expect(
      page.getByRole("button", {
        name: "Recovering your account…",
        exact: true,
      }),
    ).toBeDisabled();
    release();
    await expect(page.getByRole("alert")).toContainText(
      "Your new password may already be active",
    );
    await page
      .getByRole("button", {
        name: "Sign in to check this account",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
      username,
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Private recovery code")).toHaveCount(0);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("heading", { name: "Your game.", exact: true }),
    ).toBeVisible();
    expect((await (await page.request.get("/api/me")).json()).id).toBe(
      identity.id,
    );
    const reused = await page.request.post("/api/auth/recover", {
      headers: { origin },
      data: {
        username,
        recoveryCode: oldCode,
        password: "Fixture-unused-third-password-2026!",
      },
    });
    expect(reused.status()).toBe(401);
  } finally {
    release();
  }
});

test("a submitted result freezes its exact payload and clears only its matching local draft", async ({
  page,
  browser,
}) => {
  await signup(page, "Frozen result author fixture");
  const context = await browser.newContext({ baseURL: origin });
  const other = await context.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const captured = new Promise<void>((resolve) => {
    started = resolve;
  });
  let payload: any;
  try {
    const opponent = await signup(other, "Frozen result opponent fixture");
    await fillResult(page, opponent);
    await page.route("**/api/results", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      payload = route.request().postDataJSON();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      started();
      await gate;
      await route.fulfill({ response });
    });
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await captured;
    const dialog = page.getByRole("dialog", {
      name: "Record a match",
      exact: true,
    });
    for (const label of [
      "Your side",
      "Other side",
      "Category",
      "Played format",
      "Started at",
      "Earlier rated agreement",
    ]) {
      await expect(dialog.getByLabel(label, { exact: true })).toBeDisabled();
    }
    await expect(
      dialog.getByRole("checkbox", { name: /I confirm these sides/ }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Close dialog" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Other side", { exact: true })).toHaveValue(
      "17",
    );
    expect(payload.games).toEqual([[21, 17]]);
    release();
    await expect(dialog).toHaveCount(0);
    const author = await (await page.request.get("/api/me")).json();
    expect(
      await page.evaluate(
        (owner) => localStorage.getItem("shuttl:draft:" + owner),
        author.id,
      ),
    ).toBeNull();
    const recorded = await (
      await page.request.get("/api/results/" + payload.unitId)
    ).json();
    expect(recorded.games).toEqual([[21, 17]]);
  } finally {
    release();
    await context.close();
  }
});

test("a lost response after commit shows the received result without duplicating it", async ({
  page,
  browser,
}) => {
  await signup(page, "Lost response author fixture");
  const context = await browser.newContext({ baseURL: origin });
  const other = await context.newPage();
  let payload: any;
  try {
    await fillResult(
      page,
      await signup(other, "Lost response opponent fixture"),
    );
    await page.route("**/api/results", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      payload = route.request().postDataJSON();
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(
      page.getByText("This match already reached SHUTTL.", { exact: true }),
    ).toBeVisible();
    const author = await (await page.request.get("/api/me")).json();
    const draft = await page.evaluate(
      (owner) => JSON.parse(localStorage.getItem("shuttl:draft:" + owner)!),
      author.id,
    );
    expect(draft.unitId).toBe(payload.unitId);
    await expect(
      page.getByRole("button", { name: "Send for exact-score approval" }),
    ).toBeDisabled();
    expect(
      (await (await page.request.get("/api/results")).json()).results,
    ).toHaveLength(1);
    await page
      .getByRole("button", { name: "Review received result", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Review the exact result" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: /Continue your draft/ }).click();
    await page.getByRole("button", { name: "Check submission status" }).click();
    await expect(
      page.getByText("This match already reached SHUTTL.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Remove local draft only" }).click();
    await page
      .getByRole("button", { name: "Remove local draft and close" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      await page.evaluate(
        (owner) => localStorage.getItem("shuttl:draft:" + owner),
        author.id,
      ),
    ).toBeNull();
    expect(
      (await page.request.get("/api/results/" + payload.unitId)).ok(),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test("an uncertain draft freezes edits and a legacy edited retry reveals the original received score", async ({
  page,
  browser,
}) => {
  await signup(page, "Edited retry author fixture");
  const context = await browser.newContext({ baseURL: origin });
  const other = await context.newPage();
  let originalPayload: any,
    originalKey = "",
    first = true;
  try {
    await fillResult(
      page,
      await signup(other, "Edited retry opponent fixture"),
    );
    await page.route("**/api/results", async (route) => {
      if (route.request().method() !== "POST" || !first) {
        await route.continue();
        return;
      }
      first = false;
      originalPayload = route.request().postDataJSON();
      originalKey = route.request().headers()["idempotency-key"];
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "may already have reached SHUTTL",
    );
    await expect(
      page.getByRole("button", { name: "Discard local draft" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Other side", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Other side", { exact: true })).toHaveValue(
      "17",
    );
    const author = await (await page.request.get("/api/me")).json();
    const lateAccepted = await page.request.post("/api/results", {
      headers: apiHeaders(author.csrf, originalKey),
      data: originalPayload,
    });
    expect(lateAccepted.ok()).toBe(true);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(
      page.getByRole("dialog", { name: "Record a match", exact: true }),
    ).toHaveCount(0);
    // Older app versions permitted score edits after an ambiguous submission.
    // Restore such a local fixture while retaining its original immutable IDs.
    await page.evaluate((owner) => {
      const key = "shuttl:draft:" + owner;
      const draft = JSON.parse(localStorage.getItem(key)!);
      draft.scores = [["21", "18"]];
      localStorage.setItem(key, JSON.stringify(draft));
    }, author.id);
    await page.getByRole("button", { name: /Continue your draft/ }).click();
    await expect(page.getByLabel("Other side", { exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: /I confirm these sides/ }).check();
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(
      page.getByText("This match already reached SHUTTL.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Other side", { exact: true })).toHaveValue(
      "18",
    );
    await expect(page.locator(".notice .score-games")).toContainText("17");
    const draft = await page.evaluate(
      (owner) => JSON.parse(localStorage.getItem("shuttl:draft:" + owner)!),
      author.id,
    );
    expect(draft.unitId).toBe(originalPayload.unitId);
    expect(draft.requestKey).toBe(originalKey);
    expect(draft.scores).toEqual([["21", "18"]]);
    expect(
      (await (await page.request.get("/api/results")).json()).results,
    ).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test("an unsubmitted draft can be discarded explicitly and a share creation freezes its selected privacy choices", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await signup(page, "Share selection author fixture");
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await page.getByRole("button", { name: /Record a match/ }).click();
  await page.getByLabel("Other side", { exact: true }).fill("17");
  await page
    .getByRole("button", { name: "Discard local draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard draft and start fresh" })
    .click();
  await expect(page.getByLabel("Other side", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const context = await browser.newContext({ baseURL: origin });
  const other = await context.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const captured = new Promise<void>((resolve) => {
    started = resolve;
  });
  let sharePayload: any;
  try {
    await signup(other, "Share selection opponent fixture");
    const author = await (await page.request.get("/api/me")).json();
    const opponent = await (await other.request.get("/api/me")).json();
    for (let index = 0; index < 5; index++) {
      const submitted = await page.request.post("/api/results", {
        headers: apiHeaders(author.csrf),
        data: {
          unitId: randomUUID(),
          category: "Singles",
          format: "ONE_21",
          roster: [author.id, opponent.id],
          games: [[21, 17]],
          playedAt: new Date(Date.now() - 120000 + index * 15000).toISOString(),
          scopeId: null,
          agree: true,
        },
      });
      expect(submitted.ok()).toBe(true);
      const unit = (await submitted.json()).id;
      const result = await (
        await other.request.get("/api/results/" + unit)
      ).json();
      expect(
        (
          await other.request.post("/api/results/" + unit + "/approve", {
            headers: apiHeaders(opponent.csrf),
            data: { revisionId: result.revisionId, agree: true },
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
          headers: apiHeaders(author.csrf),
          data: { ...privacy, publicName: true },
        })
      ).ok(),
    ).toBe(true);
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/me")).json()).ratings.find(
            (rating: any) => rating.category === "Singles",
          ).score,
        { timeout: 15000 },
      )
      .not.toBeNull();
    await page.reload();
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page
      .getByRole("button", { name: /Record a match|Continue your draft/ })
      .click();
    await page.getByText("Use a recent lineup", { exact: true }).click();
    await page.locator(".roster-shortcut").first().click();
    await expect(
      page.locator(".picked-player").filter({ hasText: opponent.username }),
    ).toHaveCount(1);
    await page.getByLabel("Your side", { exact: true }).fill("21");
    await page.getByLabel("Other side", { exact: true }).fill("17");
    await page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page
      .getByRole("button", { name: /Record a match|Continue your draft/ })
      .click();
    await expect(
      page.getByText("Use a recent lineup", { exact: true }),
    ).toBeVisible();
    await page.getByText("Use a recent lineup", { exact: true }).click();
    await page.locator(".roster-shortcut").first().click();
    await expect(
      page.locator(".picked-player").filter({ hasText: opponent.username }),
    ).toHaveCount(1);
    await expect(page.getByLabel("Your side", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Other side", { exact: true })).toHaveValue(
      "",
    );
    await expect(
      page.getByRole("checkbox", { name: /I confirm these sides and scores/ }),
    ).not.toBeChecked();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Share my progress", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /Include my public name/ })
      .check();
    await page.getByLabel("Image shape").selectOption("feed");
    await page.route("**/api/shares", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      sharePayload = route.request().postDataJSON();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      started();
      await gate;
      await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Create a shareable link" }).click();
    await captured;
    const dialog = page.getByRole("dialog", { name: "A number worth earning" });
    for (const label of ["Your story", "Image shape"])
      await expect(dialog.getByLabel(label)).toBeDisabled();
    await expect(
      dialog.getByRole("checkbox", { name: /Include my public name/ }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("checkbox", { name: /Include my declared district/ }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Doubles", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Close dialog" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    release();
    await expect(page.getByLabel("Your public snapshot link")).toHaveValue(
      /\/share\//,
    );
    expect(sharePayload).toMatchObject({
      category: "Singles",
      includeName: true,
      includeDistrict: false,
      template: "passport",
    });
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Fixture clipboard unavailable");
          },
        },
      }),
    );
    await dialog
      .getByRole("button", { name: "Copy link", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("copy it manually");
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = function (callback) {
        callback(null);
      };
    });
    await dialog
      .getByRole("button", { name: "Download my rating snapshot" })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "image could not be prepared",
    );
    await expect(dialog.getByLabel("Your public snapshot link")).toHaveValue(
      /\/share\//,
    );
  } finally {
    release();
    await context.close();
  }
});
