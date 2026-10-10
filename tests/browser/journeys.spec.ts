import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function signup(page: Page, name: string) {
  const username = "ui_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Ui-test-password-2026!");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your game.",
  );
  return username;
}
test("five distinct home concepts fit phone and desktop, with separate Mixed state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 430, 1366])
    for (const concept of [
      "passport",
      "court",
      "circle",
      "arena",
      "editorial",
    ]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/design?concept=" + concept);
      await page.locator(".rating-number").waitFor();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Mixed", exact: true }).click();
      await expect(page.locator(".rating-number")).toHaveText("—");
      await expect(page.locator("svg[role=img]")).toHaveCount(0);
    }
  expect(errors).toEqual([]);
});
test("signup, local draft offline retry, cross-account Singles approval and category history", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page, "UI Court Player");
  const otherContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      baseURL: "http://127.0.0.1:4174",
    }),
    other = await otherContext.newPage();
  try {
    const opponent = await signup(other, "UI Opponent");
    await page.getByRole("button", { name: "Singles", exact: true }).click();
    await page.getByRole("button", { name: /Record a result/ }).click();
    await page
      .getByRole("button", { name: "Choose player", exact: true })
      .click();
    await page.getByLabel("Username or public display name").fill(opponent);
    await page
      .getByRole("button", { name: new RegExp("UI Opponent|@" + opponent) })
      .click();
    await page.getByLabel("Your side", { exact: true }).fill("21");
    await page.getByLabel("Other side", { exact: true }).fill("18");
    await page
      .getByRole("checkbox", { name: /I confirm these sides and scores/ })
      .check();
    await page.context().setOffline(true);
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(page.getByRole("alert")).toContainText("offline");
    await page.context().setOffline(false);
    await page
      .getByRole("button", { name: "Send for exact-score approval" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await other.getByRole("button", { name: "Open your inbox" }).click();
    await other.getByRole("button", { name: "Open this exact result" }).click();
    await other
      .getByRole("checkbox", { name: /These are the correct sides/ })
      .check();
    await other
      .getByRole("button", { name: "Confirm this exact score" })
      .click();
    await expect(
      other.getByText("Rating published", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await expect(
      page.locator(".profile-rating-line").filter({ hasText: "Singles" }),
    ).toContainText("1 confirmed results");
    await expect(
      page.locator(".profile-rating-line").filter({ hasText: "Doubles" }),
    ).toContainText("0 confirmed results");
    expect(errors).toEqual([]);
  } finally {
    await otherContext.close();
  }
});
test("profile preferences survive refresh and a draft survives navigation", async ({
  page,
}) => {
  await signup(page, "UI Private Player");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page
    .getByLabel("Declared district", { exact: true })
    .selectOption("Tampines");
  await page.getByRole("button", { name: "Save my preferences" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await expect(
    page.getByLabel("Declared district", { exact: true }),
  ).toHaveValue("Tampines");
  await page.getByRole("button", { name: "Home", exact: true }).last().click();
  await page.getByRole("button", { name: /Record a result/ }).click();
  await page.getByLabel("Your side", { exact: true }).fill("21");
  await page.getByLabel("Other side", { exact: true }).fill("17");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Record a result/ }).click();
  await expect(page.getByLabel("Other side", { exact: true })).toHaveValue(
    "17",
  );
});
