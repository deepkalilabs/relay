"use client";

import { CircleStop, Download, LoaderCircle, Plus, Radio } from "lucide-react";
import type { RecordingStatus, TransportStatus } from "@/lib/recorder-session";

const labels: Record<RecordingStatus, string> = {
  configurationMissing: "Setup required",
  idle: "Ready",
  starting: "Starting",
  recording: "Recording",
  reconnecting: "Reconnecting",
  stopping: "Stopping",
  stopped: "Stopped",
  error: "Needs attention",
};

interface ToolbarProps {
  workflowName: string;
  status: RecordingStatus;
  transportStatus: TransportStatus;
  elapsed: string;
  stepCount: number;
  onNameChange: (name: string) => void;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
}

export function Toolbar({
  workflowName,
  status,
  transportStatus,
  elapsed,
  stepCount,
  onNameChange,
  onStart,
  onStop,
  onExport,
}: ToolbarProps) {
  const active = ["starting", "recording", "reconnecting", "stopping"].includes(status);
  const busy = ["starting", "stopping"].includes(status);
  return (
    <header className="toolbar">
      <a className="skip-link" href="#workspace-main">Skip to workspace</a>
      <h1 className="brand" aria-label="Browser Memory Recorder">
        <span className="brand-mark"><Radio size={18} aria-hidden="true" /></span>
        <span>Memory Recorder</span>
      </h1>
      <label className="workflow-name">
        <span className="sr-only">Workflow name</span>
        <input value={workflowName} onChange={(event) => onNameChange(event.target.value)} aria-label="Workflow name" />
      </label>
      <div className="toolbar-status" aria-live="polite">
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span>{labels[status]}</span>
        {active ? <span className="timer">{elapsed}</span> : null}
        {transportStatus !== "connected" ? <span className="transport-label">{transportStatus}</span> : null}
      </div>
      <div className="toolbar-actions">
        {active ? (
          <button className="button button-secondary" type="button" onClick={onStop} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <CircleStop size={17} />}
            Stop
          </button>
        ) : (
          <button className="button button-primary" type="button" onClick={onStart} disabled={status === "configurationMissing" || transportStatus === "offline"}>
            <Plus size={17} aria-hidden="true" />
            New recording
          </button>
        )}
        <button className="button button-ghost" type="button" onClick={onExport} disabled={!stepCount}>
          <Download size={17} aria-hidden="true" />
          Export
        </button>
      </div>
    </header>
  );
}
