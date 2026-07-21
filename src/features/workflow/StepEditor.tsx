"use client";

import { useMemo } from "react";
import { AlertCircle, ChevronRight, Crosshair, KeyRound, MousePointer2, Plus, Trash2 } from "lucide-react";
import {
  WorkflowStepSchema,
  locatorKinds,
  type LocatorCandidate,
  type WorkflowStep,
} from "@/lib/workflow/schema";

interface StepEditorProps {
  step: WorkflowStep | null;
  onUpdate: (step: WorkflowStep) => void;
  onCollapse?: () => void;
}

export function StepEditor({ step, onUpdate, onCollapse }: StepEditorProps) {
  const validation = useMemo(() => (step ? WorkflowStepSchema.safeParse(step) : null), [step]);
  const updatePayload = (key: string, value: unknown) => step && onUpdate({ ...step, payload: { ...step.payload, [key]: value } } as WorkflowStep);
  const candidates = step?.target?.candidates ?? [];
  const updateCandidate = (index: number, patch: Partial<LocatorCandidate>) => {
    if (!step?.target) return;
    const next = candidates.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, ...patch } : candidate);
    onUpdate({ ...step, target: { ...step.target, candidates: next } } as WorkflowStep);
  };
  const removeCandidate = (index: number) => {
    if (!step?.target) return;
    onUpdate({ ...step, target: { ...step.target, candidates: candidates.filter((_, candidateIndex) => candidateIndex !== index) } } as WorkflowStep);
  };

  return (
    <div className="step-editor-content">
      <header className="inspector-header">
        <div>
          <span className="eyebrow">Step details</span>
          <h2>{step ? `Step ${step.order + 1}` : "No step selected"}{step ? <span>{step.type}</span> : null}</h2>
        </div>
        <button id="inspector-collapse" className="icon-button" type="button" onClick={onCollapse} aria-label="Collapse step details" title="Collapse details">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </header>
      {step ? (
        <div className="inspector-scroll">
          <section className="editor-section action-editor" aria-labelledby="action-details-title">
            <div id="action-details-title" className="editor-section-title"><MousePointer2 size={15} /><span>Action</span></div>
            <div className="editor-fields">
              <label className="field field-wide"><span>Step name</span><input value={step.name} onChange={(event) => onUpdate({ ...step, name: event.target.value } as WorkflowStep)} /></label>
              <label className="field"><span>Action</span><input value={step.type} readOnly aria-readonly="true" /></label>
              <label className="toggle-field"><input type="checkbox" checked={step.enabled} onChange={(event) => onUpdate({ ...step, enabled: event.target.checked } as WorkflowStep)} /><span>Enabled</span></label>
              {step.type === "navigate" ? <label className="field field-wide"><span>Destination URL</span><input value={step.payload.url} onChange={(event) => updatePayload("url", event.target.value)} /></label> : null}
              {step.type === "fill" || step.type === "select" ? <label className="field field-wide"><span>{step.type === "fill" ? "Recorded value" : "Selected value"}</span><input value={step.payload.value} onChange={(event) => updatePayload("value", event.target.value)} /></label> : null}
              {step.type === "keypress" ? <>
                <label className="field"><span>Key</span><input value={step.payload.key} onChange={(event) => updatePayload("key", event.target.value)} /></label>
                <div className="key-preview"><KeyRound size={14} />{[...step.payload.modifiers, step.payload.key].join(" + ")}</div>
              </> : null}
            </div>
          </section>
          <div className="editor-divider" />
          <section className="editor-section locator-editor" aria-labelledby="locator-details-title">
            <div id="locator-details-title" className="editor-section-title"><Crosshair size={15} /><span>Locator candidates</span><small>{candidates.length}</small></div>
            {step.target ? (
              <div className="locator-list">
                {candidates.map((candidate, index) => (
                  <div className="locator-card" key={`${candidate.kind}-${index}`}>
                    <div className="locator-card-heading">
                      <span className="locator-rank">{index + 1}</span>
                      <label className="locator-kind"><span className="sr-only">Locator kind</span><select value={candidate.kind} onChange={(event) => updateCandidate(index, { kind: event.target.value as LocatorCandidate["kind"] })}>{locatorKinds.map((kind) => <option value={kind} key={kind}>{kind}</option>)}</select></label>
                      <button className="mini-button danger-hover" type="button" aria-label={`Remove locator ${index + 1}`} onClick={() => removeCandidate(index)}><Trash2 size={14} /></button>
                    </div>
                    <label className="field locator-value"><span>Value</span><input value={candidate.value} onChange={(event) => updateCandidate(index, { value: event.target.value })} /></label>
                    {candidate.kind === "role" ? <label className="field locator-name"><span>Accessible name</span><input value={candidate.name ?? ""} onChange={(event) => updateCandidate(index, { name: event.target.value })} /></label> : null}
                  </div>
                ))}
                <button className="text-button add-locator" type="button" onClick={() => step.target && onUpdate({ ...step, target: { ...step.target, candidates: [...candidates, { kind: "css", value: "body", exact: true }] } } as WorkflowStep)}><Plus size={14} /> Add locator</button>
              </div>
            ) : <p className="muted-copy">Navigation steps do not require an element locator.</p>}
          </section>
          {validation && !validation.success ? <div className="validation-summary" role="alert"><AlertCircle size={15} /><span>{validation.error.issues[0]?.message}</span></div> : null}
        </div>
      ) : (
        <div className="editor-empty">
          <MousePointer2 size={20} aria-hidden="true" />
          <div><strong>Select a step to inspect it</strong><span>Action details and locator candidates will appear here.</span></div>
        </div>
      )}
    </div>
  );
}
