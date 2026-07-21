"use client";

import { CircleStop, LoaderCircle, Play } from "lucide-react";
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

interface RecorderControlsProps {
  status: RecordingStatus;
  transportStatus: TransportStatus;
  elapsed: string;
  onStart: () => void;
  onStop: () => void;
  variant?: "chrome" | "rail";
  announce?: boolean;
}

export function RecorderControls({
  status,
  transportStatus,
  elapsed,
  onStart,
  onStop,
  variant = "chrome",
  announce = false,
}: RecorderControlsProps) {
  const active = ["starting", "recording", "reconnecting", "stopping"].includes(status);
  const busy = status === "starting" || status === "stopping";
  const label = status === "configurationMissing"
    ? labels[status]
    : transportStatus === "offline"
      ? "Offline"
      : transportStatus === "connecting" && (status === "idle" || status === "stopped")
        ? "Connecting"
        : transportStatus === "reconnecting"
          ? "Reconnecting"
          : labels[status];
  const visualStatus = transportStatus === "offline"
    ? "error"
    : transportStatus === "connecting" && (status === "idle" || status === "stopped")
      ? "starting"
      : transportStatus === "reconnecting"
        ? "reconnecting"
        : status;
  const startDisabled = status === "configurationMissing" || transportStatus === "offline";
  const actionLabel = active ? "Stop recording" : "Start recording";

  return (
    <div
      className={`recorder-controls recorder-controls-${variant}`}
      aria-live={announce ? "polite" : undefined}
    >
      <span className="recorder-status" aria-label={`Recorder status: ${label}`} title={variant === "rail" ? label : undefined}>
        <span className={`recorder-status-dot recorder-status-${visualStatus}`} aria-hidden="true" />
        {variant === "chrome" ? <strong className="recorder-status-label">{label}</strong> : null}
        {variant === "chrome" && active ? <span className="recorder-timer">{elapsed}</span> : null}
      </span>
      <button
        className={`recorder-action recorder-action-${active ? "stop" : "start"}`}
        type="button"
        onClick={active ? onStop : onStart}
        disabled={active ? busy : startDisabled}
        aria-label={`${actionLabel}; recorder ${label.toLowerCase()}`}
        title={variant === "rail" ? actionLabel : undefined}
      >
        {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : active ? <CircleStop size={16} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        {variant === "chrome" ? <span className="recorder-action-label">{active ? "Stop" : "Start"}</span> : null}
      </button>
    </div>
  );
}
