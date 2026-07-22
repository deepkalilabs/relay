import { expect, test } from "@playwright/test";
import { RECORDER_SCRIPT } from "../../src/server/recorder/injected";

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
  expect((actions.find((action) => action.name === 'Click “Continue”')?.target as { frameUrl?: string }).frameUrl).toBeUndefined();
  expect(actions.some((action) => action.name === 'Click “Accept terms”')).toBe(true);
  expect(actions.some((action) => action.name === 'Click “Continue”')).toBe(true);
  expect(actions.at(-1)?.name).toBe('Click “Fixture help”');
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
  expect(actions.map((action) => action.name)).toEqual(['Click “Quotes menu”', 'Click “Delegated content action”']);
  expect((actions[0].target as { candidates: Array<{ kind: string; value: string }> }).candidates[0]).toMatchObject({ kind: "role", value: "menuitem" });
  expect(await page.getByTestId("delegated-clicks").textContent()).toContain("2");
});

test("emits a navigation-link click before the page unloads", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");

  await page.getByRole("link", { name: "Open linked page" }).click();
  await page.waitForURL(/view=linked/);

  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ type: "click", name: 'Click “Open linked page”' });
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
    value: "2026-07-21",
    min: "2026-07-01",
    max: "2026-08-31",
  });
  expect((actions[0].target as { inputType?: string }).inputType).toBe("date");
});
