"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { BrowserActions, BrowserPanelAlert, BrowserViewModel } from "@/features/browser";
import { useRecorderSession } from "@/features/recorder";
import { downloadWorkflow } from "@/lib/workflow/export";
import { parseWorkflowJson } from "@/lib/workflow/import";
import type { Workflow, WorkflowStep } from "@/lib/workflow/domain";
import { WorkflowSchema } from "@/lib/workflow/schema";
import { initialWorkflowState, workflowReducer } from "@/lib/workflow/store";
import type { ReplayStepResultState } from "@/lib/recorder-session";
import { useWorkspacePanels } from "./useWorkspacePanels";

type Confirmation = "new" | "sensitiveExport" | "replaceImport" | null;

export function useWorkspaceController() {
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
  const onReplayStepChange = useCallback((stepId: string, status: ReplayStepResultState["status"]) => {
    if (status === "running" || status === "failed") dispatch({ type: "select", id: stepId });
    setAnnouncement(`Replay step ${status}.`);
  }, []);

  const session = useRecorderSession({
    onSessionStarted,
    onReplaySessionStarted,
    onStartUrl,
    onStepRecorded,
    onReplayStepChange,
  });
  const replayLocked = ["preparing", "running", "pausing", "paused", "manual", "stopping"].includes(
    session.replayStatus,
  );
  const captchaLocked = session.captchaStatus === "solving";
  const workflowLocked = replayLocked || captchaLocked;
  const panels = useWorkspacePanels({
    selectedStepId: workflowState.selectedStepId,
    overlayOpen: Boolean(confirmation || manualOpen || runDialogOpen),
  });

  useEffect(() => {
    if (!workflowState.deletedStep) return;
    const timeout = window.setTimeout(() => dispatch({ type: "dismissDelete" }), 5_000);
    return () => window.clearTimeout(timeout);
  }, [workflowState.deletedStep]);

  useEffect(() => {
    if (!captchaLocked) return;
    const timeout = window.setTimeout(() => {
      setManualOpen(false);
      setRunDialogOpen(false);
      setConfirmation(null);
      setPendingImport(null);
      setPendingReplayStartId(undefined);
      setImportError(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [captchaLocked]);

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
      } else {
        loadWorkflow(workflow);
      }
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
    if (workflowState.workflow.steps.some((step) => step.metadata.sensitive)) {
      setConfirmation("sensitiveExport");
    } else {
      exportNow();
    }
  };

  const selectedStep = useMemo(
    () => workflowState.workflow.steps.find((step) => step.id === workflowState.selectedStepId) ?? null,
    [workflowState.workflow.steps, workflowState.selectedStepId],
  );
  const pendingReplayStep = useMemo(
    () => workflowState.workflow.steps.find((step) => step.id === pendingReplayStartId),
    [pendingReplayStartId, workflowState.workflow.steps],
  );
  const workflowContainsSensitiveValues = useMemo(
    () => workflowState.workflow.steps.some((step) => step.metadata.sensitive),
    [workflowState.workflow.steps],
  );
  const activePage = selectedStep?.page ?? (session.browserPage
    ? { id: session.browserPage.pageId, url: session.browserPage.url, title: session.browserPage.title }
    : { id: "manual", url: session.liveViewUrl ? "about:blank" : "", title: "Manual step" });
  const replayReadyCount = workflowState.workflow.steps.length;
  const browserModel: BrowserViewModel = {
    page: session.browserPage,
    liveViewUrl: session.liveViewUrl,
    popup: session.popup,
    datePicker: session.datePicker,
    selectPicker: session.selectPicker,
    captchaStatus: session.captchaStatus,
    nativeSelects: session.nativeSelects,
    nativeSelectsEnabled: Boolean(
      !captchaLocked
      && session.liveViewUrl
      && session.transportStatus === "connected"
      && !["preparing", "running", "pausing", "paused", "stopping"].includes(session.replayStatus),
    ),
    preparing: session.displayStatus === "starting" || session.replayStatus === "preparing",
    reconnecting: session.displayStatus === "reconnecting",
    restoreFocusAfterCaptcha: ["recording", "reconnecting"].includes(session.displayStatus),
    navigation: {
      enabled: Boolean(
        !captchaLocked
        && session.liveViewUrl
        && !session.navigationPending
        && (
          ["recording", "reconnecting"].includes(session.displayStatus)
          || session.replayStatus === "manual"
        ),
      ),
      pending: session.navigationPending,
      error: session.navigationError,
    },
  };
  const browserActions: BrowserActions = {
    goBack: () => session.sendBrowserCommand({ type: "browser.back" }),
    goForward: () => session.sendBrowserCommand({ type: "browser.forward" }),
    navigate: (url) => session.sendBrowserCommand({ type: "browser.navigate", url }),
    reload: () => session.sendBrowserCommand({ type: "browser.reload" }),
    switchPopup: session.switchPopup,
    selectDate: session.selectDate,
    dismissDatePicker: session.dismissDatePicker,
    selectPickerOption: session.selectPickerOption,
    dismissSelectPicker: session.dismissSelectPicker,
    setNativeSelects: session.setNativeSelects,
    continueAfterCaptcha: session.continueAfterCaptcha,
  };
  const browserAlert: BrowserPanelAlert | null = session.displayError
    ? {
        title: session.errorContext === "replay"
          ? "Replay needs attention"
          : "Browser session needs attention",
        message: session.displayError,
        actionLabel: session.errorContext === "replay" ? "Review workflow" : "Try a new recording",
        onAction: session.errorContext === "replay" ? session.clearError : beginRecording,
      }
    : null;
  const replayCurrentResult = session.replayCurrentStepId
    ? session.replayResults[session.replayCurrentStepId]
    : undefined;

  return {
    browser: {
      actions: browserActions,
      alert: browserAlert,
      emptyState: {
        title: replayReadyCount ? "Workflow ready to replay" : "Start with a fresh cloud browser",
        description: replayReadyCount
          ? `${replayReadyCount} steps are loaded. Replay them, then keep recording in the same browser.`
          : "Your interactions become structured, editable workflow steps in real time.",
        replayReadyCount,
        replayDisabled: (
          session.displayStatus === "configurationMissing"
          || session.transportStatus === "offline"
          || !["idle", "stopped", "error"].includes(session.displayStatus)
        ),
        startDisabled: (
          session.displayStatus === "configurationMissing"
          || session.transportStatus === "offline"
        ),
      },
      model: browserModel,
    },
    recorder: {
      actions: {
        start: beginRecording,
        stop: session.stopRecording,
      },
      model: {
        startedAt: session.startedAt,
        status: session.displayStatus,
        transportStatus: session.transportStatus,
      },
    },
    replay: {
      actions: {
        pause: session.pauseReplay,
        request: requestReplay,
        resume: session.resumeReplay,
        retry: session.retryReplay,
        skip: session.skipReplay,
        start: startReplayNow,
        stop: session.stopReplay,
        takeControl: session.takeControlOfReplay,
      },
      model: {
        currentIndex: session.replayCurrentIndex,
        currentResult: replayCurrentResult,
        locked: replayLocked,
        results: session.replayResults,
        status: session.replayStatus,
        totalSteps: session.replayTotalSteps,
      },
    },
    workflow: {
      actions: {
        deleteStep: (id: string) => dispatch({ type: "delete", id }),
        dismissDelete: () => dispatch({ type: "dismissDelete" }),
        import: importWorkflow,
        insertStep: (step: WorkflowStep) => dispatch({
          type: "insert",
          step,
          afterId: workflowState.selectedStepId ?? undefined,
        }),
        rename: (name: string) => dispatch({ type: "renameWorkflow", name }),
        reorderSteps: (activeId: string, overId: string) => dispatch({ type: "reorder", activeId, overId }),
        requestExport,
        selectStep: (id: string) => {
          dispatch({ type: "select", id });
          panels.setInspectorCollapsed(false);
        },
        toggleStep: (step: WorkflowStep) => dispatch({ type: "update", step }),
        undoDelete: () => dispatch({ type: "undoDelete" }),
        updateStep: (step: WorkflowStep) => dispatch({ type: "update", step }),
      },
      model: {
        activePage,
        locked: workflowLocked,
        reviewLocked: captchaLocked,
        selectedStep,
        state: workflowState,
      },
    },
    layout: {
      actions: {
        beginPanelResize: panels.beginPanelResize,
        collapseInspector: panels.collapseInspector,
        collapseTimeline: panels.collapseTimeline,
        expandInspector: panels.expandInspector,
        expandTimeline: panels.expandTimeline,
        resizePanelWithKeyboard: panels.resizePanelWithKeyboard,
      },
      model: {
        announcement,
        inspectorCollapsed: panels.inspectorCollapsed,
        inspectorWidth: panels.inspectorWidth,
        panelLimits: panels.panelLimits,
        timelineCollapsed: panels.timelineCollapsed,
        timelineWidth: panels.timelineWidth,
      },
    },
    dialogs: {
      actions: {
        cancelImport: () => {
          setConfirmation(null);
          setPendingImport(null);
        },
        closeConfirmation: () => setConfirmation(null),
        closeImportError: () => setImportError(null),
        closeManual: () => setManualOpen(false),
        closeRun: closeRunDialog,
        confirmNew,
        confirmPendingImport: () => {
          if (pendingImport) loadWorkflow(pendingImport);
        },
        confirmSensitiveExport: exportNow,
        openManual: () => setManualOpen(true),
      },
      model: {
        confirmation,
        importError,
        manualOpen,
        pendingReplayStep,
        runDialogOpen,
        workflowContainsSensitiveValues,
      },
    },
  };
}
