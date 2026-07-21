"use client";

import { useCallback, useEffect, useState } from "react";
import { useRecorderSocket } from "@/hooks/use-recorder-socket";
import type { ClientMessage, ServerMessage } from "@/lib/protocol";
import { stepFromRecordedAction } from "@/lib/workflow/recorded-action";
import type { WorkflowStep } from "@/lib/workflow/schema";
import type {
  BrowserPageState,
  PopupState,
  RecordingStatus,
} from "@/lib/recorder-session";
import { getDisplayError, getDisplayStatus } from "@/lib/recorder-session";

interface RecorderSessionOptions {
  onSessionStarted: (sessionId: string) => void;
  onStepRecorded: (step: WorkflowStep) => void;
}

function formatElapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function useRecorderSession({ onSessionStarted, onStepRecorded }: RecorderSessionOptions) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [browserPage, setBrowserPage] = useState<BrowserPageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [navigationPending, setNavigationPending] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

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
        setStartedAt(Date.now());
        setError(null);
        break;
      case "session.status":
        setStatus(message.status);
        if (message.status === "stopped") {
          setStartedAt(null);
          setNavigationPending(false);
          setNavigationError(null);
          setBrowserPage(null);
          setLiveViewUrl(null);
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
        setStatus("error");
        break;
    }
  }, [liveViewUrl, onSessionStarted, onStepRecorded]);

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
      setNavigationPending(false);
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);

  const resetSessionState = () => {
    setStatus("starting");
    setError(null);
    setNavigationError(null);
    setNavigationPending(false);
    setBrowserPage(null);
    setPopup(null);
    setLiveViewUrl(null);
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

  return {
    browserPage,
    displayError,
    displayStatus,
    elapsed: formatElapsed(startedAt, now),
    liveViewUrl,
    navigationError,
    navigationPending,
    popup,
    reportError: setError,
    sendBrowserCommand,
    startAfterDiscard,
    startRecording,
    stopRecording,
    switchPopup: (pageId: string) => send({ type: "popup.switch", pageId }),
    transportStatus,
  };
}
