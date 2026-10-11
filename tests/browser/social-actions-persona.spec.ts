import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:4174";
type Actor = { context: BrowserContext; page: Page; me: any };
async function actor(browser: Browser, name: string): Promise<Actor> {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  const registered = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: {
      username: "social_" + randomUUID().slice(0, 8),
      name,
      password: "Social-persona-2026!",
      adult: true,
      timezone: "Europe/Berlin",
    },
  });
  expect(registered.status()).toBe(200);
  return {
    context,
    page: await context.newPage(),
    me: await (await context.request.get("/api/me")).json(),
  };
}
function headers(who: Actor) {
  return {
    origin,
    "x-csrf-token": who.me.csrf,
    "idempotency-key": randomUUID(),
  };
}

test("a recreational persona batch-approves two exact revisions, reads updates and gives private encouragement with retry", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const [author, player] = await Promise.all([
    actor(browser, "Recreational result author"),
    actor(browser, "Recreational approving persona"),
  ]);
  try {
    const results: any[] = [];
    for (const score of [17, 18]) {
      const response = await author.context.request.post("/api/results", {
        headers: headers(author),
        data: {
          unitId: randomUUID(),
          category: "Singles",
          format: "ONE_21",
          roster: [author.me.id, player.me.id],
          games: [[21, score]],
          playedAt: new Date(Date.now() - score * 1000).toISOString(),
          scopeId: null,
          agree: true,
        },
      });
      expect(response.status()).toBe(200);
      const id = (await response.json()).id;
      results.push(
        await (await player.context.request.get("/api/results/" + id)).json(),
      );
    }
    await player.page.goto("/inbox");
    const items = player.page.getByRole("checkbox", { name: /Exact games:/ });
    await expect(items).toHaveCount(2);
    await items.nth(0).check();
    await items.nth(1).check();
    await expect(
      player.page.getByRole("button", {
        name: "Approve 2 exact results",
        exact: true,
      }),
    ).toBeDisabled();
    await player.page
      .getByRole("checkbox", { name: /I read every selected score/ })
      .check();
    let captured: any;
    await player.page.route("**/api/results/batch-approve", async (route) => {
      captured = route.request().postDataJSON();
      await route.continue();
    });
    await player.page
      .getByRole("button", { name: "Approve 2 exact results", exact: true })
      .click();
    await expect(
      player.page.getByText("The selected exact approvals are recorded.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      captured.results.map((r: any) => [r.id, r.revisionId]).sort(),
    ).toEqual(results.map((r) => [r.id, r.revisionId]).sort());
    expect(captured.agree).toBe(true);
    await expect
      .poll(
        async () =>
          (
            await (
              await player.context.request.get("/api/results/" + results[0].id)
            ).json()
          ).status,
        { timeout: 15000 },
      )
      .toBe("rated");
    await expect
      .poll(
        async () =>
          (
            await (
              await player.context.request.get("/api/results/" + results[1].id)
            ).json()
          ).status,
        { timeout: 15000 },
      )
      .toBe("rated");
    await player.page.reload();
    const unread = await (
      await player.context.request.get("/api/inbox")
    ).json();
    expect(
      unread.notifications.some((notification: any) => !notification.readAt),
    ).toBe(true);
    await player.page
      .getByRole("button", { name: "Mark updates read", exact: true })
      .click();
    await expect(
      player.page.getByText("Updates marked read.", { exact: true }),
    ).toBeVisible();
    await expect(player.page.locator(".notification.unread")).toHaveCount(0);
    const inbox = await (await player.context.request.get("/api/inbox")).json();
    expect(
      inbox.notifications.every((notification: any) => notification.readAt),
    ).toBe(true);
    const id = results[0].id;
    let fails = true;
    await player.page.route(
      "**/api/results/" + id + "/encouragement",
      (route) =>
        route.request().method() === "GET" && fails
          ? route.fulfill({
              status: 503,
              json: { error: "Synthetic encouragement read failure." },
            })
          : route.continue(),
    );
    await player.page.goto("/home?result=" + id);
    await expect(
      player.page.getByRole("button", {
        name: "Retry encouragement",
        exact: true,
      }),
    ).toBeVisible();
    fails = false;
    await player.page
      .getByRole("button", { name: "Retry encouragement", exact: true })
      .click();
    await expect(
      player.page.getByText("Synthetic encouragement read failure.", {
        exact: true,
      }),
    ).toHaveCount(0);
    const before = (await (await player.context.request.get("/api/me")).json())
      .ratings;
    await player.page.getByRole("button", { name: /^Well played,/ }).click();
    await expect(
      player.page.getByRole("button", {
        name: "Respect given · " + author.me.username,
        exact: true,
      }),
    ).toBeDisabled();
    const encouragement = await (
      await player.context.request.get("/api/results/" + id + "/encouragement")
    ).json();
    expect(encouragement.sent).toHaveLength(1);
    expect(encouragement.sent[0].recipient).toBe(author.me.id);
    expect(
      (await (await player.context.request.get("/api/me")).json()).ratings,
    ).toEqual(before);
    await author.page.goto("/home?result=" + id);
    await expect(
      author.page.getByText("1 well-played acknowledgements received.", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await Promise.all([author.context.close(), player.context.close()]);
  }
});

test("an existing-group persona chooses its named ranking pool and leaves safely while the owner remains responsible", async ({
  browser,
}) => {
  test.setTimeout(70000);
  const [owner, member] = await Promise.all([
    actor(browser, "Responsible existing group owner"),
    actor(browser, "Existing group member persona"),
  ]);
  try {
    const groupName = "Finite persona comparison group";
    const created = await owner.context.request.post("/api/circles", {
      headers: headers(owner),
      data: { name: groupName },
    });
    expect(created.status()).toBe(200);
    const id = (await created.json()).id;
    expect(
      (
        await owner.context.request.post("/api/circles/" + id + "/invite", {
          headers: headers(owner),
          data: { playerId: member.me.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.context.request.post("/api/circles/" + id + "/accept", {
          headers: headers(member),
          data: {},
        })
      ).status(),
    ).toBe(200);
    await member.page.goto("/friends");
    await expect(
      member.page.getByRole("heading", { name: "Your friends", exact: true }),
    ).toBeVisible();
    await expect(
      member.page.getByRole("heading", {
        name: "Good rivals make better games",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      member.page.getByRole("button", {
        name: new RegExp(groupName + ".*2 accepted players"),
      }),
    ).toBeVisible();
    await member.page.goto("/rankings");
    await member.page
      .getByLabel("Comparison pool", { exact: true })
      .selectOption(id);
    await expect(
      member.page.getByRole("heading", { name: groupName, exact: true }),
    ).toBeVisible();
    await expect(
      member.page.getByText("Your local table is forming", { exact: true }),
    ).toBeVisible();
    await member.page
      .getByRole("button", { name: "Mixed", exact: true })
      .click();
    await expect(
      member.page.getByLabel("Comparison pool", { exact: true }),
    ).toHaveValue(id);
    await expect(
      member.page.getByRole("heading", { name: groupName, exact: true }),
    ).toBeVisible();
    await owner.page.goto("/friends?circle=" + id);
    await expect(
      owner.page.getByRole("heading", { name: groupName, exact: true }),
    ).toHaveCount(1);
    await expect(
      owner.page.getByRole("heading", { name: "Group recap", exact: true }),
    ).toBeVisible();
    await expect(
      owner.page.getByText(
        "Transfer ownership to another accepted member before leaving this group.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      owner.page.getByRole("button", {
        name: "Leave this circle",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      owner.page.getByLabel("Transfer ownership", { exact: true }),
    ).toBeVisible();
    await expect(owner.page.locator(".form-error")).toHaveCount(0);
    await expect(owner.page).toHaveURL(new RegExp("circle=" + id));
    expect(
      (await (await owner.context.request.get("/api/circles/" + id)).json())
        .members,
    ).toHaveLength(2);
    await member.page.goto("/friends?circle=" + id);
    await expect(
      member.page.getByText(
        "2 accepted members, including you · You joined this group. Compare the progress of the players in this group.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      member.page.getByLabel("Transfer ownership", { exact: true }),
    ).toHaveCount(0);
    await expect(
      member.page.getByRole("button", { name: "Invite to group", exact: true }),
    ).toHaveCount(0);
    await expect(
      member.page.getByRole("button", {
        name: "Leave this circle",
        exact: true,
      }),
    ).toBeEnabled();
    await member.page
      .getByRole("button", { name: "Leave this circle", exact: true })
      .click();
    await expect(member.page).toHaveURL(/\/friends$/);
    await expect(
      member.page.getByRole("heading", { name: "Your circle", exact: true }),
    ).toBeVisible();
    expect(
      (await member.context.request.get("/api/circles/" + id)).status(),
    ).toBe(403);
    expect(
      (
        await member.context.request.get("/api/comparisons/" + owner.me.id)
      ).status(),
    ).toBe(403);
    expect(
      (
        await member.context.request.get(
          `/api/circles/${id}/recap?category=Singles&period=week`,
        )
      ).status(),
    ).toBe(403);
    const remaining = await (
      await owner.context.request.get("/api/circles/" + id)
    ).json();
    expect(remaining.owner).toBe(owner.me.id);
    expect(remaining.members.map((p: any) => p.id)).toEqual([owner.me.id]);
  } finally {
    await Promise.all([owner.context.close(), member.context.close()]);
  }
});
