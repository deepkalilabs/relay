"use client";

import { AlertTriangle, ArrowRight, ChevronLeft, Play, RotateCcw, X } from "lucide-react";
import { BrowserPanel } from "@/features/browser";
import { RecorderControls } from "@/features/recorder";
import { ReplayControls, ReplayFailurePanel, RunWorkflowDialog } from "@/features/replay";
import { ManualStepDialog, StepEditor, WorkflowTimeline } from "@/features/workflow";
import { Modal } from "@/components/ui/Modal";
import { WorkspaceNavbar } from "./WorkspaceNavbar";
import { useWorkspaceController } from "./useWorkspaceController";

export function RecorderWorkspace() {
  const controller = useWorkspaceController();
  const { browser, dialogs, layout, recorder, replay, workflow } = controller;
  const workflowState = workflow.model.state;

  return (
    <>
      <div className="viewport-guard" role="main">
        <span className="guard-icon"><AlertTriangle size={24} /></span>
        <h1>A larger screen is required</h1>
        <p>Memory Recorder is a desktop workspace designed for viewports at least 1024px wide.</p>
      </div>
      <div className="desktop-app">
        <a className="skip-link" href="#browser-workspace">Skip to browser workspace</a>
        <main
          className="workspace"
          style={{
            "--timeline-width": `${layout.model.timelineCollapsed ? 44 : layout.model.timelineWidth}px`,
            "--inspector-width": `${layout.model.inspectorCollapsed ? 44 : layout.model.inspectorWidth}px`,
          } as React.CSSProperties}
        >
          <div className={`timeline-shell ${layout.model.timelineCollapsed ? "collapsed" : ""}`}>
            <WorkspaceNavbar
              collapsed={layout.model.timelineCollapsed}
              workflowName={workflowState.workflow.name}
              status={recorder.model.status}
              transportStatus={recorder.model.transportStatus}
              stepCount={workflowState.workflow.steps.length}
              onNameChange={workflow.actions.rename}
              onExpand={layout.actions.expandTimeline}
              onStart={recorder.actions.start}
              onStop={recorder.actions.stop}
              onExport={workflow.actions.requestExport}
              onImport={(file) => void workflow.actions.import(file)}
              onReplay={() => replay.actions.request()}
              importDisabled={workflow.model.locked}
              replayDisabled={
                !workflowState.workflow.steps.some((step) => step.enabled)
                || workflow.model.locked
                || recorder.model.transportStatus === "offline"
              }
              locked={workflow.model.reviewLocked}
            />
            {!layout.model.timelineCollapsed ? (
              <>
                <WorkflowTimeline
                  steps={workflowState.workflow.steps}
                  selectedId={workflowState.selectedStepId}
                  onSelect={workflow.actions.selectStep}
                  onToggle={workflow.actions.toggleStep}
                  onDelete={workflow.actions.deleteStep}
                  onReorder={workflow.actions.reorderSteps}
                  onInsert={dialogs.actions.openManual}
                  onCollapse={layout.actions.collapseTimeline}
                  replayResults={replay.model.results}
                  locked={workflow.model.locked}
                  reviewLocked={workflow.model.reviewLocked}
                />
                <div
                  className="panel-resizer timeline-resizer"
                  role="separator"
                  tabIndex={workflow.model.reviewLocked ? -1 : 0}
                  aria-disabled={workflow.model.reviewLocked || undefined}
                  aria-label="Resize workflow timeline"
                  aria-orientation="vertical"
                  aria-valuemin={layout.model.panelLimits.timeline.min}
                  aria-valuemax={layout.model.panelLimits.timeline.max}
                  aria-valuenow={layout.model.timelineWidth}
                  onPointerDown={
                    workflow.model.reviewLocked
                      ? undefined
                      : (event) => layout.actions.beginPanelResize("timeline", event)
                  }
                  onKeyDown={
                    workflow.model.reviewLocked
                      ? undefined
                      : (event) => layout.actions.resizePanelWithKeyboard("timeline", event)
                  }
                />
              </>
            ) : null}
          </div>
          <div id="browser-workspace" className="main-stage" tabIndex={-1}>
            <BrowserPanel
              model={browser.model}
              actions={browser.actions}
              emptyState={browser.emptyState}
              alert={browser.alert}
              toolbar={replay.model.locked ? (
                <ReplayControls
                  status={replay.model.status}
                  currentIndex={replay.model.currentIndex}
                  totalSteps={replay.model.totalSteps}
                  failed={replay.model.currentResult?.status === "failed"}
                  phase={replay.model.currentResult?.phase}
                  onPause={replay.actions.pause}
                  onResume={replay.actions.resume}
                  onRetry={replay.actions.retry}
                  onSkip={replay.actions.skip}
                  onTakeControl={replay.actions.takeControl}
                  onStop={replay.actions.stop}
                />
              ) : (
                <RecorderControls
                  status={recorder.model.status}
                  transportStatus={recorder.model.transportStatus}
                  startedAt={recorder.model.startedAt}
                  onStart={recorder.actions.start}
                  onStop={recorder.actions.stop}
                  announce
                />
              )}
              emptyActions={(
                <>
                  {browser.emptyState.replayReadyCount ? (
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => replay.actions.request()}
                      disabled={browser.emptyState.replayDisabled}
                    >
                      Replay workflow <Play size={17} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    className={`button ${
                      browser.emptyState.replayReadyCount ? "button-secondary" : "button-primary"
                    }`}
                    type="button"
                    onClick={recorder.actions.start}
                    disabled={browser.emptyState.startDisabled}
                  >
                    Start recording <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </>
              )}
              contentOverlay={
                replay.model.currentResult?.status === "failed" && replay.model.currentResult.diagnostic ? (
                  <ReplayFailurePanel
                    message={replay.model.currentResult.diagnostic.message}
                    onRetry={replay.actions.retry}
                    onSkip={replay.actions.skip}
                    onTakeControl={replay.actions.takeControl}
                    onStop={replay.actions.stop}
                  />
                ) : null
              }
            />
          </div>
          <aside
            className={`inspector-shell ${layout.model.inspectorCollapsed ? "collapsed" : ""}`}
            aria-label="Selected step editor"
          >
            {layout.model.inspectorCollapsed ? (
              <div className="panel-rail panel-rail-right">
                <button
                  id="inspector-expand"
                  className="rail-button"
                  type="button"
                  disabled={workflow.model.reviewLocked}
                  onClick={layout.actions.expandInspector}
                  aria-label="Expand step details"
                  title="Expand details"
                >
                  <ChevronLeft size={19} aria-hidden="true" />
                  <span>Details</span>
                </button>
              </div>
            ) : (
              <>
                <div
                  className="panel-resizer inspector-resizer"
                  role="separator"
                  tabIndex={workflow.model.reviewLocked ? -1 : 0}
                  aria-disabled={workflow.model.reviewLocked || undefined}
                  aria-label="Resize step details"
                  aria-orientation="vertical"
                  aria-valuemin={layout.model.panelLimits.inspector.min}
                  aria-valuemax={layout.model.panelLimits.inspector.max}
                  aria-valuenow={layout.model.inspectorWidth}
                  onPointerDown={
                    workflow.model.reviewLocked
                      ? undefined
                      : (event) => layout.actions.beginPanelResize("inspector", event)
                  }
                  onKeyDown={
                    workflow.model.reviewLocked
                      ? undefined
                      : (event) => layout.actions.resizePanelWithKeyboard("inspector", event)
                  }
                />
                <StepEditor
                  step={workflow.model.selectedStep}
                  onUpdate={workflow.actions.updateStep}
                  onCollapse={layout.actions.collapseInspector}
                  locked={workflow.model.locked}
                  reviewLocked={workflow.model.reviewLocked}
                  replayResult={
                    workflow.model.selectedStep
                      ? replay.model.results[workflow.model.selectedStep.id]
                      : undefined
                  }
                  onRunFromHere={() => {
                    if (workflow.model.selectedStep) replay.actions.request(workflow.model.selectedStep.id);
                  }}
                />
              </>
            )}
          </aside>
        </main>
        {workflowState.deletedStep ? (
          <div className="undo-toast">
            <span role="status" aria-live="polite">Step deleted</span>
            <div className="undo-toast-actions">
              <button className="undo-toast-action" type="button" onClick={workflow.actions.undoDelete}>
                <RotateCcw size={16} aria-hidden="true" /> Undo
              </button>
              <button
                className="undo-toast-close"
                type="button"
                onClick={workflow.actions.dismissDelete}
                aria-label="Dismiss undo notification"
                title="Dismiss"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
        <div className="sr-only" aria-live="polite">{layout.model.announcement}</div>
      </div>
      <ManualStepDialog
        open={dialogs.model.manualOpen}
        order={workflowState.workflow.steps.length}
        page={workflow.model.activePage}
        onClose={dialogs.actions.closeManual}
        onInsert={workflow.actions.insertStep}
      />
      <RunWorkflowDialog
        open={dialogs.model.runDialogOpen}
        sensitive={dialogs.model.workflowContainsSensitiveValues}
        startStepName={dialogs.model.pendingReplayStep?.name}
        onClose={dialogs.actions.closeRun}
        onRun={replay.actions.start}
      />
      <Modal
        open={dialogs.model.confirmation === "new"}
        title="Start a new recording?"
        description="The current workflow only lives in this tab."
        onClose={dialogs.actions.closeConfirmation}
      >
        <p className="modal-copy">
          Export the current workflow first if you want to keep it. Starting over clears all recorded and edited steps.
        </p>
        <div className="modal-actions">
          <button className="button button-ghost" type="button" onClick={dialogs.actions.closeConfirmation}>
            Keep editing
          </button>
          <button className="button button-danger" type="button" onClick={dialogs.actions.confirmNew}>
            Discard and start
          </button>
        </div>
      </Modal>
      <Modal
        open={dialogs.model.confirmation === "sensitiveExport"}
        title="This export contains sensitive values"
        description="Passwords, tokens, or payment-related fields were detected."
        onClose={dialogs.actions.closeConfirmation}
      >
        <p className="modal-copy">
          The downloaded JSON contains recorded values in plain text. Store it like a secret and do not commit it to
          source control.
        </p>
        <div className="modal-actions">
          <button className="button button-ghost" type="button" onClick={dialogs.actions.closeConfirmation}>Cancel</button>
          <button className="button button-danger" type="button" onClick={dialogs.actions.confirmSensitiveExport}>
            Export sensitive JSON
          </button>
        </div>
      </Modal>
      <Modal
        open={dialogs.model.confirmation === "replaceImport"}
        title="Replace the current workflow?"
        description="The imported workflow will replace every step currently in the timeline."
        onClose={dialogs.actions.cancelImport}
      >
        <p className="modal-copy">
          Export the current workflow first if you want to keep it. Importing does not merge workflows.
        </p>
        <div className="modal-actions">
          <button className="button button-ghost" type="button" onClick={dialogs.actions.cancelImport}>Cancel</button>
          <button className="button button-danger" type="button" onClick={dialogs.actions.confirmPendingImport}>
            Replace workflow
          </button>
        </div>
      </Modal>
      <Modal
        open={Boolean(dialogs.model.importError)}
        title="Workflow could not be imported"
        description={dialogs.model.importError ?? "The selected file is invalid."}
        onClose={dialogs.actions.closeImportError}
      >
        <div className="modal-actions">
          <button className="button button-primary" type="button" onClick={dialogs.actions.closeImportError}>
            Choose another file
          </button>
        </div>
      </Modal>
    </>
  );
}
