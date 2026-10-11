import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const originalPassword = "Persona-privacy-2026!";
const replacementPassword = "Persona-recovered-2026!";

async function saveShownCode(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Keep a way back to your court",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const code = await dialog
    .getByLabel("Private recovery code", { exact: true })
    .inputValue();
  expect(code.length).toBeGreaterThan(20);
  await expect(
    dialog.getByRole("button", { name: "Continue to my court", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Copy recovery code", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          async (expectedCode) =>
            (await navigator.clipboard.readText()) === expectedCode,
          code,
        ),
      { timeout: 5000 },
    )
    .toBe(true);
  await dialog
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await dialog
    .getByRole("button", { name: "Continue to my court", exact: true })
    .click();
  return code;
}

async function signup(page: Page, name: string) {
  const username = "person_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(originalPassword);
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  const code = await saveShownCode(page);
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
  return { username, code };
}

async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

async function signOut(page: Page) {
  await settings(page);
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", {
      name: "Create my player identity",
      exact: true,
    }),
  ).toBeVisible();
}

async function signIn(page: Page, username: string, password: string) {
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

test("returning and privacy personas use password recovery, block controls, export and deletion through actual UI", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const returning = await signup(page, "Returning Privacy Fixture");
  await signOut(page);
  await signIn(page, returning.username, originalPassword);
  await settings(page);
  await page
    .getByRole("button", {
      name: "Create a new private recovery code",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(originalPassword);
  await page
    .getByRole("button", { name: "Generate my new recovery code", exact: true })
    .click();
  const rotatedCode = await saveShownCode(page);
  expect(rotatedCode).not.toBe(returning.code);
  await signOut(page);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Use my recovery code", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(returning.username);
  await page
    .getByLabel("Private recovery code", { exact: true })
    .fill(rotatedCode);
  await page
    .getByLabel("New password", { exact: true })
    .fill(replacementPassword);
  await page
    .getByRole("button", { name: "Recover my account", exact: true })
    .click();
  const nextCode = await saveShownCode(page);
  expect(nextCode).not.toBe(rotatedCode);
  await signOut(page);
  await signIn(page, returning.username, replacementPassword);
  const actor = await (await page.request.get("/api/me")).json();

  const opponentContext = await browser.newContext({
    baseURL: "http://localhost:4174",
  });
  await opponentContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  const opponent = await opponentContext.newPage();
  try {
    const privacy = await signup(opponent, "Other Privacy Fixture");
    const opponentIdentity = await (
      await opponent.request.get("/api/me")
    ).json();
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page.getByRole("button", { name: /Record a result/ }).click();
    await page
      .getByRole("button", { name: "Choose player", exact: true })
      .click();
    await page
      .getByLabel("Username or public display name")
      .fill(privacy.username);
    await page
      .getByRole("button", { name: new RegExp("@" + privacy.username) })
      .click();
    await page.getByLabel("Your side", { exact: true }).fill("21");
    await page.getByLabel("Other side", { exact: true }).fill("17");
    await page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await page
      .getByRole("button", {
        name: "Send for exact-score approval",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await opponent
      .getByRole("button", { name: "Open your inbox", exact: true })
      .click();
    await opponent
      .getByRole("button", { name: "Open this exact result", exact: true })
      .click();
    await opponent
      .getByRole("checkbox", { name: /These are the correct sides/ })
      .check();
    await opponent
      .getByRole("button", { name: "Confirm this exact score", exact: true })
      .click();
    await expect(
      opponent.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const dashboard = await (
      await opponent.request.get("/api/dashboard")
    ).json();
    const match = dashboard.results.find((result: any) =>
      result.players.some((player: any) => player.id === actor.id),
    );
    expect(match).toBeTruthy();

    await settings(page);
    await page
      .getByRole("button", { name: "Block a player", exact: true })
      .click();
    await page
      .getByLabel("Username or public display name")
      .fill(privacy.username);
    await page
      .getByRole("button", { name: new RegExp("@" + privacy.username) })
      .click();
    await expect(
      page.getByText("Player blocked. Valid historical results remain.", {
        exact: true,
      }),
    ).toBeVisible();
    const blocked = await (await page.request.get("/api/blocks")).json();
    expect(blocked.players.map((p: any) => p.id)).toContain(
      opponentIdentity.id,
    );
    expect(
      (
        await opponent.request.get(
          "/api/players/by-username/" + returning.username,
        )
      ).status(),
    ).toBe(404);
    await page.getByRole("button", { name: "Unblock", exact: true }).click();
    await expect(
      page.getByText("Player unblocked.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unblock", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await opponent.request.get(
          "/api/players/by-username/" + returning.username,
        )
      ).status(),
    ).toBe(200);

    const downloading = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Export my account data", exact: true })
      .click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("shuttl-account.json");
    expect(await download.failure()).toBeNull();
    const path = await download.path();
    expect(path).not.toBeNull();
    const raw = readFileSync(path!, "utf8");
    const exported = JSON.parse(raw);
    expect(exported.profile.id).toBe(actor.id);
    expect(exported.results.map((result: any) => result.id)).toContain(
      match.id,
    );
    for (const secret of [
      originalPassword,
      replacementPassword,
      returning.code,
      rotatedCode,
      nextCode,
      privacy.code,
    ])
      expect(raw).not.toContain(secret);
    for (const field of ["password", "recovery", "csrf", "sessions"])
      expect(Object.hasOwn(exported.profile, field)).toBe(false);

    await page
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Delete your player account",
      exact: true,
    });
    await expect(dialog).toContainText("former-player reference");
    await dialog
      .getByLabel("Your password", { exact: true })
      .fill(replacementPassword);
    await dialog.getByLabel("Type DELETE", { exact: true }).fill("DELETE");
    await dialog
      .getByRole("button", {
        name: "Delete my account permanently",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Create my player identity",
        exact: true,
      }),
    ).toBeVisible();
    expect((await page.request.get("/api/me")).status()).toBe(401);
    expect((await page.request.get("/api/account/export")).status()).toBe(401);
    const preserved = await opponent.request.get("/api/results/" + match.id);
    expect(preserved.status()).toBe(200);
    const preservedResult = await preserved.json();
    expect(preservedResult.status).toBe("rated");
    expect(
      preservedResult.players.find((p: any) => p.id === actor.id).name,
    ).toBe("Former player");
    expect(preservedResult.games).toEqual([[21, 17]]);
    expect(
      (
        await opponent.request.get(
          "/api/players/by-username/" + returning.username,
        )
      ).status(),
    ).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await opponentContext.close();
  }
});
