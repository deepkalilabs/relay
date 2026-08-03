import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("mirrors saved Library workflows in a read-only All workflows folder", async ({ page, request }) => {
  const consoleProblems: string[] = [];
  const failedResources: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      if (message.location().url.endsWith("/favicon.ico")) return;
      consoleProblems.push(`${message.text()} (${message.location().url})`);
    }
  });
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });

  const createResponse = await request.post("/api/workflows");
  const workflow = await createResponse.json();
  const workflowName = `Checkout flow ${workflow.id.slice(0, 8)}`;
  workflow.name = workflowName;
  workflow.steps = [{
    id: crypto.randomUUID(),
    order: 0,
    name: "Open checkout",
    enabled: true,
    page: { id: "manual", url: "" },
    metadata: { recordedAt: new Date().toISOString(), origin: "manual", sensitive: false },
    type: "navigate",
    payload: { url: "https://example.com/checkout" },
  }];
  const saveResponse = await request.put(`/api/workflows/${workflow.id}`, {
    data: { workflow, expectedRevision: workflow.revision },
  });
  expect(saveResponse.status()).toBe(200);

  await page.goto("/automations");

  const allWorkflows = page.getByRole("button", { name: "Select All workflows folder" });
  await expect(allWorkflows).toHaveAttribute("aria-pressed", "true");
  await expect(allWorkflows).toContainText("All workflows");

  const workflowPane = page.getByRole("region", { name: "All workflows workflows" });
  const workflowRow = workflowPane.getByRole("row", { name: new RegExp(workflowName) });
  await expect(workflowRow).toContainText("1 step");
  await expect(workflowPane.getByRole("button", { name: "Run folder" })).toBeDisabled();
  await expect(workflowPane.getByRole("button", { name: "Add task" })).toBeDisabled();
  await expect(workflowRow.getByRole("button")).toHaveCount(0);
  await expect(workflowRow.getByRole("link")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(failedResources).toEqual([]);
  expect(consoleProblems).toEqual([]);
});
