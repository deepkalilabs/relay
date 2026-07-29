import { describe, expect, it } from "vitest";
import type { Workflow } from "@/shared/contracts/workflow/domain";
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

function workflow(schemaVersion: "1.0" | "1.1" | "1.2", step: unknown = fillStep()) {
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
  it("creates canonical workflow schema 1.2 documents", () => {
    const created = createWorkflow();

    expect(created.schemaVersion).toBe("1.2");
    expect(WorkflowSchema.parse(created)).toEqual(created);
  });

  it("requires a parameter binding on canonical fill steps", () => {
    const step = fillStep();
    delete (step as Partial<typeof step>).parameterBinding;

    expect(WorkflowSchema.safeParse(workflow("1.2", step)).success).toBe(false);
  });

  it("normalizes legacy workflows to recorded bindings without changing payloads", () => {
    for (const schemaVersion of ["1.0", "1.1"] as const) {
      const legacyStep = fillStep();
      delete (legacyStep as Partial<typeof legacyStep>).parameterBinding;

      const parsed = CompatibleWorkflowSchema.parse(workflow(schemaVersion, legacyStep));

      expect(parsed.schemaVersion).toBe("1.2");
      expect(parsed.steps[0]).toMatchObject({
        type: "fill",
        payload: { value: "Recorded Person" },
        parameterBinding: { source: "recorded" },
      });
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
      expect(WorkflowSchema.safeParse(workflow("1.2", fillStep(parameterBinding))).success).toBe(true);
    }
  });

  it("caps fixed literals at 10,000 characters", () => {
    expect(WorkflowSchema.safeParse(workflow(
      "1.2",
      fillStep({ source: "fixed", value: "a".repeat(10_000) }),
    )).success).toBe(true);
    expect(WorkflowSchema.safeParse(workflow(
      "1.2",
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
    expect(WorkflowSchema.safeParse(workflow("1.2", click)).success).toBe(false);
    expect(WorkflowSchema.safeParse(workflow(
      "1.2",
      fillStep({ source: "profile", field: "identity.fullName", value: "Leaked Person" }),
    )).success).toBe(false);
    expect(WorkflowSchema.safeParse(workflow(
      "1.2",
      fillStep({ source: "runtime", value: "Leaked runtime value" }),
    )).success).toBe(false);
  });

  it("exposes the canonical binding type on fill steps", () => {
    const parsed: Workflow = WorkflowSchema.parse(workflow("1.2"));
    const step = parsed.steps[0];

    expect(step?.type === "fill" ? step.parameterBinding.source : null).toBe("recorded");
  });
});
