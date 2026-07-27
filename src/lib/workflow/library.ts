import type { Workflow } from "./domain";

export interface LibraryWorkflowItem {
  id: string;
  name: string;
  status: Workflow["status"];
  updatedAt: string;
  steps: Array<{
    id: string;
    name: string;
    order: number;
  }>;
}

export interface WorkflowLibraryResponse {
  workflows: LibraryWorkflowItem[];
  invalidFileCount: number;
}

export function toLibraryWorkflowItem(workflow: Workflow): LibraryWorkflowItem {
  return {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    updatedAt: workflow.updatedAt,
    steps: workflow.steps
      .map(({ id, name, order }) => ({ id, name, order }))
      .sort((left, right) => left.order - right.order),
  };
}

