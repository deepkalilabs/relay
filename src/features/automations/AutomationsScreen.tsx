"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { AppSidebar } from "@/shared/ui/navigation";
import { ActivityPane } from "./components/ActivityPane";
import { AddTaskDialog } from "./components/AddTaskDialog";
import { CreateFolderDialog } from "./components/CreateFolderDialog";
import { FolderPane } from "./components/FolderPane";
import { RunDetailsDialog } from "./components/RunDetailsDialog";
import { TaskPane } from "./components/TaskPane";
import {
  createInitialAutomationState,
  isSimulationActive,
  tasksForFolder,
  workspaceReducer,
} from "./model/automationWorkspace";
import styles from "./AutomationsScreen.module.css";

export function AutomationsScreen() {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    undefined,
    createInitialAutomationState,
  );
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const activeBatchId = state.activeBatch?.id;

  useEffect(() => {
    if (!activeBatchId) return;
    const timer = setInterval(() => dispatch({ type: "tick-run" }), 600);
    return () => clearInterval(timer);
  }, [activeBatchId]);

  const selectedFolder = state.folders.find((folder) => folder.id === state.selectedFolderId)
    ?? state.folders[0];
  const visibleTasks = tasksForFolder(state, selectedFolder.id);
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
              Demo data—changes reset on refresh.
            </p>
          </header>
          <div className={styles.workspace}>
            <FolderPane
              state={state}
              onNew={() => setCreateFolderOpen(true)}
              onSelect={(folderId) => dispatch({ type: "select-folder", folderId })}
              onToggle={(folderId) => dispatch({ type: "toggle-folder", folderId })}
            />
            <TaskPane
              folder={selectedFolder}
              tasks={visibleTasks}
              includesNestedFolders={includesNestedFolders}
              simulationActive={isSimulationActive(state)}
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
