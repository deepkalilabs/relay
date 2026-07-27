export type RecordingStatus =
  | "configurationMissing"
  | "idle"
  | "starting"
  | "recording"
  | "reconnecting"
  | "stopping"
  | "stopped"
  | "error";

export type TransportStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface ReplayStepResultState {
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  phase?: "acting" | "settling" | "waiting";
  durationMs?: number;
  locatorKind?: string;
  diagnostic?: {
    message: string;
    attemptedLocators: Array<{ kind: string; reason: string }>;
  };
}

export function getDisplayStatus(status: RecordingStatus, transportStatus: TransportStatus): RecordingStatus {
  if (transportStatus === "reconnecting" && status === "recording") return "reconnecting";
  if (transportStatus === "offline" && ["recording", "starting"].includes(status)) return "error";
  return status;
}

export function getDisplayError(
  status: RecordingStatus,
  transportStatus: TransportStatus,
  error: string | null,
): string | null {
  if (transportStatus === "offline" && ["recording", "starting"].includes(status)) {
    return "The local recorder connection could not be restored. Your existing steps are still available.";
  }
  return error;
}
