import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows the mock recording library and supports local search and selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const sourceUrl = message.location().url;
    const isMissingOptionalFavicon =
      sourceUrl !== "" && new URL(sourceUrl).pathname === "/favicon.ico" && message.text().includes("404");
    if (isMissingOptionalFavicon) return;
    errors.push(`console: ${message.text()}${sourceUrl ? ` (${sourceUrl})` : ""}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`page: ${error.message}`);
  });

  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select Checkout flow recording" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Run Checkout flow" })).toBeDisabled();

  await page.getByRole("button", { name: "Select Create support ticket recording" }).click();
  await expect(
    page.getByRole("region", { name: "Recording details" }).getByRole("heading", {
      name: "Create support ticket",
    }),
  ).toBeVisible();

  await page.getByRole("searchbox", { name: "Search recordings" }).fill("weekly");
  await expect(page.getByRole("button", { name: "Select Weekly analytics export recording" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Recorder", exact: true })).toHaveAttribute("href", "/");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("keeps the Library within the supported 1024px desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));

  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);
});

test("shows the desktop-only guard below 1024px", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "A larger screen is required" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Library" })).toBeHidden();
});
