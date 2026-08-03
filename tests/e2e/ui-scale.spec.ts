import { expect, test, type Page } from "@playwright/test";

const productRoutes = [
  { path: "/automations", heading: "Automations" },
  { path: "/library", heading: "Library" },
  { path: "/profile", heading: "Profiles" },
];

async function readLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const visibleRoot = [...document.body.children].find((element) => (
      element.getBoundingClientRect().height > 0
    ));
    const rootBounds = visibleRoot?.getBoundingClientRect();

    return {
      zoom: Number.parseFloat(getComputedStyle(document.documentElement).zoom),
      rootHeight: rootBounds?.height ?? 0,
      documentOverflow: document.documentElement.scrollWidth
        - document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
    };
  });
}

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1440, height: 960 },
]) {
  test(`uses the 80% app scale and fills the ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const route of productRoutes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible();

      const metrics = await readLayoutMetrics(page);
      expect(metrics.zoom).toBeCloseTo(0.8, 5);
      expect(metrics.rootHeight).toBeGreaterThanOrEqual(viewport.height - 1);
      expect(metrics.documentOverflow).toBeLessThanOrEqual(0);
      expect(metrics.bodyOverflow).toBeLessThanOrEqual(0);
    }
  });
}

test("keeps automation dialogs inside the scaled viewport", async ({ page }) => {
  const viewport = { width: 1024, height: 768 };
  await page.setViewportSize(viewport);
  await page.goto("/automations");
  await page.getByRole("button", { name: "Select Verification folder" }).click();
  await page.getByRole("button", { name: "Add task" }).click();

  const dialog = page.getByRole("dialog", { name: /Add task to Verification/ });
  await expect(dialog).toBeVisible();

  const [backdropBounds, dialogBounds] = await Promise.all([
    page.locator(".modal-backdrop").boundingBox(),
    dialog.boundingBox(),
  ]);

  expect(backdropBounds?.width).toBeCloseTo(viewport.width, 0);
  expect(backdropBounds?.height).toBeCloseTo(viewport.height, 0);
  expect(dialogBounds?.y).toBeGreaterThanOrEqual(0);
  expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(
    viewport.height,
  );
});
