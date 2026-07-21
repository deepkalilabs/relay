import { describe, expect, it } from "vitest";
import { serializeWorkflow, workflowFilename } from "@/lib/workflow/export";
import { isSensitiveInput, stepFromRecordedAction } from "@/lib/workflow/recorded-action";
import { createWorkflow, orderLocatorCandidates, WorkflowSchema } from "@/lib/workflow/schema";
import { initialWorkflowState, workflowReducer } from "@/lib/workflow/store";

describe("workflow contract", () => {
  it("orders semantic locators before structural fallbacks", () => {
    expect(orderLocatorCandidates([
      { kind: "xpath", value: "/html[1]/body[1]", exact: true },
      { kind: "role", value: "button", name: "Continue", exact: true },
      { kind: "testId", value: "continue", exact: true },
      { kind: "css", value: "button", exact: true },
    ]).map((locator) => locator.kind)).toEqual(["testId", "role", "css", "xpath"]);
  });

  it("keeps password values while marking the step sensitive", () => {
    expect(isSensitiveInput("password", "current-password")).toBe(true);
    const step = stepFromRecordedAction({
      type: "fill",
      name: "Fill Password",
      target: { inputType: "password", candidates: [{ kind: "label", value: "Password", exact: true }] },
      payload: { value: "super-secret" },
      sensitive: true,
      page: { id: "page-1", url: "https://example.com" },
      recordedAt: new Date().toISOString(),
    }, 0);
    expect(step.type).toBe("fill");
    if (step.type === "fill") expect(step.payload.value).toBe("super-secret");
    expect(step.metadata.sensitive).toBe(true);
  });

  it("validates and serializes version 1.0 with a stable filename", () => {
    const workflow = createWorkflow("session-1");
    expect(WorkflowSchema.parse(workflow).schemaVersion).toBe("1.0");
    expect(serializeWorkflow(workflow)).toContain('"schemaVersion": "1.0"');
    expect(workflowFilename(new Date("2026-07-21T12:34:56.000Z"))).toBe("browser-memory-workflow-2026-07-21T12-34-56-000Z.json");
  });
});

describe("workflow reducer", () => {
  const makeStep = (name: string, order: number) => stepFromRecordedAction({
    type: "navigate", name, payload: { url: `https://example.com/${order}` }, sensitive: false,
    page: { id: "page", url: "https://example.com" }, recordedAt: new Date().toISOString(),
  }, order);

  it("appends, reorders, deletes, and restores steps", () => {
    let state = initialWorkflowState();
    const first = makeStep("First", 0);
    const second = makeStep("Second", 1);
    state = workflowReducer(state, { type: "append", step: first });
    state = workflowReducer(state, { type: "append", step: second });
    state = workflowReducer(state, { type: "reorder", activeId: second.id, overId: first.id });
    expect(state.workflow.steps.map((step) => step.name)).toEqual(["Second", "First"]);
    expect(state.workflow.steps.map((step) => step.order)).toEqual([0, 1]);
    state = workflowReducer(state, { type: "delete", id: second.id });
    expect(state.workflow.steps).toHaveLength(1);
    state = workflowReducer(state, { type: "undoDelete" });
    expect(state.workflow.steps.map((step) => step.name)).toEqual(["Second", "First"]);
  });

  it("duplicates with a new identity and origin", () => {
    let state = initialWorkflowState();
    const step = makeStep("Navigate", 0);
    state = workflowReducer(state, { type: "append", step });
    state = workflowReducer(state, { type: "duplicate", id: step.id });
    expect(state.workflow.steps).toHaveLength(2);
    expect(state.workflow.steps[1].id).not.toBe(step.id);
    expect(state.workflow.steps[1].metadata.origin).toBe("duplicate");
  });
});
