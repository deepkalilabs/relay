"use client";

import { MousePointer2, ShieldCheck } from "lucide-react";
import { Modal } from "@/shared/ui/modal";

interface AddStepDialogProps {
  open: boolean;
  assertionAvailable: boolean;
  onAction: () => void;
  onAssertion: () => void;
  onStartRecording: () => void;
  onClose: () => void;
}

export function AddStepDialog({ open, assertionAvailable, onAction, onAssertion, onStartRecording, onClose }: AddStepDialogProps) {
  return (
    <Modal open={open} title="Add a workflow step" description="Choose whether the step changes the page or checks its current state." onClose={onClose}>
      <div className="add-step-choices">
        <button className="add-step-choice" type="button" onClick={onAction}>
          <MousePointer2 size={20} aria-hidden="true" />
          <span><strong>Action</strong><small>Navigate, click, fill, select, or press a key.</small></span>
        </button>
        <button className="add-step-choice" type="button" disabled={!assertionAvailable} onClick={onAssertion}>
          <ShieldCheck size={20} aria-hidden="true" />
          <span><strong>Assertion</strong><small>Select an element and check its visibility or text.</small></span>
        </button>
      </div>
      {!assertionAvailable ? (
        <div className="assertion-session-prompt" role="status">
          <p>Start a live recording session before selecting an assertion target.</p>
          <button className="button button-secondary" type="button" onClick={onStartRecording}>Start recording</button>
        </div>
      ) : null}
      <div className="modal-actions">
        <button className="button button-ghost" type="button" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
