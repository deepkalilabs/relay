import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows the configured desktop workspace shell", async ({ page }) => {
  await page.goto("/");
  const navbar = page.locator(".workspace-navbar");
  const browserNavigation = page.locator(".browser-navigation");

  await expect(navbar.getByText("Memory Recorder", { exact: true })).toBeVisible();
  await expect(navbar.getByRole("textbox", { name: /workflow name/i })).toBeVisible();
  await expect(navbar.getByRole("button", { name: /export workflow/i })).toBeDisabled();
  await expect(page.getByRole("heading", { name: /recorded steps/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /fresh cloud browser/i })).toBeVisible();
  await expect(browserNavigation.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(browserNavigation.getByText(/cloud browser/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /go back/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /go forward/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /reload page/i })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: /web address/i })).toBeDisabled();
  await expect(page.locator(".workspace")).toHaveCSS("height", "960px");

  await page.getByRole("button", { name: /collapse workflow timeline/i }).click();
  const rail = page.locator(".workspace-rail");
  await expect(rail.getByRole("button", { name: /expand workflow timeline/i })).toBeFocused();
  await expect(rail.getByRole("button", { name: /start recording/i })).toBeVisible();
  await expect(rail.getByRole("button", { name: /export workflow/i })).toBeDisabled();
  await rail.getByRole("button", { name: /expand workflow timeline/i }).click();
  await expect(page.getByRole("button", { name: /collapse workflow timeline/i })).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("keeps the desktop workspace within the viewport at its minimum width", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);
  await expect(page.locator(".workspace")).toHaveCSS("height", "768px");
});

test("shows a centered, dismissible undo toast after deleting a step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Or add a step manually" }).click();
  await page.getByRole("button", { name: "Insert step", exact: true }).click();
  await page.getByRole("button", { name: "Delete Click element" }).click();

  const toast = page.locator(".undo-toast");
  await expect(toast).toBeVisible();
  await expect(toast.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  const bounds = await toast.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0) / 2).toBeCloseTo(720, 0);

  await toast.getByRole("button", { name: "Dismiss undo notification" }).click();
  await expect(toast).toBeHidden();
});

test("shows the desktop-only guard below 1024px", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /larger screen is required/i })).toBeVisible();
});
