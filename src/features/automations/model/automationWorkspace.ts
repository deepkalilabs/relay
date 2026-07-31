export type AutomationThumbnailVariant = "search" | "form" | "table" | "message";
export type AutomationRunState = "queued" | "running" | "failed" | "completed";

export interface AutomationFolder {
  id: string;
  name: string;
  parentId: string | null;
  system?: boolean;
}

export interface AutomationTask {
  id: string;
  name: string;
  steps: number;
  updated: string;
  thumbnail: AutomationThumbnailVariant;
  folderId: string;
}

export interface AutomationRun {
  id: string;
  taskId: string;
  name: string;
  state: AutomationRunState;
  currentStep: number;
  totalSteps: number;
  updated: string;
  thumbnail?: AutomationThumbnailVariant;
  detail?: string;
  failedStep?: number;
  simulated: boolean;
  batchId?: string;
}

export interface AutomationWorkspaceState {
  folders: AutomationFolder[];
  tasks: AutomationTask[];
  runs: AutomationRun[];
  selectedFolderId: string;
  expandedFolderIds: string[];
  activeBatch: {
    id: string;
    folderName: string;
    taskCount: number;
  } | null;
  announcement: string;
}

export type AutomationWorkspaceAction =
  | { type: "select-folder"; folderId: string }
  | { type: "toggle-folder"; folderId: string }
  | { type: "create-folder"; folder: Pick<AutomationFolder, "id" | "name" | "parentId"> }
  | { type: "move-task"; taskId: string; folderId: string }
  | { type: "start-run"; batchId: string }
  | { type: "tick-run" };

const folders: AutomationFolder[] = [
  { id: "inbox", name: "Inbox", parentId: null, system: true },
  { id: "customers", name: "Customers", parentId: null },
  { id: "verification", name: "Verification", parentId: "customers" },
  { id: "leads", name: "Leads", parentId: "customers" },
  { id: "research", name: "Research", parentId: null },
];

function task(
  id: string,
  name: string,
  steps: number,
  folderId: string,
  thumbnail: AutomationThumbnailVariant,
  updated = "Updated 1h ago",
): AutomationTask {
  return { id, name, steps, folderId, thumbnail, updated };
}

const tasks: AutomationTask[] = [
  task("export-monthly-report", "Export monthly report", 6, "inbox", "table"),
  task("update-vendor-record", "Update vendor record", 5, "inbox", "form"),
  task("check-invoice-status", "Check invoice status", 4, "inbox", "search"),
  task("download-receipts", "Download receipts", 7, "inbox", "table"),
  task("review-account-alerts", "Review account alerts", 5, "inbox", "message"),
  task("submit-expense-claim", "Submit expense claim", 8, "inbox", "form"),
  task("sync-contact-list", "Sync contact list", 6, "inbox", "table"),
  task("capture-order-details", "Capture order details", 5, "inbox", "form"),
  task("check-renewal-date", "Check renewal date", 3, "inbox", "search"),
  task("create-support-request", "Create support request", 7, "inbox", "message"),
  task("update-shipping-method", "Update shipping method", 4, "inbox", "form"),
  task("archive-conversation", "Archive conversation", 3, "inbox", "message"),
  task("find-customer", "Find customer", 8, "verification", "search"),
  task("verify-address", "Verify address", 6, "verification", "form"),
  task("update-crm", "Update CRM", 7, "verification", "table", "Updated 2h ago"),
  task("send-notification", "Send notification", 5, "verification", "message", "Updated 2h ago"),
  task("check-compliance", "Check compliance", 9, "verification", "form", "Updated 3h ago"),
  task("create-case", "Create case", 6, "verification", "search", "Updated 3h ago"),
  task("assign-owner", "Assign owner", 4, "verification", "form", "Updated 4h ago"),
  task("archive-documents", "Archive documents", 3, "verification", "table", "Updated 5h ago"),
  task("review-lead", "Review lead", 4, "leads", "search"),
  task("enrich-lead", "Enrich lead", 6, "leads", "form"),
  task("assign-territory", "Assign territory", 3, "leads", "table"),
  task("create-opportunity", "Create opportunity", 7, "leads", "form"),
  task("find-company", "Find company", 5, "research", "search"),
  task("collect-contacts", "Collect contacts", 8, "research", "table"),
  task("check-funding", "Check funding", 4, "research", "search"),
  task("review-news", "Review news", 6, "research", "message"),
  task("map-competitors", "Map competitors", 7, "research", "table"),
  task("summarize-research", "Summarize research", 5, "research", "message"),
];

const runs: AutomationRun[] = [
  {
    id: "run-find-customer",
    taskId: "find-customer",
    name: "Find customer",
    state: "running",
    currentStep: 3,
    totalSteps: 8,
    updated: "2m ago",
    thumbnail: "search",
    simulated: false,
  },
  {
    id: "run-verify-address",
    taskId: "verify-address",
    name: "Verify address",
    state: "queued",
    currentStep: 0,
    totalSteps: 6,
    updated: "1m ago",
    thumbnail: "form",
    simulated: false,
  },
  {
    id: "run-update-crm",
    taskId: "update-crm",
    name: "Update CRM",
    state: "failed",
    currentStep: 4,
    totalSteps: 7,
    updated: "15m ago",
    thumbnail: "table",
    failedStep: 4,
    detail: "Salesforce connection timed out",
    simulated: false,
  },
];

export function createInitialAutomationState(): AutomationWorkspaceState {
  return {
    folders: folders.map((folder) => ({ ...folder })),
    tasks: tasks.map((item) => ({ ...item })),
    runs: runs.map((run) => ({ ...run })),
    selectedFolderId: "verification",
    expandedFolderIds: ["customers"],
    activeBatch: null,
    announcement: "",
  };
}

