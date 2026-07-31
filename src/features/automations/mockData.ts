export interface AutomationTask {
  id: string;
  name: string;
  steps: number;
  updated: string;
  thumbnail: "search" | "form" | "table" | "message";
}

export interface AutomationRun {
  id: string;
  name: string;
  updated: string;
  state: "running" | "queued" | "failed";
  status: string;
  thumbnail: AutomationTask["thumbnail"];
  progress?: number;
  detail?: string;
}

export const automationTasks: readonly AutomationTask[] = [
  { id: "find-customer", name: "Find customer", steps: 8, updated: "Updated 1h ago", thumbnail: "search" },
  { id: "verify-address", name: "Verify address", steps: 6, updated: "Updated 1h ago", thumbnail: "form" },
  { id: "update-crm", name: "Update CRM", steps: 7, updated: "Updated 2h ago", thumbnail: "table" },
  { id: "send-notification", name: "Send notification", steps: 5, updated: "Updated 2h ago", thumbnail: "message" },
  { id: "check-compliance", name: "Check compliance", steps: 9, updated: "Updated 3h ago", thumbnail: "form" },
  { id: "create-case", name: "Create case", steps: 6, updated: "Updated 3h ago", thumbnail: "search" },
  { id: "assign-owner", name: "Assign owner", steps: 4, updated: "Updated 4h ago", thumbnail: "form" },
  { id: "archive-documents", name: "Archive documents", steps: 3, updated: "Updated 5h ago", thumbnail: "table" },
];

export const automationRuns: readonly AutomationRun[] = [
  {
    id: "run-find-customer",
    name: "Find customer",
    updated: "2m ago",
    state: "running",
    status: "Running · Step 3 of 8",
    thumbnail: "search",
    progress: 38,
  },
  {
    id: "run-verify-address",
    name: "Verify address",
    updated: "1m ago",
    state: "queued",
    status: "Queued",
    thumbnail: "form",
  },
  {
    id: "run-update-crm",
    name: "Update CRM",
    updated: "15m ago",
    state: "failed",
    status: "Failed at step 4",
    thumbnail: "table",
    detail: "Salesforce connection timed out",
  },
];
