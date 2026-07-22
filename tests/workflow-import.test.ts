import { describe, expect, it } from "vitest";
import { MAX_WORKFLOW_FILE_BYTES, parseWorkflowJson } from "@/lib/workflow/import";
import { serializeWorkflow } from "@/lib/workflow/export";
import { createWorkflow } from "@/lib/workflow/schema";

function exportedWorkflow() {
  const workflow = createWorkflow("session-1");
  const recordedAt = new Date().toISOString();
  workflow.name = "Imported checkout";
  workflow.steps = [
    {
      id: "navigate",
      order: 8,
      name: "Open checkout",
      enabled: true,
      type: "navigate",
      page: { id: "page", url: "https://example.com" },
      payload: { url: "https://example.com" },
      metadata: { recordedAt, origin: "recorded", sensitive: false },
    },
  ];
  return workflow;
}

describe("workflow file import", () => {
  it("validates exported JSON and normalizes array order", () => {
    const parsed = parseWorkflowJson(JSON.stringify(exportedWorkflow()));
    expect(parsed.name).toBe("Imported checkout");
    expect(parsed.steps[0].order).toBe(0);
    expect(parsed.steps[0].waitAfter).toBeUndefined();
  });

  it("round-trips optional replay waits without changing schema version", () => {
    const workflow = exportedWorkflow();
    workflow.steps[0].waitAfter = {
      delayMs: 1_200,
      condition: {
        state: "hidden",
        target: {
          frameUrl: "https://example.com/frame",
          candidates: [{ kind: "testId", value: "loading", exact: true }],
        },
      },
    };

    const parsed = parseWorkflowJson(serializeWorkflow(workflow));
    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.steps[0].waitAfter).toEqual(workflow.steps[0].waitAfter);
  });

  it("rejects malformed JSON, unsupported versions, duplicate IDs, and oversized files", () => {
    expect(() => parseWorkflowJson("{")) .toThrow(/valid JSON/i);
    expect(() => parseWorkflowJson(JSON.stringify({ ...exportedWorkflow(), schemaVersion: "2.0" }))).toThrow(/schemaVersion/i);
    const duplicate = exportedWorkflow();
    duplicate.steps.push({ ...duplicate.steps[0], order: 1 });
    expect(() => parseWorkflowJson(JSON.stringify(duplicate))).toThrow(/unique/i);
    expect(() => parseWorkflowJson("{}", MAX_WORKFLOW_FILE_BYTES + 1)).toThrow(/1 MiB/i);
  });
});