function descendantFolderIds(state: AutomationWorkspaceState, folderId: string): Set<string> {
  const result = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of state.folders) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        changed = true;
      }
    }
  }
  return result;
}

export function tasksForFolder(
  state: AutomationWorkspaceState,
  folderId: string,
): AutomationTask[] {
  const folderIds = descendantFolderIds(state, folderId);
  return state.tasks.filter((item) => folderIds.has(item.folderId));
}

export function taskCountForFolder(
  state: AutomationWorkspaceState,
  folderId: string,
): number {
  return tasksForFolder(state, folderId).length;
}

export function folderNameError(
  state: AutomationWorkspaceState,
  value: string,
  parentId: string | null,
): string | null {
  const name = value.trim();
  if (!name) return "Enter a folder name.";
  if (name.length > 80) return "Folder names must be 80 characters or fewer.";
  const duplicate = state.folders.some((folder) => (
    folder.parentId === parentId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase()
  ));
  return duplicate ? "A folder with this name already exists here." : null;
}

export function isSimulationActive(state: AutomationWorkspaceState): boolean {
  return state.activeBatch !== null;
}

function capCompletedRuns(runsToCap: AutomationRun[]): AutomationRun[] {
  const completedIds = runsToCap
    .filter((run) => run.state === "completed")
    .map((run) => run.id);
  if (completedIds.length <= 5) return runsToCap;
  const removeIds = new Set(completedIds.slice(0, completedIds.length - 5));
  return runsToCap.filter((run) => !removeIds.has(run.id));
}

export function workspaceReducer(
  state: AutomationWorkspaceState,
  action: AutomationWorkspaceAction,
): AutomationWorkspaceState {
  switch (action.type) {
    case "select-folder":
      return state.folders.some((folder) => folder.id === action.folderId)
        ? { ...state, selectedFolderId: action.folderId }
        : state;
    case "toggle-folder": {
      const expanded = state.expandedFolderIds.includes(action.folderId);
      return {
        ...state,
        expandedFolderIds: expanded
          ? state.expandedFolderIds.filter((id) => id !== action.folderId)
          : [...state.expandedFolderIds, action.folderId],
      };
    }
    case "create-folder": {
      const error = folderNameError(state, action.folder.name, action.folder.parentId);
      if (error) return { ...state, announcement: error };
      const folder = { ...action.folder, name: action.folder.name.trim() };
      const expandedFolderIds = Array.from(new Set([
        ...state.expandedFolderIds,
        ...(folder.parentId ? [folder.parentId] : []),
        folder.id,
      ]));
      return {
        ...state,
        folders: [...state.folders, folder],
        selectedFolderId: folder.id,
        expandedFolderIds,
        announcement: `${folder.name} folder created.`,
      };
    }
    case "move-task": {
      const movedTask = state.tasks.find((item) => item.id === action.taskId);
      const targetFolder = state.folders.find((folder) => folder.id === action.folderId);
      if (!movedTask || !targetFolder) return state;
      return {
        ...state,
        tasks: state.tasks.map((item) => item.id === action.taskId
          ? { ...item, folderId: action.folderId, updated: "Updated just now" }
          : item),
        announcement: `${movedTask.name} moved to ${targetFolder.name}.`,
      };
    }
    case "start-run": {
      if (state.activeBatch) return state;
      const folder = state.folders.find((item) => item.id === state.selectedFolderId);
      const selectedTasks = tasksForFolder(state, state.selectedFolderId);
      if (!folder || !selectedTasks.length) return state;
      const queuedRuns = selectedTasks.map<AutomationRun>((item) => ({
        id: `${action.batchId}:${item.id}`,
        taskId: item.id,
        name: item.name,
        state: "queued",
        currentStep: 0,
        totalSteps: item.steps,
        updated: "Just now",
        thumbnail: item.thumbnail,
        simulated: true,
        batchId: action.batchId,
      }));
      return {
        ...state,
        runs: [...state.runs, ...queuedRuns],
        activeBatch: {
          id: action.batchId,
          folderName: folder.name,
          taskCount: selectedTasks.length,
        },
        announcement: `${folder.name} run queued with ${selectedTasks.length} ${selectedTasks.length === 1 ? "task" : "tasks"}.`,
      };
    }
    case "tick-run": {
      if (!state.activeBatch) return state;
      const batchId = state.activeBatch.id;
      const running = state.runs.find((run) => run.batchId === batchId && run.state === "running");
      if (!running) {
        const nextQueued = state.runs.find((run) => run.batchId === batchId && run.state === "queued");
        if (!nextQueued) return { ...state, activeBatch: null };
        return {
          ...state,
          runs: state.runs.map((run) => run.id === nextQueued.id
            ? { ...run, state: "running", currentStep: 1 }
            : run),
          announcement: `${nextQueued.name} started.`,
        };
      }
      if (running.currentStep < running.totalSteps) {
        return {
          ...state,
          runs: state.runs.map((run) => run.id === running.id
            ? { ...run, currentStep: run.currentStep + 1 }
            : run),
          announcement: `${running.name}, step ${running.currentStep + 1} of ${running.totalSteps}.`,
        };
      }
      const hasQueued = state.runs.some((run) => run.batchId === batchId && run.state === "queued");
      const completedRuns = capCompletedRuns(state.runs.map((run) => run.id === running.id
        ? { ...run, state: "completed" as const, updated: "Just now" }
        : run));
      const batch = state.activeBatch;
      return {
        ...state,
        runs: completedRuns,
        activeBatch: hasQueued ? batch : null,
        announcement: hasQueued
          ? `${running.name} completed.`
          : `${batch.folderName} run completed: ${batch.taskCount} ${batch.taskCount === 1 ? "task" : "tasks"}.`,
      };
    }
  }
}
