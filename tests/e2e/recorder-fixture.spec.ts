import { expect, test } from "@playwright/test";
import { RECORDER_SCRIPT } from "../../src/server/recorder/injected";

test("injected recorder captures semantic interaction types and sensitive values", async ({ page }) => {
  const actions: Array<Record<string, unknown>> = [];
  await page.exposeFunction("__browserMemoryEmit", (action: Record<string, unknown>) => { actions.push(action); });
  await page.addInitScript({ content: RECORDER_SCRIPT });
  await page.goto("/fixture");
  await page.getByLabel("Email").fill("person@example.com");
  await page.getByLabel("Password").fill("secret-value");
  await page.getByLabel("Plan").selectOption("pro");
  await page.getByLabel("Accept terms").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Open details" }).click();
  await page.waitForTimeout(500);

  expect(actions.some((action) => action.type === "fill" && (action.payload as { value?: string })?.value === "person@example.com")).toBe(true);
  expect(actions.some((action) => action.type === "fill" && (action.payload as { value?: string })?.value === "secret-value" && action.sensitive === true)).toBe(true);
  expect(actions.some((action) => action.type === "select")).toBe(true);
  expect(actions.some((action) => action.type === "check")).toBe(true);
  expect(actions.some((action) => action.type === "submit")).toBe(true);
  expect(actions.some((action) => action.type === "navigate" && String((action.payload as { url?: string })?.url).includes("view=details"))).toBe(true);
  const emailFill = actions.find((action) => action.type === "fill" && (action.payload as { value?: string })?.value === "person@example.com");
  expect((emailFill?.target as { candidates: Array<{ kind: string }> }).candidates[0].kind).toBe("testId");
});
