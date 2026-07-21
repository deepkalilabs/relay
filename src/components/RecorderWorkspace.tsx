"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { BrowserPanel } from "@/components/BrowserPanel";
import { ManualStepDialog } from "@/components/ManualStepDialog";
import { StepEditor } from "@/components/StepEditor";
import { Toolbar, type RecordingStatus } from "@/components/Toolbar";
import { Modal } from "@/components/ui/Modal";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { useRecorderSocket } from "@/hooks/use-recorder-socket";
import type { ServerMessage } from "@/lib/protocol";
import { downloadWorkflow } from "@/lib/workflow/export";
import { stepFromRecordedAction } from "@/lib/workflow/recorded-action";
import { WorkflowSchema } from "@/lib/workflow/schema";
import { initialWorkflowState, workflowReducer } from "@/lib/workflow/store";

interface PopupState { pageId: string; title: string; url: string }
type Confirmation = "new" | "sensitiveExport" | null;

function formatElapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RecorderWorkspace() {
  const [workflowState, dispatch] = useReducer(workflowReducer, undefined, initialWorkflowState);
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [editorHeight, setEditorHeight] = useState(240);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "server.ready":
        setStatus((current) => message.configured ? (current === "configurationMissing" ? "idle" : current) : "configurationMissing");
        break;
      case "session.started":
        dispatch({ type: "reset", sessionId: message.sessionId });
        setLiveViewUrl(message.liveViewUrl);
        setStartedAt(Date.now());
        setError(null);
        break;
      case "session.status":
        setStatus(message.status);
        if (message.status === "stopped") setStartedAt(null);
        break;
      case "recorded.action": {
        const step = stepFromRecordedAction(message.action, 0);
        dispatch({ type: "append", step });
        setAnnouncement(`${step.name} added to the workflow.`);
        break;
      }
      case "popup.detected":
        setPopup({ pageId: message.pageId, title: message.title, url: message.url });
        break;
      case "popup.switched":
        setLiveViewUrl(message.liveViewUrl);
        setPopup(null);
        break;
      case "buffer.gap":
        setError("Some events could not be recovered after the connection interruption. Stop and review this workflow before exporting.");
        break;
      case "server.error":
        setError(message.message);
        setStatus("error");
        break;
    }
  }, []);

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
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, []);

  const beginRecording = () => {
    if (workflowState.dirty && workflowState.workflow.steps.length) {
      setConfirmation("new");
      return;
    }
    setStatus("starting"); setError(null); setPopup(null); setLiveViewUrl(null);
    const command = status === "error" || liveViewUrl ? { type: "session.restart" as const } : { type: "session.start" as const };
    if (!send(command)) {
      setStatus("error");
      setError("The recorder is not connected yet. Wait a moment and retry.");
    }
  };

  const confirmNew = () => {
    setConfirmation(null);
    dispatch({ type: "reset" });
    setStatus("starting"); setError(null); setPopup(null); setLiveViewUrl(null);
    send({ type: liveViewUrl || status === "error" ? "session.restart" : "session.start" });
  };

  const stopRecording = () => {
    setStatus("stopping");
    send({ type: "session.stop" });
  };

  const exportNow = () => {
    const parsed = WorkflowSchema.safeParse(workflowState.workflow);
    if (!parsed.success) {
      setError(`Workflow export is blocked: ${parsed.error.issues[0]?.message}`);
      return;
    }
    downloadWorkflow(parsed.data);
    dispatch({ type: "markClean" });
    setConfirmation(null);
    setAnnouncement("Workflow JSON downloaded.");
  };

  const requestExport = () => {
    if (workflowState.workflow.steps.some((step) => step.metadata.sensitive)) setConfirmation("sensitiveExport");
    else exportNow();
  };

  const selectedStep = useMemo(() => workflowState.workflow.steps.find((step) => step.id === workflowState.selectedStepId) ?? null, [workflowState.workflow.steps, workflowState.selectedStepId]);
  const activePage = selectedStep?.page ?? { id: "manual", url: liveViewUrl ? "about:blank" : "", title: "Manual step" };
  const displayStatus: RecordingStatus = transportStatus === "reconnecting" && status === "recording"
    ? "reconnecting"
    : transportStatus === "offline" && ["recording", "starting"].includes(status)
      ? "error"
      : status;
  const displayError = transportStatus === "offline" && ["recording", "starting"].includes(status)
    ? "The local recorder connection could not be restored. Your existing steps are still available."
    : error;

  const beginResize = (event: React.PointerEvent) => {
    const startY = event.clientY;
    const startHeight = editorHeight;
    const move = (moveEvent: PointerEvent) => setEditorHeight(Math.min(420, Math.max(180, startHeight + startY - moveEvent.clientY)));
    const end = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", end); };
    addEventListener("pointermove", move); addEventListener("pointerup", end);
  };

  return (
    <>
      <div className="viewport-guard" role="main">
        <span className="guard-icon"><AlertTriangle size={24} /></span><h1>A larger screen is required</h1><p>Memory Recorder is a desktop workspace designed for viewports at least 1024px wide.</p>
      </div>
      <div className="desktop-app">
        <Toolbar
          workflowName={workflowState.workflow.name}
          status={displayStatus}
          transportStatus={transportStatus}
          elapsed={formatElapsed(startedAt, now)}
          stepCount={workflowState.workflow.steps.length}
          onNameChange={(name) => dispatch({ type: "renameWorkflow", name })}
          onStart={beginRecording}
          onStop={stopRecording}
          onExport={requestExport}
        />
        <main id="workspace-main" className="workspace" style={{ "--editor-height": `${editorHeight}px` } as React.CSSProperties}>
          <WorkflowTimeline
            steps={workflowState.workflow.steps}
            selectedId={workflowState.selectedStepId}
            onSelect={(id) => dispatch({ type: "select", id })}
            onToggle={(step) => dispatch({ type: "update", step })}
            onDuplicate={(id) => dispatch({ type: "duplicate", id })}
            onDelete={(id) => dispatch({ type: "delete", id })}
            onReorder={(activeId, overId) => dispatch({ type: "reorder", activeId, overId })}
            onInsert={() => setManualOpen(true)}
          />
          <div className="main-stage">
            <BrowserPanel status={displayStatus} liveViewUrl={liveViewUrl} error={displayError} popup={popup} onStart={beginRecording} onRetry={beginRecording} onSwitchPopup={(pageId) => send({ type: "popup.switch", pageId })} />
            <section className="editor-panel" aria-label="Selected step editor" style={{ height: editorHeight }}>
              <button className="resize-handle" type="button" onPointerDown={beginResize} aria-label="Resize step editor" />
              <StepEditor step={selectedStep} onUpdate={(step) => dispatch({ type: "update", step })} />
            </section>
          </div>
        </main>
        {workflowState.deletedStep ? <div className="undo-toast" role="status"><span>Step deleted</span><button type="button" onClick={() => dispatch({ type: "undoDelete" })}><RotateCcw size={14} /> Undo</button></div> : null}
        <div className="sr-only" aria-live="polite">{announcement}</div>
      </div>
      <ManualStepDialog open={manualOpen} order={workflowState.workflow.steps.length} page={activePage} onClose={() => setManualOpen(false)} onInsert={(step) => dispatch({ type: "insert", step, afterId: workflowState.selectedStepId ?? undefined })} />
      <Modal open={confirmation === "new"} title="Start a new recording?" description="The current workflow only lives in this tab." onClose={() => setConfirmation(null)}>
        <p className="modal-copy">Export the current workflow first if you want to keep it. Starting over clears all recorded and edited steps.</p>
        <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setConfirmation(null)}>Keep editing</button><button className="button button-danger" type="button" onClick={confirmNew}>Discard and start</button></div>
      </Modal>
      <Modal open={confirmation === "sensitiveExport"} title="This export contains sensitive values" description="Passwords, tokens, or payment-related fields were detected." onClose={() => setConfirmation(null)}>
        <p className="modal-copy">The downloaded JSON contains recorded values in plain text. Store it like a secret and do not commit it to source control.</p>
        <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setConfirmation(null)}>Cancel</button><button className="button button-danger" type="button" onClick={exportNow}>Export sensitive JSON</button></div>
      </Modal>
    </>
  );
}
