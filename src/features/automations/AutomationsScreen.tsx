"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  workflowListClient,
  type WorkflowListClient,
} from "@/shared/api/workflowListClient";
import type { LibraryWorkflowItem } from "@/shared/contracts/workflow/library";
import { AppSidebar } from "@/shared/ui/navigation";
import { ActivityPane } from "./components/ActivityPane";
import { AddTaskDialog } from "./components/AddTaskDialog";
import { CreateFolderDialog } from "./components/CreateFolderDialog";
import { FolderPane } from "./components/FolderPane";
import { RunDetailsDialog } from "./components/RunDetailsDialog";
import { TaskPane } from "./components/TaskPane";
import {
  ALL_WORKFLOWS_FOLDER_ID,
  createInitialAutomationState,
  isSimulationActive,
  tasksForFolder,
  workspaceReducer,
} from "./model/automationWorkspace";
import styles from "./AutomationsScreen.module.css";

export interface AutomationsScreenProps {
  client?: WorkflowListClient;
}

const THUMBNAIL_VARIANTS = ["search", "form", "table", "message"] as const;

function thumbnailForWorkflow(name: string) {
  let hash = 2_166_136_261;
  for (const character of name.normalize("NFKC").trim().toLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return THUMBNAIL_VARIANTS[(hash >>> 0) % THUMBNAIL_VARIANTS.length];
}

function updatedLabel(updatedAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(updatedAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

function libraryTask(workflow: LibraryWorkflowItem) {
  return {
    id: workflow.id,
    name: workflow.name,
    steps: workflow.steps.length,
    updated: updatedLabel(workflow.updatedAt),
    thumbnail: thumbnailForWorkflow(workflow.name),
    folderId: ALL_WORKFLOWS_FOLDER_ID,
  };
}

export function AutomationsScreen({ client = workflowListClient }: AutomationsScreenProps) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    undefined,
    createInitialAutomationState,
  );
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [libraryWorkflows, setLibraryWorkflows] = useState<LibraryWorkflowItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [invalidFileCount, setInvalidFileCount] = useState(0);
  const activeBatchId = state.activeBatch?.id;

  useEffect(() => {
    if (!activeBatchId) return;
    const timer = setInterval(() => dispatch({ type: "tick-run" }), 600);
    return () => clearInterval(timer);
  }, [activeBatchId]);

  useEffect(() => {
    let active = true;
    client.list().then(
      (result) => {
        if (!active) return;
        setLibraryWorkflows(result.workflows);
        setInvalidFileCount(result.invalidFileCount);
        setLibraryLoading(false);
      },
      () => {
        if (!active) return;
        setLibraryWorkflows([]);
        setInvalidFileCount(0);
        setLibraryError("All workflows could not be loaded.");
        setLibraryLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [client]);

  const allWorkflowTasks = useMemo(
    () => libraryWorkflows.map(libraryTask),
    [libraryWorkflows],
  );

  const selectedFolder = state.folders.find((folder) => folder.id === state.selectedFolderId)
    ?? state.folders[0];
  const allWorkflowsSelected = selectedFolder.id === ALL_WORKFLOWS_FOLDER_ID;
  const visibleTasks = allWorkflowsSelected
    ? allWorkflowTasks
    : tasksForFolder(state, selectedFolder.id);
  const inboxTasks = tasksForFolder(state, "inbox");
  const detailRun = state.runs.find((run) => run.id === detailRunId);
  const includesNestedFolders = state.folders.some(
    (folder) => folder.parentId === selectedFolder.id,
  );

  return (
    <>
      <div className={styles.shell}>
        <AppSidebar activeDestination="automations" />
        <main className={styles.content}>
          <header className={styles.pageHeader}>
            <div>
              <h1>Automations</h1>
              <p>Organize and run workflows by folder.</p>
            </div>
            <p className={styles.demoBanner}>
              <FlaskConical size={14} aria-hidden="true" />
              All workflows syncs with Library; folder changes reset on refresh.
            </p>
          </header>
          <div className={styles.workspace}>
            <FolderPane
              state={state}
              allWorkflowsCount={allWorkflowTasks.length}
              onNew={() => setCreateFolderOpen(true)}
              onSelect={(folderId) => dispatch({ type: "select-folder", folderId })}
              onToggle={(folderId) => dispatch({ type: "toggle-folder", folderId })}
            />
            <TaskPane
              folder={selectedFolder}
              tasks={visibleTasks}
              includesNestedFolders={includesNestedFolders}
              simulationActive={isSimulationActive(state)}
              loading={allWorkflowsSelected && libraryLoading}
              error={allWorkflowsSelected ? libraryError : null}
              invalidFileCount={allWorkflowsSelected ? invalidFileCount : 0}
              onAdd={() => setAddTaskOpen(true)}
              onRemove={(taskId) => dispatch({ type: "move-task", taskId, folderId: "inbox" })}
              onRun={() => dispatch({ type: "start-run", batchId: crypto.randomUUID() })}
            />
            <ActivityPane runs={state.runs} onViewDetails={setDetailRunId} />
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {state.announcement}
          </span>
        </main>
      </div>
      {createFolderOpen ? (
        <CreateFolderDialog
          state={state}
          onClose={() => setCreateFolderOpen(false)}
          onCreate={(name, parentId) => {
            dispatch({
              type: "create-folder",
              folder: { id: crypto.randomUUID(), name, parentId },
            });
            setCreateFolderOpen(false);
          }}
        />
      ) : null}
      {addTaskOpen ? (
        <AddTaskDialog
          folder={selectedFolder}
          inboxTasks={inboxTasks}
          onClose={() => setAddTaskOpen(false)}
          onAdd={(taskId) => {
            dispatch({ type: "move-task", taskId, folderId: selectedFolder.id });
            setAddTaskOpen(false);
          }}
        />
      ) : null}
      {detailRun ? (
        <RunDetailsDialog run={detailRun} onClose={() => setDetailRunId(null)} />
      ) : null}
    </>
  );
}
