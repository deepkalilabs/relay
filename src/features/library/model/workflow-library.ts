import type { Workflow } from "@/lib/workflow/domain";
import type { WorkflowLibraryResponse } from "@/lib/workflow/library";

export interface WorkflowLibraryClient {
  list(): Promise<WorkflowLibraryResponse>;
  create(): Promise<Workflow>;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The workflow request failed.");
  return body as T;
}

export const workflowLibraryClient: WorkflowLibraryClient = {
  async list() {
    return readResponse<WorkflowLibraryResponse>(await fetch("/api/workflows"));
  },
  async create() {
    return readResponse<Workflow>(await fetch("/api/workflows", { method: "POST" }));
  },
};

