import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 430, height: 1080 },
  deviceScaleFactor: 1,
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("docs/mockups", { recursive: true });
const measurements: any[] = [];
for (const concept of ["passport", "court", "circle", "arena", "editorial"]) {
  await page.goto("http://127.0.0.1:4173/design?concept=" + concept);
  await page
    .getByRole("heading", {
      name: /Worth measuring|On|Your next level|next move|Every match/,
    })
    .first()
    .waitFor({ state: "visible" })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: ".design-controls,.design-caption{display:none}",
  });
  const box = await page.locator(".main-stage").boundingBox();
  if (!box) throw new Error("Home screen missing");
  await page.screenshot({
    path: `docs/mockups/home-${concept}.jpg`,
    type: "jpeg",
    quality: 88,
    clip: { x: box.x, y: box.y, width: box.width, height: 1080 },
  });
  measurements.push(
    await page.evaluate(() => ({
      concept: location.search,
      overflow: document.documentElement.scrollWidth > innerWidth,
      fonts: [...document.fonts]
        .filter((f) => f.status === "loaded")
        .map((f) => f.family),
    })),
  );
}
writeFileSync(
  "docs/mockups/render-results.json",
  JSON.stringify({ measurements, errors }, null, 2),
);
await browser.close();
if (errors.length) throw new Error(errors.join("; "));
console.log(JSON.stringify({ screens: 5, errors, measurements }));
