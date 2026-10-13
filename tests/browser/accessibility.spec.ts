import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

test("core journeys have no detected WCAG AA violations in light and dark; large text preserves actions", async ({
  page,
}) => {
  test.setTimeout(150000);
  const reports: any[] = [];
  async function noOverflow(state: string) {
    const bad = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            tag: e.tagName,
            cls: e.className,
            width: r.width,
            right: r.right,
            text: e.textContent?.slice(0, 70),
          };
        })
        .filter((e) => e.width > innerWidth + 1 || e.right > innerWidth + 1),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      state + " " + JSON.stringify(bad),
    ).toBe(true);
  }
  async function check(state: string) {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) =>
            Number.isFinite(a.effect?.getComputedTiming().iterations),
          )
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    reports.push({
      state,
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      incomplete: r.incomplete.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
    mkdirSync("outputs/validation-2026-10-11", { recursive: true });
    writeFileSync(
      "outputs/validation-2026-10-11/accessibility.json",
      JSON.stringify(
        {
          tool: "axe-core",
          scope: "Automated checks only; not full conformance",
          reports,
        },
        null,
        2,
      ),
    );
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create my player identity" })
    .waitFor();
  await check("signup");
  await page.getByLabel("Your display name").fill("Accessibility Fixture");
  await page
    .getByLabel("Username", { exact: true })
    .fill("ax_" + randomUUID().slice(0, 8));
  await page
    .getByLabel("Password", { exact: true })
    .fill("Accessibility-fixture-2026!");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Create my player identity" }).click();
  await page
    .getByRole("checkbox", { name: /I have saved my recovery code privately/ })
    .check();
  await page.getByRole("button", { name: "Continue to my court" }).click();
  await page
    .getByRole("heading", { name: "Your game.", exact: true })
    .waitFor();
  for (const theme of ["light", "dark"]) {
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
    await check(theme + " settings");
    for (const destination of ["Home", "Circle", "Rankings"]) {
      await page
        .getByRole("button", { name: destination, exact: true })
        .last()
        .click();
      await page.getByRole("heading", { level: 1 }).waitFor();
      await check(theme + " " + destination);
    }
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: /Record a match|Continue your draft/ })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
    await check(theme + " result dialog");
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Text size", { exact: true }).selectOption("large");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const destination of ["Home", "Circle", "Rankings", "Profile"]) {
      await page
        .getByRole("button", { name: destination, exact: true })
        .last()
        .click();
      await page.getByRole("heading", { level: 1 }).waitFor();
      await noOverflow(destination + " large text overflow at " + width);
      if (destination === "Home") {
        const greeting = await page
            .locator(".home-heading > div")
            .boundingBox(),
          action = await page
            .getByRole("button", {
              name: /Record a match|Continue your draft/,
            })
            .first()
            .boundingBox();
        expect(
          greeting!.width,
          "Greeting must be readable rather than squeezed into a letter column",
        ).toBeGreaterThan(width * 0.7);
        expect(
          action!.y,
          "Recording action follows the enlarged greeting",
        ).toBeGreaterThanOrEqual(greeting!.y + greeting!.height - 1);
      }
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }).last(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Settings large text overflow",
    ).toBe(true);
    await page
      .getByRole("button", { name: "Home", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: /Record a match|Continue your draft/ })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "large text dialog at " + width,
    ).toBe(true);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  }
  await page.getByLabel("Text size", { exact: true }).selectOption("normal");
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  mkdirSync("outputs/validation-2026-10-11", { recursive: true });
  writeFileSync(
    "outputs/validation-2026-10-11/accessibility.json",
    JSON.stringify(
      {
        tool: "axe-core via @axe-core/playwright",
        scope:
          "Automated WCAG AA checks; not screen-reader or complete conformance proof",
        reports,
      },
      null,
      2,
    ),
  );
  expect(
    reports.filter((r) => r.violations.length),
    JSON.stringify(
      reports.filter((r) => r.violations.length),
      null,
      2,
    ),
  ).toEqual([]);
});

// Keep each concept's light, dark and enlarged-text checks independent, so a
// long multi-surface audit cannot consume the last concept's test budget.
for (const concept of ["passport", "court", "circle", "arena", "editorial"])
  test(`${concept} home preview preserves light/dark accessibility and enlarged text`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const reports: any[] = [];
    await page.goto(`/design?concept=${concept}`);
    await page.locator(".rating-number").waitFor();
    for (const palette of ["light", "dark"]) {
      await page.evaluate((p) => {
        document.documentElement.dataset.palette = p;
      }, palette);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter((a) =>
              Number.isFinite(a.effect?.getComputedTiming().iterations),
            )
            .map((a) => a.finished.catch(() => {})),
        );
      });
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      reports.push({
        palette,
        violations: audit.violations,
        incomplete: audit.incomplete,
      });
      expect(audit.violations).toEqual([]);
    }
    await page.evaluate(() => {
      document.documentElement.dataset.palette = "light";
      document.documentElement.dataset.textSize = "large";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync("outputs/home-growth-2026-10-13", { recursive: true });
    writeFileSync(
      `outputs/home-growth-2026-10-13/design-accessibility-${concept}.json`,
      JSON.stringify(
        {
          scope:
            "Rendered fictional preview; automated checks are not complete conformance proof",
          reports,
        },
        null,
        2,
      ),
    );
  });
