import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows filesystem workflows with a static preview, search, and local selection", async ({ page, request }) => {
  const firstResponse = await request.post("/api/workflows");
  const first = await firstResponse.json();
  first.name = "Checkout flow";
  first.steps = [{
    id: crypto.randomUUID(),
    order: 0,
    name: "Enter contact information",
    enabled: true,
    page: { id: "manual", url: "" },
    metadata: { recordedAt: new Date().toISOString(), origin: "manual", sensitive: false },
    type: "click",
    target: { candidates: [{ kind: "css", value: "body", exact: true, unique: true }] },
    payload: {},
  }];
  await request.put(`/api/workflows/${first.id}`, {
    data: { workflow: first, expectedRevision: first.revision },
  });

  const secondResponse = await request.post("/api/workflows");
  const second = await secondResponse.json();
  second.name = "Weekly analytics export";
  await request.put(`/api/workflows/${second.id}`, {
    data: { workflow: second, expectedRevision: second.revision },
  });

  await page.goto(`/library?selected=${first.id}`);

  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select Checkout flow workflow" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("static-workflow-preview")).toBeVisible();
  await expect(page.getByText("Enter contact information")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue editing Checkout flow" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search workflows" }).fill("weekly");
  await expect(page.getByRole("button", { name: "Select Weekly analytics export workflow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select Checkout flow workflow" })).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("new recording creates a draft before opening the editor", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "New recording" }).click();
  await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]+\/edit$/);
  await expect(page.getByRole("textbox", { name: /workflow name/i })).toHaveValue("Untitled recording");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
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
