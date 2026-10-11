import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("a lost committed circle creation keeps its frozen name and recovers the same group after navigation and reload", async ({
  page,
}) => {
  test.setTimeout(90000);
  const username = "group_" + randomUUID().slice(0, 8);
  const registered = await page.request.post("/api/auth/register", {
    headers: { origin: "http://localhost:4174" },
    data: {
      username,
      name: "Group Retry Owner Fixture",
      password: "Group-retry-persona-2026!",
      adult: true,
    },
  });
  expect(registered.status(), await registered.text()).toBe(200);
  const owner = (await registered.json()).user;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/friends");
  await page
    .getByRole("button", { name: "Create a circle", exact: true })
    .click();
  const name = "Lost Response Existing Group Fixture";
  await page.getByLabel("Circle name", { exact: true }).fill(name);
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  let loseFirst = true;
  let originalGroup = "";
  const attempts: { key: string; name: string }[] = [];
  await page.route("**/api/circles", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push({
      key: route.request().headers()["idempotency-key"],
      name: route.request().postDataJSON().name,
    });
    if (loseFirst) {
      loseFirst = false;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      originalGroup = (await committed.json()).id;
      captured();
      await gate;
      return route.abort("connectionfailed");
    }
    return route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Create comparison circle", exact: true })
      .click();
    await started;
    const pending = page.getByRole("button", {
      name: "Creating your circle…",
      exact: true,
    });
    await expect(pending).toBeDisabled();
    await expect(
      page.getByLabel("Circle name", { exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", {
        name: "A circle for your group",
        exact: true,
      }),
    ).toBeVisible();
    await pending.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    expect(attempts).toHaveLength(1);
    release();
    await expect(
      page.getByRole("button", { name: "Recover this circle", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Circle name", { exact: true })).toHaveValue(
      name,
    );
    await expect(
      page.getByLabel("Circle name", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(/This circle request has not been confirmed/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Circle", exact: true })
      .last()
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Create a circle", exact: true })
      .click();
    await expect(page.getByLabel("Circle name", { exact: true })).toHaveValue(
      name,
    );
    await expect(
      page.getByLabel("Circle name", { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Recover this circle", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name, exact: true }).first(),
    ).toBeVisible();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(new URL(page.url()).searchParams.get("circle")).toBe(originalGroup);
    const dashboard = await (await page.request.get("/api/dashboard")).json();
    expect(
      dashboard.circles.filter((circle: any) => circle.name === name),
    ).toHaveLength(1);
    expect(dashboard.circles[0].id).toBe(originalGroup);
    expect(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        "shuttl:pending-circle:" + owner.id,
      ),
    ).toBeNull();
    await page
      .getByRole("button", { name: "Leave this circle", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your circle", exact: true }).first(),
    ).toBeVisible();
    const identity = await (await page.request.get("/api/me")).json();
    const closedReplay = await page.request.post("/api/circles", {
      headers: {
        origin: "http://localhost:4174",
        "x-csrf-token": identity.csrf,
        "idempotency-key": attempts[0].key,
      },
      data: { name },
    });
    expect(closedReplay.status()).toBe(409);
    const closedDashboard = await (
      await page.request.get("/api/dashboard")
    ).json();
    expect(closedDashboard.circles).toHaveLength(0);
    expect(
      (await page.request.get("/api/circles/" + originalGroup)).status(),
    ).toBe(403);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
