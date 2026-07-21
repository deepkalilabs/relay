"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckSquare,
  Copy,
  GripVertical,
  Keyboard,
  Link2,
  MousePointer2,
  Plus,
  Send,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import type { WorkflowStep } from "@/lib/workflow/schema";

const icons = {
  navigate: Link2,
  click: MousePointer2,
  fill: TextCursorInput,
  select: TextCursorInput,
  check: CheckSquare,
  uncheck: CheckSquare,
  keypress: Keyboard,
  submit: Send,
};

interface TimelineProps {
  steps: WorkflowStep[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (step: WorkflowStep) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onInsert: () => void;
}

function SortableStep({ step, selected, onSelect, onToggle, onDuplicate, onDelete }: {
  step: WorkflowStep;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const Icon = icons[step.type];
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`timeline-step ${selected ? "selected" : ""} ${!step.enabled ? "disabled-step" : ""} ${isDragging ? "dragging" : ""}`}>
      <button className="drag-handle" type="button" aria-label={`Reorder step ${step.order + 1}`} {...attributes} {...listeners}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <button className="step-main" type="button" onClick={onSelect} aria-pressed={selected}>
        <span className="step-icon"><Icon size={15} aria-hidden="true" /></span>
        <span className="step-copy">
          <span className="step-title">{step.name}</span>
          <span className="step-meta">{step.order + 1} · {step.type}</span>
        </span>
      </button>
      <div className="step-actions">
        <button className="mini-button" type="button" onClick={onToggle} aria-label={step.enabled ? `Disable ${step.name}` : `Enable ${step.name}`} title={step.enabled ? "Disable" : "Enable"}>
          <span className={`enabled-indicator ${step.enabled ? "on" : ""}`} aria-hidden="true" />
        </button>
        <button className="mini-button" type="button" onClick={onDuplicate} aria-label={`Duplicate ${step.name}`} title="Duplicate"><Copy size={14} /></button>
        <button className="mini-button danger-hover" type="button" onClick={onDelete} aria-label={`Delete ${step.name}`} title="Delete"><Trash2 size={14} /></button>
      </div>
    </li>
  );
}

export function WorkflowTimeline({ steps, selectedId, onSelect, onToggle, onDuplicate, onDelete, onReorder, onInsert }: TimelineProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over && event.active.id !== event.over.id) onReorder(String(event.active.id), String(event.over.id));
  };
  return (
    <aside className="timeline-panel" aria-labelledby="timeline-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Workflow</span>
          <h2 id="timeline-title">Recorded steps <span>{steps.length}</span></h2>
        </div>
        <button className="icon-button" type="button" onClick={onInsert} aria-label="Insert a workflow step" title="Insert step">
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      {steps.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
            <ol className="timeline-list">
              {steps.map((step) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  selected={selectedId === step.id}
                  onSelect={() => onSelect(step.id)}
                  onToggle={() => onToggle({ ...step, enabled: !step.enabled })}
                  onDuplicate={() => onDuplicate(step.id)}
                  onDelete={() => onDelete(step.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="timeline-empty">
          <span className="empty-illustration"><MousePointer2 size={22} aria-hidden="true" /></span>
          <h3>Your steps will appear here</h3>
          <p>Start a recording, then use the browser naturally.</p>
          <button type="button" className="text-button" onClick={onInsert}>Or add a step manually</button>
        </div>
      )}
    </aside>
  );
}
