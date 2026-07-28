import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the static profile workspace without recording actions", async ({ page }) => {
  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: "Profiles", level: 1 })).toBeVisible();
  await expect(page.getByText("Work — US", { exact: true })).toHaveCount(2);
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Johnson");
  await expect(page.getByRole("textbox", { name: "Browser" })).toHaveValue("Google Chrome 125");
  await expect(page.getByRole("button", { name: "New recording" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Profiles" })).toHaveAttribute("aria-current", "page");

  for (const name of ["New profile", "Delete", "Save profile", "Run a workflow with this profile"]) {
    await expect(page.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
  }

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("fits the supported desktop viewport and guards smaller screens", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profiles", level: 1 })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.getByRole("heading", { name: "A larger screen is required" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profiles" })).toBeHidden();
});
