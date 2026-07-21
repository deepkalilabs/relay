"use client";

import { ChevronRight, Download, Pencil, Radio } from "lucide-react";
import { RecorderControls } from "@/features/recorder/RecorderControls";
import type { RecordingStatus, TransportStatus } from "@/lib/recorder-session";

interface WorkspaceNavbarProps {
  collapsed: boolean;
  workflowName: string;
  status: RecordingStatus;
  transportStatus: TransportStatus;
  elapsed: string;
  stepCount: number;
  onNameChange: (name: string) => void;
  onExpand: () => void;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
}

export function WorkspaceNavbar({
  collapsed,
  workflowName,
  status,
  transportStatus,
  elapsed,
  stepCount,
  onNameChange,
  onExpand,
  onStart,
  onStop,
  onExport,
}: WorkspaceNavbarProps) {
  if (collapsed) {
    return (
      <aside className="workspace-rail" aria-label="Collapsed workflow navbar">
        <h1 className="rail-brand" aria-label="Browser Memory Recorder">
          <Radio size={18} aria-hidden="true" />
        </h1>
        <button id="timeline-expand" className="workspace-rail-button" type="button" onClick={onExpand} aria-label="Expand workflow timeline" title="Expand timeline">
          <ChevronRight size={19} aria-hidden="true" />
        </button>
        <RecorderControls status={status} transportStatus={transportStatus} elapsed={elapsed} onStart={onStart} onStop={onStop} variant="rail" />
        <span className="workspace-rail-spacer" />
        <button className="workspace-rail-button" type="button" onClick={onExport} disabled={!stepCount} aria-label="Export workflow" title="Export workflow">
          <Download size={18} aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <header className="workspace-navbar">
      <div className="workspace-navbar-primary">
        <h1 className="brand" aria-label="Browser Memory Recorder">
          <span className="brand-mark"><Radio size={18} aria-hidden="true" /></span>
          <span>Memory Recorder</span>
        </h1>
        <button className="icon-button" type="button" onClick={onExport} disabled={!stepCount} aria-label="Export workflow" title="Export workflow">
          <Download size={18} aria-hidden="true" />
        </button>
      </div>
      <label className="workspace-workflow-name">
        <span className="sr-only">Workflow name</span>
        <input value={workflowName} onChange={(event) => onNameChange(event.target.value)} aria-label="Workflow name" />
        <Pencil size={14} aria-hidden="true" />
      </label>
    </header>
  );
}
