import type { Workflow } from "@/shared/contracts/workflow/domain";

export interface WorkflowListResult {
  workflows: Workflow[];
  invalidFileCount: number;
}

export interface WorkflowRepository {
  list(): Promise<WorkflowListResult>;
  create(): Promise<Workflow>;
  get(id: string): Promise<Workflow>;
  save(id: string, workflow: Workflow, expectedRevision: number): Promise<Workflow>;
  finish(id: string, workflow: Workflow, expectedRevision: number): Promise<Workflow>;
}

