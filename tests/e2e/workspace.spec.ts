import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows the configured desktop workspace shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Memory Recorder", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /recorded steps/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /fresh cloud browser/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /go back/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /go forward/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /reload page/i })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: /web address/i })).toBeDisabled();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("shows the desktop-only guard below 1024px", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /larger screen is required/i })).toBeVisible();
});
