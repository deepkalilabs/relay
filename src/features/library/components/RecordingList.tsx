import type { LibraryWorkflowItem } from "@/lib/workflow/library";
import styles from "../LibraryScreen.module.css";

interface RecordingListProps {
  workflows: readonly LibraryWorkflowItem[];
  selectedWorkflowId: string;
  onSelect: (workflowId: string) => void;
}

function RecordingThumbnail() {
  return (
    <span className={styles.thumbnail} aria-hidden="true">
      <span className={styles.thumbnailChrome}>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.thumbnailCanvas}>
        <span className={styles.thumbnailRail} />
        <span className={styles.thumbnailContent}>
          <i />
          <i />
          <i />
          <span>
            <b />
            <b />
            <b />
          </span>
        </span>
      </span>
    </span>
  );
}

function updatedLabel(updatedAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(updatedAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export function RecordingList({ workflows, selectedWorkflowId, onSelect }: RecordingListProps) {
  return (
    <section className={styles.recordingList} aria-labelledby="workflows-heading">
      <h2 id="workflows-heading" className={styles.listHeading}>
        Workflows
      </h2>
      <ul className={styles.recordingItems}>
        {workflows.map((workflow) => {
          const selected = workflow.id === selectedWorkflowId;
          return (
            <li className={styles.recordingItem} key={workflow.id}>
              <button
                className={`${styles.recordingButton} ${selected ? styles.recordingButtonSelected : ""}`}
                type="button"
                aria-label={`Select ${workflow.name} workflow`}
                aria-pressed={selected}
                onClick={() => onSelect(workflow.id)}
              >
                <RecordingThumbnail />
                <span className={styles.recordingCopy}>
                  <strong>{workflow.name}</strong>
                  <span>
                    {workflow.steps.length} steps · {updatedLabel(workflow.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

