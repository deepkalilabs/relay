"use client";

import { AlertTriangle, Play } from "lucide-react";
import { Modal } from "@/shared/ui/modal";

interface RunWorkflowDialogProps {
  open: boolean;
  sensitive: boolean;
  startStepName?: string;
  onClose: () => void;
  onRun: () => void;
}

export function RunWorkflowDialog({ open, sensitive, startStepName, onClose, onRun }: RunWorkflowDialogProps) {
  if (!open) return null;
  return <OpenRunWorkflowDialog sensitive={sensitive} startStepName={startStepName} onClose={onClose} onRun={onRun} />;
}

function OpenRunWorkflowDialog({ sensitive, startStepName, onClose, onRun }: Omit<RunWorkflowDialogProps, "open">) {
  const title = startStepName ? "Run workflow from this step?" : "Run workflow?";
  const description = startStepName
    ? `Close the current cloud browser, start a fresh Browserbase session at “${startStepName},” and continue through the remaining enabled steps.`
    : "Close the current cloud browser and run this workflow in a fresh Browserbase session.";

  return (
    <Modal open title={title} description={description} onClose={onClose}>
      <form
        className="run-workflow-form"
        onSubmit={(event) => {
          event.preventDefault();
          onRun();
        }}
      >
        {sensitive ? (
          <div className="run-workflow-warning" role="note">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>This workflow contains sensitive values</strong>
              <p>Values will be sent to this local server and typed into the destination website. They are not written to disk or included in replay diagnostics.</p>
            </div>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="button button-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className={`button ${sensitive ? "button-danger" : "button-primary"}`} type="submit">
            <Play size={16} aria-hidden="true" /> {sensitive ? "Run sensitive workflow" : "Run workflow"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
