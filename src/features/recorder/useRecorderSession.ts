"use client";

import { useCallback, useEffect, useState } from "react";
import { useRecorderSocket } from "@/hooks/use-recorder-socket";
import type { ClientMessage, ReplayStatus, ServerMessage } from "@/lib/protocol";
import { stepFromRecordedAction } from "@/lib/workflow/recorded-action";
import type { WorkflowStep } from "@/lib/workflow/schema";
import type {
  BrowserPageState,
  DatePickerState,
  PopupState,
  RecordingStatus,
  ReplayStepResultState,
} from "@/lib/recorder-session";
import { getDisplayError, getDisplayStatus } from "@/lib/recorder-session";

interface RecorderSessionOptions {
  onSessionStarted: (sessionId: string) => void;
  onStepRecorded: (step: WorkflowStep) => void;
  onReplayStepChange?: (stepId: string, status: ReplayStepResultState["status"]) => void;
}

function formatElapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function useRecorderSession({ onSessionStarted, onStepRecorded, onReplayStepChange }: RecorderSessionOptions) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [browserPage, setBrowserPage] = useState<BrowserPageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorContext, setErrorContext] = useState<"recording" | "replay">("recording");
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [navigationPending, setNavigationPending] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [datePicker, setDatePicker] = useState<DatePickerState | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>("idle");
  const [replayRunId, setReplayRunId] = useState<string | null>(null);
  const [replayCurrentStepId, setReplayCurrentStepId] = useState<string | null>(null);
  const [replayCurrentIndex, setReplayCurrentIndex] = useState(0);
  const [replayTotalSteps, setReplayTotalSteps] = useState(0);
  const [replayResults, setReplayResults] = useState<Record<string, ReplayStepResultState>>({});

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "server.ready":
        setStatus((current) => message.configured ? (current === "configurationMissing" ? "idle" : current) : "configurationMissing");
        break;
      case "session.started":
        onSessionStarted(message.sessionId);
        setLiveViewUrl(message.liveViewUrl);
        setBrowserPage(null);
        setNavigationError(null);
        setNavigationPending(false);
        setDatePicker(null);
        setStartedAt(Date.now());
        setError(null);
        setErrorContext("recording");
        break;
      case "session.status":
        setStatus(message.status);
        if (message.status === "stopped") {
          setStartedAt(null);
          setNavigationPending(false);
          setNavigationError(null);
          setBrowserPage(null);
          setLiveViewUrl(null);
          setDatePicker(null);
        }
        break;
      case "recorded.action":
        onStepRecorded(stepFromRecordedAction(message.action, 0));
        break;
      case "popup.detected":
        setPopup({ pageId: message.pageId, title: message.title, url: message.url });
        break;
      case "popup.switched":
        setLiveViewUrl(message.liveViewUrl);
        setBrowserPage(null);
        setPopup(null);
        break;
      case "browser.page":
        setBrowserPage({ pageId: message.pageId, title: message.title, url: message.url });
        setNavigationError(null);
        setNavigationPending(false);
        break;
      case "browser.navigation.error":
        setNavigationError(message.message);
        setNavigationPending(false);
        break;
      case "date.picker.open":
        setDatePicker({
          requestId: message.requestId,
          value: message.value,
          min: message.min,
          max: message.max,
          rect: message.rect,
          viewport: message.viewport,
        });
        break;
      case "date.picker.closed":
        setDatePicker((current) => current?.requestId === message.requestId ? null : current);
        break;
      case "replay.started":
        setReplayRunId(message.runId);
        setReplayTotalSteps(message.totalSteps);
        setLiveViewUrl(message.liveViewUrl);
        setBrowserPage(null);
        setError(null);
        setErrorContext("replay");
        setNavigationError(null);
        setNavigationPending(false);
        break;
      case "replay.status":
        setReplayRunId(message.runId);
        setReplayStatus(message.status);
        setReplayTotalSteps(message.totalSteps);
        setReplayCurrentStepId(message.currentStepId ?? null);
        setReplayCurrentIndex(message.currentIndex ?? 0);
        if (message.status === "stopped") {
          setLiveViewUrl(null);
          setBrowserPage(null);
          setReplayRunId(null);
          setReplayCurrentStepId(null);
        }
        break;
      case "replay.step":
        setReplayResults((current) => ({
          ...current,
          [message.stepId]: {
            status: message.status,
            durationMs: message.durationMs,
            locatorKind: message.locatorKind,
            diagnostic: message.diagnostic,
          },
        }));
        onReplayStepChange?.(message.stepId, message.status);
        break;
      case "buffer.gap":
        setError("Some events could not be recovered after the connection interruption. Stop and review this workflow before exporting.");
        break;
      case "server.error":
        setNavigationPending(false);
        if (message.code === "INVALID_MESSAGE" && liveViewUrl) {
          setNavigationError(message.message);
          break;
        }
        setError(message.message);
        if (replayStatus !== "idle" && replayStatus !== "stopped") {
          setErrorContext("replay");
          setReplayStatus("stopped");
        }
        else setStatus("error");
        break;
    }
  }, [liveViewUrl, onReplayStepChange, onSessionStarted, onStepRecorded, replayStatus]);

  const { transportStatus, send } = useRecorderSocket(handleServerMessage);

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data !== "browserbase-disconnected") return;
      setStatus("error");
      setError("Browserbase ended the Live View connection. The workflow recorded so far is preserved.");
      setLiveViewUrl(null);
      setBrowserPage(null);
      setDatePicker(null);
      setNavigationPending(false);
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);

  const resetSessionState = () => {
    setStatus("starting");
    setError(null);
    setErrorContext("recording");
    setNavigationError(null);
    setNavigationPending(false);
    setBrowserPage(null);
    setPopup(null);
    setLiveViewUrl(null);
    setDatePicker(null);
  };

  const sessionStartCommand = (): ClientMessage => ({
    type: status === "error" || liveViewUrl ? "session.restart" : "session.start",
  });

  const startRecording = () => {
    const command = sessionStartCommand();
    resetSessionState();
    if (!send(command)) {
      setStatus("error");
      setError("The recorder is not connected yet. Wait a moment and retry.");
    }
  };

  const startAfterDiscard = () => {
    const command = sessionStartCommand();
    resetSessionState();
    send(command);
  };

  const stopRecording = () => {
    setStatus("stopping");
    send({ type: "session.stop" });
  };

  const startReplay = (workflow: import("@/lib/workflow/schema").Workflow, startStepId?: string) => {
    setReplayStatus("preparing");
    setReplayRunId(null);
    setReplayCurrentStepId(null);
    setReplayCurrentIndex(0);
    setReplayTotalSteps(workflow.steps.slice(startStepId ? workflow.steps.findIndex((step) => step.id === startStepId) : 0).length);
    const startIndex = startStepId ? workflow.steps.findIndex((step) => step.id === startStepId) : 0;
    setReplayResults(Object.fromEntries(workflow.steps.slice(Math.max(0, startIndex)).map((step) => [step.id, { status: "pending" as const }])));
    setError(null);
    setErrorContext("replay");
    setLiveViewUrl(null);
    setBrowserPage(null);
    if (!send({ type: "replay.start", workflow, startStepId })) {
      setReplayStatus("stopped");
      setError("The recorder connection is unavailable. Wait a moment and try again.");
    }
  };

  const sendBrowserCommand = (command: ClientMessage) => {
    setNavigationError(null);
    if (send(command)) {
      setNavigationPending(true);
      return;
    }
    setNavigationPending(false);
    setNavigationError("The recorder connection is unavailable. Wait a moment and try again.");
  };

  const displayStatus = getDisplayStatus(status, transportStatus);
  const displayError = getDisplayError(status, transportStatus, error);
  const selectDate = useCallback((requestId: string, value: string) => {
    setDatePicker((current) => current?.requestId === requestId ? null : current);
    send({ type: "date.picker.select", requestId, value });
  }, [send]);
  const dismissDatePicker = useCallback((requestId: string) => {
    setDatePicker((current) => current?.requestId === requestId ? null : current);
    send({ type: "date.picker.dismiss", requestId });
  }, [send]);

  return {
    browserPage,
    datePicker,
    displayError,
    errorContext,
    displayStatus,
    elapsed: formatElapsed(startedAt, now),
    liveViewUrl,
    navigationError,
    navigationPending,
    popup,
    replayCurrentIndex,
    replayCurrentStepId,
    replayResults,
    replayRunId,
    replayStatus,
    replayTotalSteps,
    reportError: setError,
    clearError: () => setError(null),
    sendBrowserCommand,
    selectDate,
    dismissDatePicker,
    startAfterDiscard,
    startReplay,
    startRecording,
    stopRecording,
    switchPopup: (pageId: string) => send({ type: "popup.switch", pageId }),
    pauseReplay: () => send({ type: "replay.pause" }),
    resumeReplay: () => send({ type: "replay.resume" }),
    retryReplay: () => send({ type: "replay.retry" }),
    skipReplay: () => send({ type: "replay.skip" }),
    takeControlOfReplay: () => send({ type: "replay.takeControl" }),
    stopReplay: () => send({ type: "replay.stop" }),
    transportStatus,
  };
}
