import { Info, Play, Plus, X } from "lucide-react";
import type { AutomationFolder, AutomationTask } from "../model/automationWorkspace";
import { AutomationThumbnail } from "./AutomationThumbnail";
import styles from "../AutomationsScreen.module.css";

interface TaskPaneProps {
  folder: AutomationFolder;
  tasks: AutomationTask[];
  includesNestedFolders: boolean;
  simulationActive: boolean;
  onAdd: () => void;
  onRemove: (taskId: string) => void;
  onRun: () => void;
}

export function TaskPane({
  folder,
  tasks,
  includesNestedFolders,
  simulationActive,
  onAdd,
  onRemove,
  onRun,
}: TaskPaneProps) {
  const inboxSelected = folder.id === "inbox";
  const taskNoun = tasks.length === 1 ? "task" : "tasks";
  return (
    <section className={styles.tasks} aria-label={`${folder.name} tasks`}>
      <header className={styles.taskHeader}>
        <div>
          <h2>{folder.name}</h2>
          <p>
            {tasks.length} {taskNoun}
            {includesNestedFolders ? " · Includes nested folders" : ""}
          </p>
        </div>
        <div className={styles.taskActions}>
          <button
            className={styles.primaryAction}
            type="button"
            disabled={!tasks.length || simulationActive}
            onClick={onRun}
          >
            <Play size={14} fill="currentColor" aria-hidden="true" />
            {simulationActive ? "Running folder…" : "Run folder"}
          </button>
          <button
            className={styles.secondaryAction}
            type="button"
            disabled={inboxSelected}
            onClick={onAdd}
          >
            <Plus size={15} aria-hidden="true" />
            Add task
          </button>
        </div>
      </header>
      <h3 className={styles.sectionLabel}>Tasks</h3>
      {tasks.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.taskTable}>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Steps</th>
                <th scope="col">Last updated</th>
                <th scope="col"><span className="sr-only">Folder action</span></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <th scope="row">
                    <span className={styles.taskIdentity}>
                      <AutomationThumbnail variant={task.thumbnail} />
                      <span>{task.name}</span>
                    </span>
                  </th>
                  <td>{task.steps} steps</td>
                  <td>{task.updated}</td>
                  <td>
                    {!inboxSelected ? (
                      <button
                        className={styles.removeAction}
                        type="button"
                        aria-label={`Remove ${task.name} from folder`}
                        onClick={() => onRemove(task.id)}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.emptyTasks} role="status">
          <p>No tasks in this folder.</p>
          <span>Add a task from Inbox to get started.</span>
        </div>
      )}
      {!inboxSelected ? (
        <p className={styles.taskNote}>
          <Info size={14} aria-hidden="true" />
          Removing a task returns it to Inbox.
        </p>
      ) : null}
    </section>
  );
}
