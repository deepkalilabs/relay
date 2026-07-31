import { Modal } from "@/shared/ui/modal";
import type { AutomationRun } from "../model/automationWorkspace";
import styles from "../AutomationsScreen.module.css";

interface RunDetailsDialogProps {
  run: AutomationRun;
  onClose: () => void;
}

export function RunDetailsDialog({ run, onClose }: RunDetailsDialogProps) {
  return (
    <Modal
      open
      title={`${run.name} run details`}
      description={`Recorded ${run.updated}.`}
      onClose={onClose}
    >
      <dl className={styles.runDetails}>
        <div><dt>Status</dt><dd>Failed at step {run.failedStep}</dd></div>
        <div><dt>Failure</dt><dd>{run.detail}</dd></div>
      </dl>
      <p className={styles.demoNotice}>Mock run—no workflow was executed.</p>
      <div className="modal-actions">
        <button className="button button-primary" type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
