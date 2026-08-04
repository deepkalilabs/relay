"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { AssertionPickState } from "@/shared/contracts/protocol";
import { MAX_ASSERTION_TEXT_LENGTH, type AssertionStep } from "@/shared/contracts/workflow/domain";
import { WorkflowStepSchema } from "@/shared/contracts/workflow/schema";
import { Modal } from "@/shared/ui/modal";

type SelectedAssertionTarget = Extract<AssertionPickState, { status: "selected" }>;

interface AssertionStepDialogProps {
  open: boolean;
  order: number;
  selection: SelectedAssertionTarget | null;
  onClose: () => void;
  onInsert: (step: AssertionStep) => void;
}

export function AssertionStepDialog({ open, order, selection, onClose, onInsert }: AssertionStepDialogProps) {
  if (!selection) return null;
  return <AssertionStepDialogForm key={selection.requestId} open={open} order={order} selection={selection} onClose={onClose} onInsert={onInsert} />;
}

function AssertionStepDialogForm({ open, order, selection, onClose, onInsert }: Omit<AssertionStepDialogProps, "selection"> & { selection: SelectedAssertionTarget }) {
  const hasText = Boolean(selection.text.trim());
  const [name, setName] = useState(() => hasText ? `${selection.name} contains text` : `${selection.name} is visible`);
  const [kind, setKind] = useState<"visible" | "text_contains">(() => hasText ? "text_contains" : "visible");
  const [expected, setExpected] = useState(() => selection.text);
  const [error, setError] = useState("");

  const submit = () => {
    const candidate = {
      id: crypto.randomUUID(),
      order,
      name,
      enabled: true,
      page: selection.page,
      target: selection.target,
      position: selection.position,
      expectation: kind === "text_contains" ? { kind, expected } : { kind },
      metadata: { recordedAt: new Date().toISOString(), origin: "manual" as const, sensitive: false },
      type: "assertion" as const,
    };
    const parsed = WorkflowStepSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.type !== "assertion") {
      setError(parsed.success ? "The assertion is invalid." : parsed.error.issues[0]?.message ?? "Check the assertion details.");
      return;
    }
    onInsert(parsed.data);
    onClose();
  };

  return (
    <Modal open={open} title="Add assertion" description={`Selected ${selection.name}. Choose what replay should check.`} onClose={onClose}>
      <div className="modal-form">
        <div className="field">
          <label htmlFor="assertion-step-name">Step name</label>
          <input id="assertion-step-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="assertion-expectation">Expectation</label>
          <select id="assertion-expectation" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="visible">Element is visible</option>
            <option value="text_contains">Text contains</option>
          </select>
        </div>
        {kind === "text_contains" ? (
          <div className="field">
            <label htmlFor="assertion-expected-text">Expected text</label>
            <input id="assertion-expected-text" aria-describedby="assertion-expected-help" maxLength={MAX_ASSERTION_TEXT_LENGTH} value={expected} onChange={(event) => setExpected(event.target.value)} />
            <small id="assertion-expected-help">Matching ignores case and repeated whitespace.</small>
          </div>
        ) : null}
        <p className="assertion-target-summary"><ShieldCheck size={15} aria-hidden="true" /> {selection.target.candidates?.length ?? 0} locator candidates captured</p>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </div>
      <div className="modal-actions">
        <button className="button button-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="button button-primary" type="button" onClick={submit}><ShieldCheck size={16} /> Add assertion</button>
      </div>
    </Modal>
  );
}
