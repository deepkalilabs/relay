import type { Workflow } from "@/lib/workflow/domain";
import { WorkflowSchema } from "@/lib/workflow/schema";

export function serializeWorkflow(workflow: Workflow): string {
  return `${JSON.stringify(WorkflowSchema.parse(workflow), null, 2)}\n`;
}

export function workflowFilename(date = new Date()): string {
  return `browser-memory-workflow-${date.toISOString().replace(/[:.]/g, "-")}.json`;
}

export function downloadWorkflow(workflow: Workflow): void {
  const blob = new Blob([serializeWorkflow(workflow)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = workflowFilename();
  anchor.click();
  URL.revokeObjectURL(url);
}
