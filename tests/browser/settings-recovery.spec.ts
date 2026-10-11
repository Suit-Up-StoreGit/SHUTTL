import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function settings(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your display name").fill("Settings Fixture");
  await page
    .getByLabel("Username", { exact: true })
    .fill("set_" + randomUUID().slice(0, 8));
  await page
    .getByLabel("Password", { exact: true })
    .fill("Settings-fixture-2026!");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

test("preferences show unsaved state, freeze the pending payload, and survive reload", async ({
  page,
}) => {
  await settings(page);
  await expect(
    page.getByRole("button", { name: "Save my preferences" }),
  ).toBeDisabled();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Saved Preferences Fixture");
  await expect(
    page.getByText("You have unsaved preferences.", { exact: true }),
  ).toBeVisible();
  let release!: () => void, captured!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (captured = r));
  await page.route("**/api/profile", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    captured();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Save my preferences" }).click();
    await started;
    await expect(
      page.getByLabel("Display name", { exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel(/^Public display name/)).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Saving preferences…" }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByText("Your preferences are saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      "Saved Preferences Fixture",
    );
    await expect(
      page.getByRole("button", { name: "Save my preferences" }),
    ).toBeDisabled();
  } finally {
    release();
  }
});

test("private control load failures and failed revocation remain visible and recoverable", async ({
  page,
}) => {
  let loadFails = true,
    revokeFails = true;
  await page.route("**/api/my-shares", (route) =>
    route.fulfill(
      loadFails
        ? {
            status: 503,
            json: { error: "Synthetic private links load failure." },
          }
        : {
            json: {
              shares: [
                {
                  id: "synthetic-share",
                  category: "Singles",
                  score: 1500,
                  asOf: "2026-10-10T12:00:00Z",
                  revoked: false,
                },
              ],
            },
          },
    ),
  );
  await page.route("**/api/shares/synthetic-share", (route) =>
    route.fulfill(
      revokeFails
        ? { status: 503, json: { error: "Synthetic revocation failure." } }
        : { json: { ok: true } },
    ),
  );
  await settings(page);
  await expect(
    page.getByRole("button", { name: "Retry account controls" }),
  ).toBeVisible();
  loadFails = false;
  await page.getByRole("button", { name: "Retry account controls" }).click();
  await expect(
    page.getByRole("button", { name: "Revoke", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(
    page.getByText("Synthetic revocation failure.", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke", exact: true }),
  ).toBeVisible();
  revokeFails = false;
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Revoke", exact: true }),
  ).toHaveCount(0);
});
