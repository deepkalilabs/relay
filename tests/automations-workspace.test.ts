import { describe, expect, it } from "vitest";
// Reducer unit tests intentionally target this feature-private model.
// eslint-disable-next-line no-restricted-imports
import {
  createInitialAutomationState,
  folderNameError,
  isSimulationActive,
  taskCountForFolder,
  tasksForFolder,
  workspaceReducer,
  type AutomationWorkspaceState,
} from "@/features/automations/model/automationWorkspace";

describe("automation workspace model", () => {
  it("derives direct and nested task collections from the folder tree", () => {
    const state = createInitialAutomationState();

    expect(taskCountForFolder(state, "inbox")).toBe(12);
    expect(taskCountForFolder(state, "verification")).toBe(8);
    expect(taskCountForFolder(state, "customers")).toBe(12);
    expect(tasksForFolder(state, "customers").map((task) => task.folderId))
      .toEqual(expect.arrayContaining(["verification", "leads"]));
    expect(tasksForFolder(state, "customers").some((task) => task.folderId === "research")).toBe(false);
  });

  it("creates and selects a valid folder while rejecting duplicate sibling names", () => {
    const state = createInitialAutomationState();

    expect(folderNameError(state, " verification ", "customers")).toMatch(/already exists/i);
    expect(folderNameError(state, "   ", "customers")).toMatch(/name/i);
    expect(folderNameError(state, "A".repeat(81), null)).toMatch(/80/);

    const created = workspaceReducer(state, {
      type: "create-folder",
      folder: { id: "renewals", name: "  Renewals  ", parentId: "customers" },
    });

    expect(created.folders).toContainEqual({
      id: "renewals",
      name: "Renewals",
      parentId: "customers",
    });
    expect(created.selectedFolderId).toBe("renewals");
    expect(created.expandedFolderIds).toContain("customers");
    expect(created.expandedFolderIds).toContain("renewals");
  });

  it("moves tasks between Inbox and the selected folder without persistence", () => {
    const state = createInitialAutomationState();
    const inboxTask = tasksForFolder(state, "inbox")[0];

    const added = workspaceReducer(state, {
      type: "move-task",
      taskId: inboxTask.id,
      folderId: "verification",
    });
    expect(added.tasks.find((task) => task.id === inboxTask.id)?.folderId).toBe("verification");
    expect(taskCountForFolder(added, "verification")).toBe(9);

    const removed = workspaceReducer(added, {
      type: "move-task",
      taskId: inboxTask.id,
      folderId: "inbox",
    });
    expect(removed.tasks.find((task) => task.id === inboxTask.id)?.folderId).toBe("inbox");
    expect(taskCountForFolder(removed, "inbox")).toBe(12);
  });

  it("queues folder tasks, advances one run at a time, and completes the batch", () => {
    const initial = createInitialAutomationState();
    const oneTaskState: AutomationWorkspaceState = {
      ...initial,
      tasks: [initial.tasks.find((task) => task.id === "find-customer")!],
      runs: [],
      selectedFolderId: "verification",
    };

    let state = workspaceReducer(oneTaskState, { type: "start-run", batchId: "batch-1" });
    expect(state.runs).toMatchObject([{ state: "queued", currentStep: 0, batchId: "batch-1" }]);
    expect(isSimulationActive(state)).toBe(true);

    state = workspaceReducer(state, { type: "tick-run" });
    expect(state.runs[0]).toMatchObject({ state: "running", currentStep: 1 });

    for (let index = 1; index < state.runs[0].totalSteps; index += 1) {
      state = workspaceReducer(state, { type: "tick-run" });
    }
    expect(state.runs[0]).toMatchObject({ state: "running", currentStep: 8 });

    state = workspaceReducer(state, { type: "tick-run" });
    expect(state.runs[0]).toMatchObject({ state: "completed", currentStep: 8 });
    expect(isSimulationActive(state)).toBe(false);
    expect(state.announcement).toBe("Verification run completed: 1 task.");
  });

  it("retains only the five most recently completed simulated runs", () => {
    const initial = createInitialAutomationState();
    const completedRuns = Array.from({ length: 5 }, (_, index) => ({
      id: `completed-${index}`,
      taskId: `task-${index}`,
      name: `Completed ${index}`,
      state: "completed" as const,
      currentStep: 1,
      totalSteps: 1,
      updated: "Just now",
      simulated: true,
      batchId: `old-${index}`,
    }));
    let state: AutomationWorkspaceState = {
      ...initial,
      tasks: [{
        id: "new-task",
        name: "New task",
        steps: 1,
        updated: "Updated just now",
        thumbnail: "search",
        folderId: "verification",
      }],
      runs: completedRuns,
      selectedFolderId: "verification",
    };

    state = workspaceReducer(state, { type: "start-run", batchId: "latest" });
    state = workspaceReducer(state, { type: "tick-run" });
    state = workspaceReducer(state, { type: "tick-run" });

    const completed = state.runs.filter((run) => run.state === "completed");
    expect(completed).toHaveLength(5);
    expect(completed.some((run) => run.id === "completed-0")).toBe(false);
    expect(completed.at(-1)?.batchId).toBe("latest");
  });
});
