import { describe, expect, it } from "vitest";
import { RecordedActionSchema } from "@/shared/contracts/recording/recorded-action";
import type { AssertionStep, Workflow } from "@/shared/contracts/workflow/domain";
import {
  CompatibleWorkflowSchema,
  WorkflowSchema,
  createWorkflow,
} from "@/shared/contracts/workflow/schema";

const timestamp = "2026-07-29T12:00:00.000Z";

function fillStep(parameterBinding: unknown = { source: "recorded" }) {
  return {
    id: "fill-name",
    order: 0,
    name: "Full name",
    enabled: true,
    page: { id: "page-1", url: "https://example.com" },
    target: {
      candidates: [{ kind: "label", value: "Full name", exact: true }],
    },
    payload: { value: "Recorded Person" },
    parameterBinding,
    metadata: {
      recordedAt: timestamp,
      origin: "recorded",
      sensitive: false,
    },
    type: "fill",
  };
}

function navigateStep() {
  return {
    id: "navigate-home",
    order: 0,
    name: "Open home",
    enabled: true,
    page: { id: "page-1", url: "https://example.com" },
    payload: { url: "https://example.com" },
    metadata: {
      recordedAt: timestamp,
      origin: "recorded",
      sensitive: false,
    },
    type: "navigate",
  };
}

function workflow(schemaVersion: "1.0" | "1.1" | "1.2" | "1.3", step: unknown = fillStep()) {
  return {
    schemaVersion,
    id: "workflow-1",
    name: "Profile workflow",
    ...(schemaVersion === "1.0"
      ? {}
      : { status: "complete", revision: 2, finishedAt: timestamp }),
    createdAt: timestamp,
    updatedAt: timestamp,
    source: {
      provider: "browserbase",
      sessionId: "session-1",
      startUrl: "https://example.com",
    },
    steps: [step],
  };
}

describe("workflow parameter binding contract", () => {
  it("creates canonical workflow schema 1.3 documents", () => {
    const created = createWorkflow();

    expect(created.schemaVersion).toBe("1.3");
    expect(WorkflowSchema.parse(created)).toEqual(created);
  });

  it("requires a parameter binding on canonical fill steps", () => {
    const step = fillStep();
    delete (step as Partial<typeof step>).parameterBinding;

    expect(WorkflowSchema.safeParse(workflow("1.3", step)).success).toBe(false);
  });

  it("rejects fill steps from legacy schema 1.0 and 1.1 workflows", () => {
    for (const schemaVersion of ["1.0", "1.1"] as const) {
      const fillWithoutBinding = fillStep();
      delete (fillWithoutBinding as Partial<typeof fillWithoutBinding>).parameterBinding;
      expect(CompatibleWorkflowSchema.safeParse(workflow(schemaVersion, fillWithoutBinding)).success).toBe(false);
      expect(CompatibleWorkflowSchema.safeParse(workflow(schemaVersion, fillStep())).success).toBe(false);
    }
  });

  it("accepts each supported binding source", () => {
    const bindings = [
      { source: "recorded" },
      { source: "fixed", value: "" },
      { source: "profile", field: "identity.email" },
      { source: "runtime" },
    ];

    for (const parameterBinding of bindings) {
      expect(WorkflowSchema.safeParse(workflow("1.3", fillStep(parameterBinding))).success).toBe(true);
    }
  });

  it("caps fixed literals at 10,000 characters", () => {
    expect(WorkflowSchema.safeParse(workflow(
      "1.3",
      fillStep({ source: "fixed", value: "a".repeat(10_000) }),
    )).success).toBe(true);
    expect(WorkflowSchema.safeParse(workflow(
      "1.3",
      fillStep({ source: "fixed", value: "a".repeat(10_001) }),
    )).success).toBe(false);
  });

  it("rejects parameter bindings on non-fill steps and embedded resolved values", () => {
    const click = {
      ...fillStep(),
      type: "click",
      payload: {},
      parameterBinding: { source: "recorded" },
    };
    expect(WorkflowSchema.safeParse(workflow("1.3", click)).success).toBe(false);
    expect(WorkflowSchema.safeParse(workflow(
      "1.3",
      fillStep({ source: "profile", field: "identity.fullName", value: "Leaked Person" }),
    )).success).toBe(false);
    expect(WorkflowSchema.safeParse(workflow(
      "1.3",
      fillStep({ source: "runtime", value: "Leaked runtime value" }),
    )).success).toBe(false);
  });

  it("exposes the canonical binding type on fill steps", () => {
    const parsed: Workflow = WorkflowSchema.parse(workflow("1.3"));
    const step = parsed.steps[0];

    expect(step?.type === "fill" ? step.parameterBinding.source : null).toBe("recorded");
  });
});

describe("workflow assertion contract", () => {
  const assertion = (expectation: AssertionStep["expectation"]): AssertionStep => ({
    id: "assertion-status",
    order: 0,
    name: "Status is ready",
    enabled: true,
    page: { id: "page-1", url: "https://example.com" },
    target: { candidates: [{ kind: "role", value: "status", name: "Ready", exact: true }] },
    expectation,
    metadata: { recordedAt: timestamp, origin: "manual", sensitive: false },
    type: "assertion",
  });

  it("accepts visible and bounded text-containment assertions in schema 1.3", () => {
    for (const step of [
      assertion({ kind: "visible" }),
      assertion({ kind: "text_contains", expected: "ready for review" }),
    ]) {
      expect(WorkflowSchema.safeParse(workflow("1.3", step)).success).toBe(true);
    }
  });

  it("rejects blank, oversized, and wait-after assertion expectations", () => {
    const canonical = (step: unknown) => workflow("1.3", step);
    expect(WorkflowSchema.safeParse(canonical(assertion({ kind: "text_contains", expected: "   " }))).success).toBe(false);
    expect(WorkflowSchema.safeParse(canonical(assertion({ kind: "text_contains", expected: "a".repeat(1_001) }))).success).toBe(false);
    expect(WorkflowSchema.safeParse(canonical({ ...assertion({ kind: "visible" }), waitAfter: { delayMs: 100 } })).success).toBe(false);
  });

  it("normalizes non-fill legacy workflows and schema 1.2 fills to canonical schema 1.3", () => {
    for (const schemaVersion of ["1.0", "1.1"] as const) {
      expect(CompatibleWorkflowSchema.parse(workflow(schemaVersion, navigateStep())).schemaVersion).toBe("1.3");
    }
    expect(CompatibleWorkflowSchema.parse(workflow("1.2")).schemaVersion).toBe("1.3");
  });

  it("keeps assertions outside the recorded-action boundary", () => {
    expect(RecordedActionSchema.safeParse({
      type: "assertion",
      name: "Status is ready",
      target: { candidates: [{ kind: "role", value: "status", name: "Ready", exact: true }] },
      expectation: { kind: "visible" },
      sensitive: false,
      page: { id: "page-1", url: "https://example.com" },
      recordedAt: timestamp,
    }).success).toBe(false);
  });
});
