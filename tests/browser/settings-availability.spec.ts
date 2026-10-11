import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function signup(page: Page) {
  await page.goto("/");
  await page.getByLabel("Your display name").fill("Availability Fixture");
  await page
    .getByLabel("Username", { exact: true })
    .fill("avail_" + randomUUID().slice(0, 8));
  await page
    .getByLabel("Password", { exact: true })
    .fill("Availability-fixture-2026!");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

test("failed passkey, research and device availability loads remain unknown and retry visibly", async ({
  page,
}) => {
  let fails = true;
  for (const endpoint of ["account/passkeys", "account/research", "push"]) {
    await page.route("**/api/" + endpoint, (route) =>
      fails
        ? route.fulfill({
            status: 503,
            json: { error: "Synthetic availability failure." },
          })
        : route.continue(),
    );
  }
  await signup(page);
  await settings(page);
  await expect(
    page.getByText("Your saved passkeys could not be checked."),
  ).toBeVisible();
  await expect(
    page.getByText("Your research choice could not be checked."),
  ).toBeVisible();
  await expect(
    page.getByText("Research participation is off.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Device alert availability could not be checked. Your SHUTTL inbox still works.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Checking notification availability…", { exact: true }),
  ).toHaveCount(0);
  fails = false;
  for (const name of [
    "Retry passkey controls",
    "Retry research choice",
    "Retry device alerts",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.getByLabel("Passkey label", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Research participation is off.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Device alerts are unavailable here. Your SHUTTL inbox still works.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic availability failure.", { exact: true }),
  ).toHaveCount(0);
});

test("a lost committed research response is checked before another consent choice", async ({
  page,
}) => {
  await signup(page);
  await settings(page);
  let fail = true;
  await page.route("**/api/account/research", async (route) => {
    if (fail && route.request().method() === "PUT") {
      fail = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Opt in to pilot view research" })
    .click();
  await expect(
    page.getByText("Your research choice could not be checked."),
  ).toBeVisible();
  await expect(
    page.getByText("Research participation is off.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Opt in to pilot view research" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry research choice" }).click();
  await expect(
    page.getByText("Research participation is on.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Withdraw and delete my view events" })
    .click();
  await expect(
    page.getByText("Research participation is off.", { exact: true }),
  ).toBeVisible();
});

test("pending passkey creation freezes its label and password", async ({
  page,
  context,
}) => {
  await signup(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await settings(page);
  await page
    .getByLabel("Current password to manage passkeys")
    .fill("Availability-fixture-2026!");
  await page.getByLabel("Passkey label").fill("Frozen fixture");
  let release!: () => void, captured!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (captured = r));
  await page.route("**/api/account/passkeys/options", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    captured();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole("button", { name: "Add a passkey", exact: true })
      .click();
    await started;
    await expect(page.getByLabel("Passkey label")).toBeDisabled();
    await expect(
      page.getByLabel("Current password to manage passkeys"),
    ).toBeDisabled();
    release();
    await expect(
      page.getByText("Frozen fixture", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Current password to manage passkeys")
      .fill("Availability-fixture-2026!");
    await page
      .locator(".passkey-choices .device-row")
      .filter({ hasText: "Frozen fixture" })
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(page.getByText("Frozen fixture", { exact: true })).toHaveCount(
      0,
    );
    expect(
      (await (await page.request.get("/api/account/passkeys")).json()).passkeys,
    ).toHaveLength(0);
  } finally {
    release();
    await cdp.send("WebAuthn.disable");
  }
});

test("lost committed passkey creation and removal require an authoritative read before more management", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await signup(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  let releaseCreate!: () => void,
    releaseRemove!: () => void,
    createCommitted!: () => void,
    removeCommitted!: () => void;
  const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    }),
    removeGate = new Promise<void>((resolve) => {
      releaseRemove = resolve;
    }),
    created = new Promise<void>((resolve) => {
      createCommitted = resolve;
    }),
    removed = new Promise<void>((resolve) => {
      removeCommitted = resolve;
    });
  let verifyCalls = 0,
    removeCalls = 0;
  await page.route("**/api/account/passkeys/verify", async (route) => {
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    verifyCalls++;
    createCommitted();
    await createGate;
    await route.abort("connectionfailed");
  });
  try {
    await settings(page);
    await page.getByLabel("Passkey label").fill("Unconfirmed fixture");
    await page
      .getByLabel("Current password to manage passkeys")
      .fill("Availability-fixture-2026!");
    await page
      .getByRole("button", { name: "Add a passkey", exact: true })
      .click();
    await created;
    await expect(page.getByLabel("Passkey label")).toBeDisabled();
    await expect(
      page.getByLabel("Current password to manage passkeys"),
    ).toBeDisabled();
    expect(
      (await (await page.request.get("/api/account/passkeys")).json()).passkeys,
    ).toHaveLength(1);
    releaseCreate();
    await expect(
      page.getByText("Your saved passkeys could not be checked.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add a passkey", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Retry passkey controls", exact: true })
      .click();
    await expect(
      page.getByText("Unconfirmed fixture", { exact: true }),
    ).toBeVisible();
    expect(verifyCalls).toBe(1);
    await page.route("**/api/account/passkeys/*", async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      removeCalls++;
      removeCommitted();
      await removeGate;
      await route.abort("connectionfailed");
    });
    await page
      .getByLabel("Current password to manage passkeys")
      .fill("Availability-fixture-2026!");
    await page
      .locator(".passkey-choices .device-row")
      .filter({ hasText: "Unconfirmed fixture" })
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await removed;
    await expect(
      page
        .locator(".passkey-choices")
        .getByRole("button", { name: "Remove", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Passkey label")).toBeDisabled();
    expect(
      (await (await page.request.get("/api/account/passkeys")).json()).passkeys,
    ).toHaveLength(0);
    releaseRemove();
    await expect(
      page.getByText("Your saved passkeys could not be checked.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add a passkey", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .locator(".passkey-choices")
        .getByRole("button", { name: "Remove", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Retry passkey controls", exact: true })
      .click();
    await expect(page.getByLabel("Passkey label")).toBeEnabled();
    await expect(
      page.getByText("Unconfirmed fixture", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".passkey-choices [role='alert']")).toHaveCount(
      0,
    );
    expect(removeCalls).toBe(1);
  } finally {
    releaseCreate();
    releaseRemove();
    await cdp.send("WebAuthn.disable");
  }
});

test("device alert choices freeze during saving and retry loads the confirmed preferences", async ({
  page,
}) => {
  await signup(page);
  const me = await (await page.request.get("/api/me")).json();
  await page.evaluate(
    (owner) => localStorage.setItem("shuttl:push:" + owner, "synthetic-device"),
    me.id,
  );
  const confirmed = {
    actions: true,
    updates: false,
    comparisons: false,
    quietHours: true,
  };
  await page.route("**/api/push", (route) =>
    route.fulfill({
      json: {
        configured: true,
        publicKey: "unused-synthetic-key",
        devices: [
          {
            id: "synthetic-device",
            preferences: confirmed,
            createdAt: "2026-10-10T12:00:00Z",
          },
        ],
      },
    }),
  );
  let release!: () => void, captured!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (captured = r));
  await page.route("**/api/push/synthetic-device", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      actions: false,
      updates: true,
      comparisons: true,
      quietHours: false,
    });
    Object.assign(confirmed, route.request().postDataJSON());
    captured();
    await gate;
    await route.fulfill({ json: { ok: true } });
  });
  await settings(page);
  await page
    .getByRole("checkbox", {
      name: "Result requests and invitations",
      exact: true,
    })
    .uncheck();
  await page
    .getByRole("checkbox", {
      name: "Supported friend lead changes",
      exact: true,
    })
    .check();
  await page.getByRole("checkbox", { name: /^Quiet hours:/ }).uncheck();
  await page
    .getByRole("checkbox", {
      name: "Published progress and corrections",
      exact: true,
    })
    .check();
  try {
    await page
      .getByRole("button", { name: "Save alert choices", exact: true })
      .click();
    await started;
    await expect(
      page.getByRole("checkbox", {
        name: "Published progress and corrections",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("checkbox", {
        name: "Supported friend lead changes",
        exact: true,
      }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByText("Your device alert choices are saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("checkbox", {
        name: "Published progress and corrections",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", {
        name: "Result requests and invitations",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", {
        name: "Supported friend lead changes",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /^Quiet hours:/ }),
    ).not.toBeChecked();
  } finally {
    release();
  }
});

test("playing insight retry preserves the selected category and period", async ({
  page,
}) => {
  await signup(page);
  let fails = true;
  await page.route("**/api/insights?**", (route) =>
    fails
      ? route.fulfill({
          status: 503,
          json: { error: "Synthetic insights failure." },
        })
      : route.continue(),
  );
  await settings(page);
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await page
    .getByRole("group", { name: "Rating category" })
    .getByRole("button", { name: "Doubles", exact: true })
    .click();
  await page.getByLabel("Your playing period").selectOption("90");
  await expect(
    page.getByRole("button", { name: "Retry playing insights" }),
  ).toBeVisible();
  fails = false;
  await page.getByRole("button", { name: "Retry playing insights" }).click();
  await expect(
    page.getByRole("heading", { name: "What your recorded play shows" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your playing period")).toHaveValue("90");
  await expect(
    page
      .getByRole("group", { name: "Rating category" })
      .getByRole("button", { name: "Doubles", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Synthetic insights failure.", { exact: true }),
  ).toHaveCount(0);
});

test("portrait removal preserves a failed portrait and blocks upload while its retry is pending", async ({
  page,
}) => {
  await signup(page);
  await settings(page);
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#214438";
    context.fillRect(0, 0, 256, 256);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Choose a portrait", { exact: true }).setInputFiles({
    name: "synthetic-portrait.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Remove portrait", exact: true }),
  ).toBeVisible();
  let fails = true,
    release!: () => void,
    captured!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (captured = r));
  await page.route("**/api/account/portrait", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    if (fails)
      return route.fulfill({
        status: 503,
        json: { error: "Synthetic portrait removal failure." },
      });
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    captured();
    await gate;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Remove portrait", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic portrait removal failure.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove portrait", exact: true }),
  ).toBeEnabled();
  fails = false;
  try {
    await page
      .getByRole("button", { name: "Remove portrait", exact: true })
      .click();
    await started;
    await expect(
      page.getByLabel("Choose a portrait", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Remove portrait", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Synthetic portrait removal failure.", { exact: true }),
    ).toHaveCount(0);
    release();
    await expect(
      page.getByRole("button", { name: "Remove portrait", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Remove portrait", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test("appearance stays usable for this visit when the browser denies local storage", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const operation of ["getItem", "setItem", "removeItem"])
      Object.defineProperty(Storage.prototype, operation, {
        configurable: true,
        value() {
          throw new DOMException("Synthetic storage denied.", "SecurityError");
        },
      });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signup(page);
  await settings(page);
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.getByLabel("Text size", { exact: true }).selectOption("large");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await expect(
    page.getByText(/Your appearance choices apply for this visit/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).last().click();
  await settings(page);
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "dark",
  );
  await page.getByLabel("Text size", { exact: true }).selectOption("normal");
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "light");
  expect(errors).toEqual([]);
});

test("notification enable and both disable buttons use harmless browser/provider stubs", async ({
  page,
}) => {
  await signup(page);
  // No actual permission dialog, service worker, subscription or provider is
  // contacted. This checks SHUTTL's controls against explicit synthetic stubs.
  await page.addInitScript(() => {
    const state = {
      permissionCalls: 0,
      registerCalls: 0,
      unsubscribeCalls: 0,
      subscribed: false,
    };
    (window as any).__notificationFixture = state;
    const subscription = {
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/synthetic",
        keys: { auth: "synthetic", p256dh: "synthetic" },
      }),
      unsubscribe: async () => {
        state.unsubscribeCalls++;
        state.subscribed = false;
        return true;
      },
    };
    const registration = {
      pushManager: {
        getSubscription: async () => (state.subscribed ? subscription : null),
        subscribe: async () => {
          state.subscribed = true;
          return subscription;
        },
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: async () => {
          state.registerCalls++;
          return registration;
        },
        ready: Promise.resolve(registration),
        getRegistration: async () => registration,
      },
    });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        requestPermission: async () => {
          state.permissionCalls++;
          return "granted";
        },
      },
    });
    if (!("PushManager" in window))
      Object.defineProperty(window, "PushManager", { value: class {} });
  });
  const preferences = {
    actions: true,
    updates: false,
    comparisons: false,
    quietHours: true,
  };
  let devices = [
    { id: "synthetic-other", preferences, createdAt: "2026-10-10T12:00:00Z" },
  ];
  let holdRead = false,
    failOtherDisable = true;
  let releaseRead!: () => void, readStarted!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const pendingRead = new Promise<void>((resolve) => {
    readStarted = resolve;
  });
  await page.route("**/api/push", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().subscription.endpoint).toContain(
        "synthetic",
      );
      devices.push({
        id: "synthetic-current",
        preferences: route.request().postDataJSON().preferences,
        createdAt: "2026-10-11T12:00:00Z",
      });
      await route.fulfill({ json: { id: "synthetic-current" } });
    } else {
      if (holdRead) {
        readStarted();
        await readGate;
      }
      await route.fulfill({
        json: { configured: true, publicKey: "AQID", devices },
      });
    }
  });
  await page.route("**/api/push/synthetic-*", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    const id = route.request().url().split("/").at(-1);
    if (id === "synthetic-other" && failOtherDisable) {
      failOtherDisable = false;
      return route.fulfill({
        status: 503,
        json: { error: "Synthetic device disable interruption." },
      });
    }
    devices = devices.filter((device) => device.id !== id);
    await route.fulfill({ json: { ok: true } });
  });
  await page.reload();
  await settings(page);
  const bootstrap = await page.evaluate(
    () => (window as any).__notificationFixture,
  );
  expect(bootstrap.permissionCalls).toBe(0);
  expect(bootstrap.subscribed).toBe(false);
  await page
    .getByRole("button", { name: "Enable alerts on this device", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Disable this device/ }),
  ).toBeVisible();
  const otherDisable = page.getByRole("button", {
    name: /^Disable alerts added /,
  });
  await expect(
    page.getByText(/Other saved alerts show when they were enabled/),
  ).toBeVisible();
  await expect(
    page.getByText("These choices apply to alerts enabled in this browser.", {
      exact: true,
    }),
  ).toBeVisible();
  await otherDisable.click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic device disable interruption.",
  );
  holdRead = true;
  await page
    .getByRole("button", { name: "Retry device alerts", exact: true })
    .click();
  await pendingRead;
  try {
    await expect(
      page.getByRole("button", { name: "Save alert choices", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /Disable this device/ }),
    ).toBeDisabled();
    await expect(otherDisable).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Result requests and invitations" }),
    ).toBeDisabled();
  } finally {
    releaseRead();
  }
  await expect(
    page.getByRole("button", { name: "Save alert choices", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await otherDisable.click();
  await expect(otherDisable).toHaveCount(0);
  await page.getByRole("button", { name: /Disable this device/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Enable alerts on this device",
      exact: true,
    }),
  ).toBeVisible();
  expect(devices).toHaveLength(0);
  expect(
    await page.evaluate(() => (window as any).__notificationFixture),
  ).toEqual({
    permissionCalls: 1,
    // main.tsx registers the app worker on load; enabling alerts registers the
    // same URL to ensure it is ready before the separate push subscription.
    registerCalls: bootstrap.registerCalls + 1,
    unsubscribeCalls: 1,
    subscribed: false,
  });
});
