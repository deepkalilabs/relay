import { expect, test } from "@playwright/test";
import { RECORDER_SCRIPT } from "../../src/server/recorder/injected";
import { applyPositionBefore } from "../../src/server/replay/engine";
import type { WorkflowStep } from "../../src/lib/workflow/schema";

test("injected recorder captures completed fills and semantic control clicks", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");
  await page.getByLabel("Email").fill("person@example.com");

  await page.waitForTimeout(450);
  expect(actions).toHaveLength(0);

  await page.getByLabel("Password").fill("secret-value");
  await page.getByLabel("Plan").selectOption("pro");
  await page.getByLabel("Accept terms").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Open details" }).click();
  await page.getByRole("button", { name: "Input action" }).click();
  await page.getByRole("button", { name: "Role action" }).click();
  await page.getByRole("link", { name: "Fixture help" }).click();
  await page.keyboard.press("Control");
  await page.waitForTimeout(50);

  expect(actions.map((action) => action.type)).toEqual(["fill", "fill", "click", "click", "click", "click", "click", "click"]);
  const emailFill = actions.find((action) => action.type === "fill" && (action.payload as { value?: string })?.value === "person@example.com");
  expect((emailFill?.target as { candidates: Array<{ kind: string }> }).candidates[0].kind).toBe("testId");
  const passwordFill = actions.find((action) => action.type === "fill" && (action.payload as { value?: string })?.value === "secret-value");
  expect(passwordFill?.sensitive).toBe(true);
  expect((actions.find((action) => action.name === "Continue")?.target as { frameUrl?: string }).frameUrl).toBeUndefined();
  expect(actions.some((action) => action.name === "Accept terms")).toBe(true);
  expect(actions.some((action) => action.name === "Continue")).toBe(true);
  expect(actions.at(-1)?.name).toBe("Fixture help");
});

test("records frame URLs only for child-frame actions", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.frameLocator('iframe[title="Payment frame"]').getByRole("button", { name: "Pay" }).click();

  expect((actions[0].target as { frameUrl?: string }).frameUrl).toBeUndefined();
  expect((actions[1].target as { frameUrl?: string }).frameUrl).toContain("/fixture/frame");
  expect((actions[0].position as { frameUrl?: string }).frameUrl).toBeUndefined();
  expect((actions[1].position as { frameUrl?: string }).frameUrl).toContain("/fixture/frame");
});

test("captures semantic navigation and delegated content targets without field-focus noise", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");

  await page.getByLabel("Email").click();
  await page.getByText("Quotes menu", { exact: true }).click();
  await page.getByText("Delegated content action", { exact: true }).click();

  expect(actions.map((action) => action.type)).toEqual(["click", "click"]);
  expect(actions.map((action) => action.name)).toEqual(["Quotes menu", "Delegated content action"]);
  expect((actions[0].target as { candidates: Array<{ kind: string; value: string }> }).candidates[0]).toMatchObject({ kind: "role", value: "menuitem" });
  expect(await page.getByTestId("delegated-clicks").textContent()).toContain("2");
});

