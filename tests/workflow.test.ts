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

  it("validates replay wait bounds and locator requirements", () => {
    const workflow = createWorkflow("session-1");
    const step = stepFromRecordedAction({
      type: "click", name: "Open modal", sensitive: false,
      target: { candidates: [{ kind: "testId", value: "open", exact: true }] },
      page: { id: "page", url: "https://example.com" }, recordedAt: new Date().toISOString(),
    }, 0);
    workflow.steps = [{ ...step, waitAfter: { delayMs: 30_000 } }];
    expect(WorkflowSchema.safeParse(workflow).success).toBe(true);
    workflow.steps = [{ ...step, waitAfter: { delayMs: 30_001 } }];
    expect(WorkflowSchema.safeParse(workflow).success).toBe(false);
    workflow.steps = [{ ...step, waitAfter: { condition: { state: "visible", target: { candidates: [] } } } }];
    expect(WorkflowSchema.safeParse(workflow).success).toBe(false);
  });

  it("keeps a date selection as one replayable semantic step", () => {
    const step = stepFromRecordedAction({
      type: "set_date",
      name: "Set date “Appointment date”",
      target: { inputType: "date", candidates: [{ kind: "label", value: "Appointment date", exact: true }] },
      payload: { value: "2026-07-21" },
      sensitive: false,
      page: { id: "page-1", url: "https://example.com" },
      recordedAt: new Date().toISOString(),
    }, 0);
    expect(step).toMatchObject({ type: "set_date", payload: { value: "2026-07-21" } });
    expect(WorkflowSchema.shape.steps.element.parse(step)).toEqual(step);
  });

  it("keeps a dropdown selection value and label in one replayable semantic step", () => {
    const step = stepFromRecordedAction({
      type: "select",
      name: "Plan",
      target: { tagName: "select", candidates: [{ kind: "label", value: "Plan", exact: true }] },
      payload: { value: "pro", label: "Professional" },
      sensitive: false,
      page: { id: "page-1", url: "https://example.com" },
      recordedAt: new Date().toISOString(),
    }, 0);
    expect(step).toMatchObject({ type: "select", payload: { value: "pro", label: "Professional" } });
    expect(WorkflowSchema.shape.steps.element.parse(step)).toEqual(step);
  });

  it("keeps the absolute pre-action position, including the top of the page", () => {
    const step = stepFromRecordedAction({
      type: "click",
      name: "Click Continue",
      target: { candidates: [{ kind: "role", value: "button", name: "Continue", exact: true }] },
      position: { x: 0, y: 0 },
      sensitive: false,
      page: { id: "page-1", url: "https://example.com" },
      recordedAt: new Date().toISOString(),
    }, 0);
    expect(step.position).toEqual({ x: 0, y: 0 });
    expect(WorkflowSchema.shape.steps.element.parse(step)).toEqual(step);
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

  it("stores the leading navigation as the workflow start URL", () => {
    let state = initialWorkflowState();
    const first = makeStep("Start", 0);
    state = workflowReducer(state, { type: "append", step: first });
    expect(state.workflow.source.startUrl).toBe("https://example.com/0");
  });

  it("stores and updates a recording start URL without adding a step", () => {
    let state = initialWorkflowState();
    state = workflowReducer(state, { type: "setStartUrl", url: "https://example.com/start" });
    state = workflowReducer(state, { type: "setStartUrl", url: "https://example.com/later" });
    expect(state.workflow.source.startUrl).toBe("https://example.com/later");
    expect(state.workflow.steps).toHaveLength(0);
  });

  it("adopts the active replay session without clearing the current tree", () => {
    let state = initialWorkflowState();
    state = workflowReducer(state, { type: "append", step: makeStep("Navigate", 0) });
    state = workflowReducer(state, { type: "setSessionId", sessionId: "incremental-session" });
    expect(state.workflow.source.sessionId).toBe("incremental-session");
    expect(state.workflow.steps).toHaveLength(1);
  });

  it("dismisses a pending delete without restoring the step", () => {
    let state = initialWorkflowState();
    const step = makeStep("Navigate", 0);
    state = workflowReducer(state, { type: "append", step });
    state = workflowReducer(state, { type: "delete", id: step.id });
    state = workflowReducer(state, { type: "dismissDelete" });
    expect(state.deletedStep).toBeNull();
    expect(state.workflow.steps).toHaveLength(0);
  });
});
