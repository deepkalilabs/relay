"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  WorkflowStepSchema,
  emptyTarget,
  type WorkflowActionType,
  type WorkflowStep,
} from "@/lib/workflow/schema";

interface ManualStepDialogProps {
  open: boolean;
  order: number;
  page: { id: string; url: string; title?: string };
  onClose: () => void;
  onInsert: (step: WorkflowStep) => void;
}

const actionTypes: WorkflowActionType[] = ["navigate", "click", "fill", "select", "check", "uncheck", "keypress", "submit"];

export function ManualStepDialog({ open, order, page, onClose, onInsert }: ManualStepDialogProps) {
  const [type, setType] = useState<WorkflowActionType>("click");
  const [name, setName] = useState("Element");
  const [value, setValue] = useState("");
  const [locator, setLocator] = useState("body");
  const [error, setError] = useState("");

  const close = () => {
    setType("click"); setName("Element"); setValue(""); setLocator("body"); setError("");
    onClose();
  };

  const submit = () => {
    const common = {
      id: crypto.randomUUID(), order, name, enabled: true, page,
      metadata: { recordedAt: new Date().toISOString(), origin: "manual" as const, sensitive: false },
    };
    let candidate: unknown;
    if (type === "navigate") candidate = { ...common, type, payload: { url: value } };
    else {
      const target = { ...emptyTarget(), candidates: [{ kind: "css" as const, value: locator, exact: true }] };
      if (type === "fill") candidate = { ...common, type, target, payload: { value } };
      else if (type === "select") candidate = { ...common, type, target, payload: { value } };
      else if (type === "keypress") candidate = { ...common, type, target, payload: { key: value || "Enter", modifiers: [] } };
      else candidate = { ...common, type, target };
    }
    const parsed = WorkflowStepSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the step details.");
      return;
    }
    onInsert(parsed.data);
    close();
  };

  return (
    <Modal open={open} title="Insert a workflow step" description="Add an action to the editable workflow." onClose={close}>
      <div className="modal-form">
        <label className="field"><span>Action type</span><select value={type} onChange={(event) => setType(event.target.value as WorkflowActionType)}>{actionTypes.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
        <label className="field"><span>Step name</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
        {type !== "navigate" ? <label className="field"><span>CSS locator</span><input value={locator} onChange={(event) => setLocator(event.target.value)} /><small>Start with a CSS locator; you can add stronger candidates after inserting.</small></label> : null}
        {["navigate", "fill", "select", "keypress"].includes(type) ? <label className="field"><span>{type === "navigate" ? "Destination URL" : type === "keypress" ? "Key" : "Value"}</span><input value={value} onChange={(event) => setValue(event.target.value)} /></label> : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </div>
      <div className="modal-actions"><button className="button button-ghost" type="button" onClick={close}>Cancel</button><button className="button button-primary" type="button" onClick={submit}><Plus size={16} /> Insert step</button></div>
    </Modal>
  );
}
