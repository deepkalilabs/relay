"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { AlertTriangle, ChevronLeft, RotateCcw, X } from "lucide-react";
import { BrowserPanel } from "@/features/browser/BrowserPanel";
import { Modal } from "@/components/ui/Modal";
import { useRecorderSession } from "@/features/recorder/useRecorderSession";
import { useWorkspacePanels } from "@/features/recorder/useWorkspacePanels";
import { WorkspaceNavbar } from "@/features/recorder/WorkspaceNavbar";
import { RunWorkflowDialog } from "@/features/replay/RunWorkflowDialog";
import { ManualStepDialog } from "@/features/workflow/ManualStepDialog";
import { StepEditor } from "@/features/workflow/StepEditor";
import { WorkflowTimeline } from "@/features/workflow/WorkflowTimeline";
import { downloadWorkflow } from "@/lib/workflow/export";
import { parseWorkflowJson } from "@/lib/workflow/import";
import type { Workflow, WorkflowStep } from "@/lib/workflow/schema";
import { WorkflowSchema } from "@/lib/workflow/schema";
import { initialWorkflowState, workflowReducer } from "@/lib/workflow/store";

type Confirmation = "new" | "sensitiveExport" | "replaceImport" | null;

export function RecorderWorkspace() {
  const [workflowState, dispatch] = useReducer(workflowReducer, undefined, initialWorkflowState);
  const [manualOpen, setManualOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingImport, setPendingImport] = useState<Workflow | null>(null);
  const [pendingReplayStartId, setPendingReplayStartId] = useState<string | undefined>();
  const [importError, setImportError] = useState<string | null>(null);

  const onSessionStarted = useCallback((sessionId: string) => {
    dispatch({ type: "reset", sessionId });
  }, []);
  const onReplaySessionStarted = useCallback((sessionId: string) => {
    dispatch({ type: "setSessionId", sessionId });
  }, []);
  const onStepRecorded = useCallback((step: WorkflowStep) => {
    dispatch({ type: "append", step });
    setAnnouncement(`${step.name} added to the workflow.`);
  }, []);
  const onStartUrl = useCallback((url: string) => {
    dispatch({ type: "setStartUrl", url });
  }, []);
  const onReplayStepChange = useCallback((stepId: string, status: import("@/lib/recorder-session").ReplayStepResultState["status"]) => {
    if (status === "running" || status === "failed") dispatch({ type: "select", id: stepId });
    setAnnouncement(`Replay step ${status}.`);
  }, []);
  const session = useRecorderSession({ onSessionStarted, onReplaySessionStarted, onStartUrl, onStepRecorded, onReplayStepChange });
  const replayLocked = ["preparing", "running", "pausing", "paused", "manual", "stopping"].includes(session.replayStatus);
  const panels = useWorkspacePanels({
    selectedStepId: workflowState.selectedStepId,
    overlayOpen: Boolean(confirmation || manualOpen || runDialogOpen),
  });

  useEffect(() => {
    if (!workflowState.deletedStep) return;
    const timeout = window.setTimeout(() => dispatch({ type: "dismissDelete" }), 5000);
    return () => window.clearTimeout(timeout);
  }, [workflowState.deletedStep]);

  const beginRecording = () => {
    if (workflowState.workflow.steps.length) {
      setConfirmation("new");
      return;
    }
    session.startRecording();
  };

  const loadWorkflow = (workflow: Workflow) => {
    dispatch({ type: "load", workflow });
    setPendingImport(null);
    setConfirmation(null);
    setAnnouncement(`${workflow.name} imported with ${workflow.steps.length} steps.`);
  };

  const importWorkflow = async (file: File) => {
    setImportError(null);
    try {
      const workflow = parseWorkflowJson(await file.text(), file.size);
      if (workflowState.workflow.steps.length || workflowState.dirty) {
        setPendingImport(workflow);
        setConfirmation("replaceImport");
      } else loadWorkflow(workflow);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The workflow file could not be imported.");
    }
  };

  const closeRunDialog = () => {
    setRunDialogOpen(false);
    setPendingReplayStartId(undefined);
  };

  const requestReplay = (startStepId?: string) => {
    setPendingReplayStartId(startStepId);
    setRunDialogOpen(true);
  };

  const startReplayNow = () => {
    const startStepId = pendingReplayStartId;
    setRunDialogOpen(false);
    setPendingReplayStartId(undefined);
    session.startReplay(workflowState.workflow, startStepId);
  };

  const confirmNew = () => {
    setConfirmation(null);
    dispatch({ type: "reset" });
    session.startAfterDiscard();
  };

  const exportNow = () => {
    const parsed = WorkflowSchema.safeParse(workflowState.workflow);
    if (!parsed.success) {
      session.reportError(`Workflow export is blocked: ${parsed.error.issues[0]?.message}`);
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
  const pendingReplayStep = useMemo(() => workflowState.workflow.steps.find((step) => step.id === pendingReplayStartId), [pendingReplayStartId, workflowState.workflow.steps]);
  const workflowContainsSensitiveValues = useMemo(() => workflowState.workflow.steps.some((step) => step.metadata.sensitive), [workflowState.workflow.steps]);
  const activePage = selectedStep?.page ?? (session.browserPage
    ? { id: session.browserPage.pageId, url: session.browserPage.url, title: session.browserPage.title }
    : { id: "manual", url: session.liveViewUrl ? "about:blank" : "", title: "Manual step" });

  return (
    <>
      <div className="viewport-guard" role="main">
        <span className="guard-icon"><AlertTriangle size={24} /></span><h1>A larger screen is required</h1><p>Memory Recorder is a desktop workspace designed for viewports at least 1024px wide.</p>
      </div>
      <div className="desktop-app">
        <a className="skip-link" href="#browser-workspace">Skip to browser workspace</a>
        <main
          className="workspace"
          style={{
            "--timeline-width": `${panels.timelineCollapsed ? 44 : panels.timelineWidth}px`,
            "--inspector-width": `${panels.inspectorCollapsed ? 44 : panels.inspectorWidth}px`,
          } as React.CSSProperties}
        >
          <div className={`timeline-shell ${panels.timelineCollapsed ? "collapsed" : ""}`}>
            <WorkspaceNavbar
              collapsed={panels.timelineCollapsed}
              workflowName={workflowState.workflow.name}
              status={session.displayStatus}
              transportStatus={session.transportStatus}
              stepCount={workflowState.workflow.steps.length}
              onNameChange={(name) => dispatch({ type: "renameWorkflow", name })}
              onExpand={panels.expandTimeline}
              onStart={beginRecording}
              onStop={session.stopRecording}
              onExport={requestExport}
              onImport={(file) => void importWorkflow(file)}
              onReplay={() => requestReplay()}
              importDisabled={replayLocked}
              replayDisabled={!workflowState.workflow.steps.some((step) => step.enabled) || replayLocked || session.transportStatus === "offline"}
            />
            {!panels.timelineCollapsed ? (
              <>
                <WorkflowTimeline
                  steps={workflowState.workflow.steps}
                  selectedId={workflowState.selectedStepId}
                  onSelect={(id) => { dispatch({ type: "select", id }); panels.setInspectorCollapsed(false); }}
                  onToggle={(step) => dispatch({ type: "update", step })}
                  onDelete={(id) => dispatch({ type: "delete", id })}
                  onReorder={(activeId, overId) => dispatch({ type: "reorder", activeId, overId })}
                  onInsert={() => setManualOpen(true)}
                  onCollapse={panels.collapseTimeline}
                  replayResults={session.replayResults}
                  locked={replayLocked}
                />
                <div
                  className="panel-resizer timeline-resizer"
                  role="separator"
                  tabIndex={0}
                  aria-label="Resize workflow timeline"
                  aria-orientation="vertical"
                  aria-valuemin={panels.panelLimits.timeline.min}
                  aria-valuemax={panels.panelLimits.timeline.max}
                  aria-valuenow={panels.timelineWidth}
                  onPointerDown={(event) => panels.beginPanelResize("timeline", event)}
                  onKeyDown={(event) => panels.resizePanelWithKeyboard("timeline", event)}
                />
              </>
            ) : null}
          </div>
          <div id="browser-workspace" className="main-stage" tabIndex={-1}>
            <BrowserPanel
              status={session.displayStatus}
              transportStatus={session.transportStatus}
              startedAt={session.startedAt}
              liveViewUrl={session.liveViewUrl}
              page={session.browserPage}
              error={session.displayError}
              errorContext={session.errorContext}
              onDismissError={session.clearError}
              navigationError={session.navigationError}
              navigationPending={session.navigationPending}
              popup={session.popup}
              datePicker={session.datePicker}
              selectPicker={session.selectPicker}
              nativeSelects={session.nativeSelects}
              onBack={() => session.sendBrowserCommand({ type: "browser.back" })}
              onForward={() => session.sendBrowserCommand({ type: "browser.forward" })}
              onNavigate={(url) => session.sendBrowserCommand({ type: "browser.navigate", url })}
              onReload={() => session.sendBrowserCommand({ type: "browser.reload" })}
              onStart={beginRecording}
              onStop={session.stopRecording}
              onRetry={beginRecording}
              onSwitchPopup={session.switchPopup}
              onDateSelect={(requestId, value) => session.selectDate(requestId, value)}
              onDateDismiss={(requestId) => session.dismissDatePicker(requestId)}
              onSelectPickerSelect={(requestId, value) => session.selectPickerOption(requestId, value)}
              onSelectPickerDismiss={(requestId) => session.dismissSelectPicker(requestId)}
              onNativeSelectsChange={session.setNativeSelects}
              replayStatus={session.replayStatus}
              replayCurrentIndex={session.replayCurrentIndex}
              replayTotalSteps={session.replayTotalSteps}
              replayCurrentResult={session.replayCurrentStepId ? session.replayResults[session.replayCurrentStepId] : undefined}
              replayReadyCount={workflowState.workflow.steps.length}
              onReplay={() => requestReplay()}
              onReplayPause={session.pauseReplay}
              onReplayResume={session.resumeReplay}
              onReplayRetry={session.retryReplay}
              onReplaySkip={session.skipReplay}
              onReplayTakeControl={session.takeControlOfReplay}
              onReplayStop={session.stopReplay}
            />
          </div>
          <aside className={`inspector-shell ${panels.inspectorCollapsed ? "collapsed" : ""}`} aria-label="Selected step editor">
            {panels.inspectorCollapsed ? (
              <div className="panel-rail panel-rail-right">
                <button id="inspector-expand" className="rail-button" type="button" onClick={panels.expandInspector} aria-label="Expand step details" title="Expand details">
                  <ChevronLeft size={19} aria-hidden="true" /><span>Details</span>
                </button>
              </div>
            ) : (
              <>
                <div
                  className="panel-resizer inspector-resizer"
                  role="separator"
                  tabIndex={0}
                  aria-label="Resize step details"
                  aria-orientation="vertical"
                  aria-valuemin={panels.panelLimits.inspector.min}
                  aria-valuemax={panels.panelLimits.inspector.max}
                  aria-valuenow={panels.inspectorWidth}
                  onPointerDown={(event) => panels.beginPanelResize("inspector", event)}
                  onKeyDown={(event) => panels.resizePanelWithKeyboard("inspector", event)}
                />
                <StepEditor
                  step={selectedStep}
                  onUpdate={(step) => dispatch({ type: "update", step })}
                  onCollapse={panels.collapseInspector}
                  locked={replayLocked}
                  replayResult={selectedStep ? session.replayResults[selectedStep.id] : undefined}
                  onRunFromHere={() => selectedStep && requestReplay(selectedStep.id)}
                />
              </>
            )}
          </aside>
        </main>
        {workflowState.deletedStep ? (
          <div className="undo-toast">
            <span role="status" aria-live="polite">Step deleted</span>
            <div className="undo-toast-actions">
              <button className="undo-toast-action" type="button" onClick={() => dispatch({ type: "undoDelete" })}>
                <RotateCcw size={16} aria-hidden="true" /> Undo
              </button>
              <button className="undo-toast-close" type="button" onClick={() => dispatch({ type: "dismissDelete" })} aria-label="Dismiss undo notification" title="Dismiss">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
        <div className="sr-only" aria-live="polite">{announcement}</div>
      </div>
      <ManualStepDialog open={manualOpen} order={workflowState.workflow.steps.length} page={activePage} onClose={() => setManualOpen(false)} onInsert={(step) => dispatch({ type: "insert", step, afterId: workflowState.selectedStepId ?? undefined })} />
      <RunWorkflowDialog
        open={runDialogOpen}
        sensitive={workflowContainsSensitiveValues}
        startStepName={pendingReplayStep?.name}
        onClose={closeRunDialog}
        onRun={startReplayNow}
      />
      <Modal open={confirmation === "new"} title="Start a new recording?" description="The current workflow only lives in this tab." onClose={() => setConfirmation(null)}>
        <p className="modal-copy">Export the current workflow first if you want to keep it. Starting over clears all recorded and edited steps.</p>
        <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setConfirmation(null)}>Keep editing</button><button className="button button-danger" type="button" onClick={confirmNew}>Discard and start</button></div>
      </Modal>
      <Modal open={confirmation === "sensitiveExport"} title="This export contains sensitive values" description="Passwords, tokens, or payment-related fields were detected." onClose={() => setConfirmation(null)}>
        <p className="modal-copy">The downloaded JSON contains recorded values in plain text. Store it like a secret and do not commit it to source control.</p>
        <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setConfirmation(null)}>Cancel</button><button className="button button-danger" type="button" onClick={exportNow}>Export sensitive JSON</button></div>
      </Modal>
      <Modal open={confirmation === "replaceImport"} title="Replace the current workflow?" description="The imported workflow will replace every step currently in the timeline." onClose={() => { setConfirmation(null); setPendingImport(null); }}>
        <p className="modal-copy">Export the current workflow first if you want to keep it. Importing does not merge workflows.</p>
        <div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => { setConfirmation(null); setPendingImport(null); }}>Cancel</button><button className="button button-danger" type="button" onClick={() => pendingImport && loadWorkflow(pendingImport)}>Replace workflow</button></div>
      </Modal>
      <Modal open={Boolean(importError)} title="Workflow could not be imported" description={importError ?? "The selected file is invalid."} onClose={() => setImportError(null)}>
        <div className="modal-actions"><button className="button button-primary" type="button" onClick={() => setImportError(null)}>Choose another file</button></div>
      </Modal>
    </>
  );
}
