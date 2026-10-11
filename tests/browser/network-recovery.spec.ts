import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function signup(page: Page) {
  const username = "net_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill("Connection Fixture");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Network-fixture-2026!");
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

for (const endpoint of ["me", "dashboard"]) {
  test(`a ${endpoint} startup failure offers retry without presenting a new account`, async ({
    page,
  }) => {
    await signup(page);
    let failing = true;
    await page.route(`**/api/${endpoint}`, async (route) => {
      if (failing) {
        await route.fulfill({
          status: 503,
          json: { error: "Synthetic temporary service failure." },
        });
      } else {
        await route.continue();
      }
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "We couldn’t load your court." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create my player identity" }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Your account has not been reset. Reconnect and try again.",
        { exact: true },
      ),
    ).toBeVisible();
    failing = false;
    await page.getByRole("button", { name: "Retry loading my court" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your game.",
    );
    await expect(
      page.getByRole("button", { name: "Create my player identity" }),
    ).toHaveCount(0);
  });
}

test("request loading failures are recoverable and do not masquerade as an empty inbox or agreement list", async ({
  page,
}) => {
  await signup(page);
  let failing = true;
  await page.route("**/api/inbox", async (route) => {
    if (failing) {
      await route.fulfill({
        status: 503,
        json: { error: "Synthetic request loading failure." },
      });
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Open your inbox" }).click();
  await expect(
    page.getByRole("button", { name: "Retry loading requests" }),
  ).toBeVisible();
  await expect(
    page.getByText("No result needs chasing", { exact: true }),
  ).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry loading requests" }).click();
  await expect(
    page.getByRole("heading", { name: "Your inbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No result needs chasing", { exact: true }),
  ).toBeVisible();

  // A fresh page removes previously loaded inbox data, so this exercises the
  // initial agreement failure rather than a refresh of cached requests.
  failing = true;
  await page.goto("/agreements");
  await expect(
    page.getByRole("button", { name: "Retry loading requests" }),
  ).toBeVisible();
  await expect(
    page.getByText("Choose before you play", { exact: true }),
  ).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry loading requests" }).click();
  await expect(
    page.getByRole("heading", { name: "Rated agreements", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Choose before you play", { exact: true }),
  ).toBeVisible();
});

function result(category: "Singles" | "Doubles", name: string) {
  const players = Array.from(
    { length: category === "Singles" ? 2 : 4 },
    (_, index) => ({
      id: randomUUID(),
      name: index === 0 ? name : `Synthetic Opponent ${index}`,
      username: `synthetic_${index}`,
    }),
  );
  return {
    id: randomUUID(),
    category,
    status: "rated",
    playedAt: "2026-10-10T12:00:00.000Z",
    players,
    games: [[21, 17]],
    ownProgress: { count: 1 },
  };
}

test("a delayed older-history response cannot enter a newly selected category", async ({
  page,
}) => {
  await signup(page);
  const initial = result("Doubles", "Doubles Initial Fixture");
  const stale = result("Doubles", "Doubles Stale Fixture");
  const current = result("Singles", "Singles Current Fixture");
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/history?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("before")) {
      captured();
      await gate;
      await route.fulfill({
        json: { results: [stale], next: null },
        headers: { "x-delayed-history-fixture": "1" },
      });
    } else {
      await route.fulfill({
        json:
          url.searchParams.get("category") === "Singles"
            ? { results: [current], next: null }
            : { results: [initial], next: "synthetic-before-cursor" },
      });
    }
  });
  try {
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      page
        .locator(".result-card")
        .filter({ hasText: "Doubles Initial Fixture" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Load older results" }).click();
    await started;
    await page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true })
      .click();
    await expect(
      page
        .locator(".result-card")
        .filter({ hasText: "Singles Current Fixture" }),
    ).toBeVisible();
    const delayed = page.waitForResponse(
      (response) => response.headers()["x-delayed-history-fixture"] === "1",
    );
    release();
    await (await delayed).finished();
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    await expect(page.locator(".result-card")).toHaveCount(1);
    await expect(page.locator(".result-card")).toContainText(
      "Singles Current Fixture",
    );
    await expect(page.getByText(/Doubles Stale Fixture/)).toHaveCount(0);
  } finally {
    release();
  }
});

test("failed history loading offers a visible retry and retains the selected category", async ({
  page,
}) => {
  await signup(page);
  let failing = true;
  const requestedCategories: string[] = [];
  await page.route("**/api/history?**", async (route) => {
    requestedCategories.push(
      new URL(route.request().url()).searchParams.get("category") || "",
    );
    await route.fulfill(
      failing
        ? { status: 503, json: { error: "Synthetic history loading failure." } }
        : {
            json: {
              results: [result("Singles", "Recovered History Fixture")],
              next: null,
            },
          },
    );
  });
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("group", { name: "Rating category" })
    .getByRole("button", { name: "Singles", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry match history" }),
  ).toBeVisible();
  await expect(
    page.getByText("No matching results", { exact: true }),
  ).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry match history" }).click();
  await expect(page.locator(".result-card")).toContainText(
    "Recovered History Fixture",
  );
  expect(requestedCategories.at(-1)).toBe("Singles");
  await expect(
    page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Singles", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
