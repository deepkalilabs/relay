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

  await expect(page.getByRole("button", { name: /expand step details/i })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);
  await expect(page.locator(".workspace")).toHaveCSS("height", "768px");

  const startRecording = page.locator(".browser-navigation").getByRole("button", { name: /start recording/i });
  const receivesPointer = await startRecording.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return hit === button || button.contains(hit);
  });
  expect(receivesPointer).toBe(true);
});

test("shows a centered, dismissible undo toast after deleting a step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Or add a step manually" }).click();
  await page.getByRole("button", { name: "Insert step", exact: true }).click();
  await page.getByRole("button", { name: "Delete Element" }).click();

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

test("imports a validated workflow file into the timeline", async ({ page }) => {
  await page.goto("/");
  const recordedAt = "2026-07-21T12:00:00.000Z";
  const workflow = {
    schemaVersion: "1.0",
    id: "workflow-1",
    name: "Imported replay",
    createdAt: recordedAt,
    updatedAt: recordedAt,
    source: { provider: "browserbase", sessionId: "recorded-session" },
    steps: [{
      id: "navigate-1",
      order: 9,
      name: "Open example",
      enabled: true,
      page: { id: "page-1", url: "https://example.com" },
      metadata: { recordedAt, origin: "recorded", sensitive: false },
      type: "navigate",
      payload: { url: "https://example.com" },
    }],
  };

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "workflow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(workflow)),
  });

  await expect(page.getByRole("textbox", { name: /workflow name/i })).toHaveValue("Imported replay");
  await expect(page.getByRole("button", { name: "Open example 1 · navigate", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /workflow ready to replay/i })).toBeVisible();
});