test("captures fields and confirmation clicks inside an event-blocking popup component", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");
  await page.evaluate(() => {
    for (const eventName of ["input", "focusout", "click"]) {
      window.addEventListener(eventName, (event) => event.stopPropagation(), true);
    }
    const popup = document.createElement("address-confirmation");
    const shadow = popup.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <section role="dialog" aria-label="Confirm address">
        <label>Street address <input name="street" /></label>
        <button type="button">Confirm</button>
      </section>
    `;
    document.body.append(popup);
  });

  await page.getByLabel("Street address").fill("123 Main Street");
  await page.getByRole("button", { name: "Confirm" }).click();

  expect(actions.map((action) => action.type)).toEqual(["fill", "click"]);
  expect(actions[0]).toMatchObject({
    type: "fill",
    name: "Street address",
    payload: { value: "123 Main Street" },
  });
  expect(actions[1]).toMatchObject({ type: "click", name: "Confirm" });
});

test("emits a navigation-link click before the page unloads", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");

  await page.getByRole("link", { name: "Open linked page" }).click();
  await page.waitForURL(/view=linked/);

  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ type: "click", name: "Open linked page" });
});

test("completed fills preserve an intentionally cleared value", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");

  const email = page.getByLabel("Email");
  await email.focus();
  await page.getByRole("button", { name: "Input action" }).click();
  expect(actions.map((action) => action.type)).toEqual(["click"]);

  await email.fill("remove-me@example.com");
  await email.clear();
  await page.getByRole("button", { name: "Open details" }).click();

  expect(actions.map((action) => action.type)).toEqual(["click", "fill", "click"]);
  expect((actions[1]?.payload as { value?: string })?.value).toBe("");
});

test("native date clicks request the custom picker without recording a fill", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");

  await page.getByLabel("Appointment date").click();

  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({
    type: "date-picker.request",
    name: "Appointment date",
    value: "2026-07-21",
    min: "2026-07-01",
    max: "2026-08-31",
  });
  expect((actions[0].target as { inputType?: string }).inputType).toBe("date");
  expect(actions[0].position).toEqual({ x: 0, y: 0 });
});

test("falls back to lowercase element names when targets have no accessible name", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.dataset.testid = "unnamed-input";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.testid = "unnamed-button";
    button.style.width = "40px";
    button.style.height = "24px";
    document.body.append(input, button);
  });

  await page.getByTestId("unnamed-input").fill("value");
  await page.getByTestId("unnamed-button").click();

  expect(actions.map((action) => ({ type: action.type, name: action.name }))).toEqual([
    { type: "fill", name: "input" },
    { type: "click", name: "button" },
  ]);
});

test("captures the absolute viewport position only when an action is emitted", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");
  await page.evaluate(() => {
    document.body.style.minHeight = "3000px";
    window.scrollTo(0, 480);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(480);
  expect(actions).toHaveLength(0);

  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Continue"));
    button?.click();
  });

  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0].position).toEqual({ x: 0, y: 480 });
});

test("replay corrects residual offsets, tolerates clamping, and remains idempotent", async ({ page }) => {
  await page.goto("/fixture");
  await page.evaluate(() => {
    document.body.style.minHeight = "3000px";
    document.documentElement.style.scrollBehavior = "smooth";
    window.scrollTo(0, 0);
    const scopedWindow = window as Window & { positionScrollAttempts?: number };
    const nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((options: ScrollToOptions) => {
      scopedWindow.positionScrollAttempts = (scopedWindow.positionScrollAttempts ?? 0) + 1;
      const requestedTop = options.top ?? window.scrollY;
      nativeScrollTo({
        ...options,
        top: scopedWindow.positionScrollAttempts < 3 ? requestedTop - 10 : requestedTop,
        behavior: "instant",
      });
    }) as typeof window.scrollTo;
  });
  const step = {
    id: "position",
    order: 0,
    name: "Position",
    enabled: true,
    type: "click",
    page: { id: "page", url: page.url() },
    target: { candidates: [{ kind: "testId", value: "continue", exact: true }] },
    position: { x: 0, y: 480 },
    metadata: { recordedAt: new Date().toISOString(), origin: "recorded", sensitive: false },
  } satisfies WorkflowStep;

  await applyPositionBefore(page, step);
  expect(await page.evaluate(() => window.scrollY)).toBe(480);
  expect(await page.evaluate(() => (window as Window & { positionScrollAttempts?: number }).positionScrollAttempts)).toBe(3);

  await applyPositionBefore(page, step);
  expect(await page.evaluate(() => window.scrollY)).toBe(480);
  expect(await page.evaluate(() => (window as Window & { positionScrollAttempts?: number }).positionScrollAttempts)).toBe(4);

  await expect(applyPositionBefore(page, { ...step, position: { x: 0, y: 100_000 } })).resolves.toBeUndefined();
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(100_000);
});
