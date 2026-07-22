import { expect, test } from "@playwright/test";
import { RECORDER_SCRIPT } from "../../src/server/recorder/injected";

test("injected recorder captures completed fills and semantic button clicks only", async ({ page }) => {
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

  expect(actions.map((action) => action.type)).toEqual(["fill", "fill", "click", "click", "click", "click"]);
  const emailFill = actions.find((action) => action.type === "fill" && (action.payload as { value?: string })?.value === "person@example.com");
  expect((emailFill?.target as { candidates: Array<{ kind: string }> }).candidates[0].kind).toBe("testId");
  const passwordFill = actions.find((action) => action.type === "fill" && (action.payload as { value?: string })?.value === "secret-value");
  expect(passwordFill?.sensitive).toBe(true);
  expect(actions[2]?.name).toBe('Click “Continue”');
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
