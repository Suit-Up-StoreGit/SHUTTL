import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
async function signup(page: Page, name: string) {
  const username = "new_" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByLabel("Your display name").fill(name);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Community-browser-2026!");
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
test("a real virtual-authenticator passkey registers, signs in and remains optional", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await signup(page, "Passkey Fixture");
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
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Current password to manage passkeys")
    .fill("Community-browser-2026!");
  await page.getByLabel("Passkey label").fill("Virtual fixture");
  await page
    .getByRole("button", { name: "Add a passkey", exact: true })
    .click();
  await expect(
    page.getByText("Virtual fixture", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Sign in with a passkey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your game.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("Virtual fixture", { exact: true }),
  ).toBeVisible();
  await cdp.send("WebAuthn.disable");
});
test("group identity and recap load, QR generates, and an invitation survives recipient signup", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const username = await signup(page, "Group Owner Fixture");
  await page
    .getByRole("button", { name: "Circle", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Create your circle", exact: true })
    .click();
  await page.getByLabel("Circle name").fill("Fixture Existing Court");
  await page.getByRole("button", { name: "Create comparison circle" }).click();
  await expect(
    page
      .getByRole("heading", { name: "Fixture Existing Court", exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit group identity" }).click();
  await page.getByLabel("Group motto").fill("Every rally together");
  await page.getByLabel("Group crest", { exact: true }).selectOption("rally");
  await page.getByRole("button", { name: "Save group identity" }).click();
  await expect(
    page.getByText("Every rally together", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page
    .getByRole("button", { name: "Circle", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: /Fixture Existing Court.*accepted players/ })
    .click();
  await expect(
    page.getByText("Every rally together", { exact: true }),
  ).toBeVisible();
  const groupAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    groupAudit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Show my player code" }).click();
  await expect(
    page.getByRole("img", { name: "QR code for this player connection link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create private invitation" }).click();
  await page.getByText("Connection link", { exact: true }).click();
  const link = await page.locator(".wrap-anywhere").innerText();
  expect(link).toContain("/connect/");
  const recipientContext = await browser.newContext(),
    recipient = await recipientContext.newPage();
  try {
    await recipient.goto(link);
    await expect(
      recipient.getByRole("heading", { name: username + " invited you." }),
    ).toBeVisible();
    await recipient
      .getByRole("button", { name: "Join and keep this invitation" })
      .click();
    await recipient.getByLabel("Your display name").fill("Recipient Fixture");
    await recipient
      .getByLabel("Username", { exact: true })
      .fill("recv_" + randomUUID().slice(0, 8));
    await recipient
      .getByLabel("Password", { exact: true })
      .fill("Community-browser-2026!");
    await recipient.getByRole("checkbox", { name: /I am 18 or older/ }).check();
    await recipient
      .getByRole("button", { name: "Create my player identity" })
      .click();
    await recipient
      .getByRole("checkbox", {
        name: /I have saved my recovery code privately/,
      })
      .check();
    await recipient
      .getByRole("button", { name: "Continue to my court" })
      .click();
    await recipient
      .getByRole("button", { name: "Request this connection" })
      .click();
    await expect(
      recipient.getByText("Your request is with the inviter.", { exact: true }),
    ).toBeVisible();
  } finally {
    await recipientContext.close();
  }
  await page.getByRole("button", { name: "Revoke invitation" }).click();
  await expect(
    page.getByRole("button", { name: "Create private invitation" }),
  ).toBeVisible();
});
test("global location, optional portrait and research withdrawal work through visible settings", async ({
  page,
}) => {
  await signup(page, "International Fixture");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Country or territory").selectOption("DE");
  await page.getByLabel("City or town").fill("Berlin");
  await page.getByLabel("Declared district", { exact: true }).fill("Mitte");
  await page
    .getByRole("checkbox", { name: /Join your declared local pool/ })
    .check();
  await page.getByRole("button", { name: "Save my preferences" }).click();
  await expect(
    page.getByText("Your player preferences are saved.", { exact: true }),
  ).toBeVisible();
  const portrait = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#14372c";
    ctx.fillRect(0, 0, 256, 256);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const uploaded = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/account/portrait") &&
      request.method() === "PUT",
  );
  const photoResult = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account/portrait") &&
      response.request().method() === "PUT",
  );
  await page.getByLabel("Choose a portrait", { exact: true }).setInputFiles({
    name: "synthetic-portrait.png",
    mimeType: "image/png",
    buffer: Buffer.from(portrait, "base64"),
  });
  const photo = Buffer.from(
    (await uploaded).postDataJSON().image.split(",")[1],
    "base64",
  );
  const chunks = [];
  for (let offset = 12; offset + 8 <= photo.length;) {
    const size = photo.readUInt32LE(offset + 4);
    chunks.push({ kind: photo.toString("ascii", offset, offset + 4), size });
    offset += 8 + size + (size % 2);
  }
  const photoResponse = await photoResult;
  expect(
    photoResponse.status(),
    JSON.stringify({
      length: photo.length,
      riffSize: photo.readUInt32LE(4),
      chunks,
    }),
  ).toBe(200);
  await expect(
    page.getByText("Your portrait is saved for accepted friends.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Opt in to pilot view research" })
    .click();
  await expect(
    page.getByText("Research participation is on.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).last().click();
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Withdraw and delete my view events" })
    .click();
  await expect(
    page.getByText("Research participation is off.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Country or territory")).toHaveValue("DE");
  await expect(page.getByLabel("City or town")).toHaveValue("Berlin");
  await expect(
    page.getByRole("button", { name: "Remove portrait" }),
  ).toBeVisible();
});
