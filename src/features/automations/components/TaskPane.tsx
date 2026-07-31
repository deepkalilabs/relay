import { Info, Play, Plus, X } from "lucide-react";
import { automationTasks } from "../mockData";
import { AutomationThumbnail } from "./AutomationThumbnail";
import styles from "../AutomationsScreen.module.css";

export function TaskPane() {
  return (
    <section className={styles.tasks} aria-label="Customer Verification tasks">
      <header className={styles.taskHeader}>
        <div>
          <h2>Customer Verification</h2>
          <p>8 tasks · Includes nested folders</p>
        </div>
        <div className={styles.taskActions}>
          <button className={styles.primaryAction} type="button" disabled>
            <Play size={14} fill="currentColor" aria-hidden="true" />
            Run folder
          </button>
          <button className={styles.secondaryAction} type="button" disabled>
            <Plus size={15} aria-hidden="true" />
            Add task
          </button>
        </div>
      </header>
      <h3 className={styles.sectionLabel}>Tasks</h3>
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
            {automationTasks.map((task) => (
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
                  <button
                    className={styles.removeAction}
                    type="button"
                    aria-label={`Remove ${task.name} from folder`}
                    disabled
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.taskNote}>
        <Info size={14} aria-hidden="true" />
        Removing a task returns it to Inbox.
      </p>
    </section>
  );
}
