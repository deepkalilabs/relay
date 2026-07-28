"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrowserActions, BrowserPanelAlert, BrowserViewModel } from "@/features/browser";
import { useRecorderSession } from "@/features/recorder";
import { downloadWorkflow } from "@/lib/workflow/export";
import { WorkflowRequestError, workflowEditorClient } from "@/lib/workflow/client";
import type { WorkflowStep } from "@/lib/workflow/domain";
import { WorkflowSchema } from "@/lib/workflow/schema";
import { initialWorkflowState, workflowReducer } from "@/lib/workflow/store";
import type { ReplayStepResultState } from "@/lib/recorder-session";
import { useWorkspacePanels } from "./useWorkspacePanels";

type Confirmation = "sensitiveExport" | null;
type PersistenceStatus = "loading" | "ready" | "saving" | "error" | "conflict";

export function useWorkspaceController(workflowId: string) {
  const router = useRouter();
  const [workflowState, dispatch] = useReducer(workflowReducer, undefined, initialWorkflowState);
  const workflowStateRef = useRef(workflowState);
  const [manualOpen, setManualOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingReplayStartId, setPendingReplayStartId] = useState<string | undefined>();
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [workflowLoaded, setWorkflowLoaded] = useState(false);

  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

  const onSessionStarted = useCallback((sessionId: string) => {
    dispatch({ type: "setSessionId", sessionId });
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
  const persistenceLocked = persistenceStatus === "loading" || persistenceStatus === "saving";
  const workflowLocked = replayLocked || captchaLocked || persistenceLocked;
  const panels = useWorkspacePanels({
    selectedStepId: workflowState.selectedStepId,
    overlayOpen: Boolean(confirmation || manualOpen || runDialogOpen),
  });

  const loadSavedWorkflow = useCallback(async () => {
    setWorkflowLoaded(false);
    setPersistenceStatus("loading");
    setPersistenceError(null);
    try {
      const workflow = await workflowEditorClient.get(workflowId);
      dispatch({ type: "load", workflow });
      setWorkflowLoaded(true);
      setPersistenceStatus("ready");
      setAnnouncement(`${workflow.name} loaded.`);
    } catch (error) {
      setPersistenceStatus("error");
      setPersistenceError(error instanceof Error ? error.message : "The workflow could not be loaded.");
    }
  }, [workflowId]);

  useEffect(() => {
    let active = true;
    workflowEditorClient.get(workflowId).then(
      (workflow) => {
        if (!active) return;
        dispatch({ type: "load", workflow });
        setWorkflowLoaded(true);
        setPersistenceStatus("ready");
        setPersistenceError(null);
        setAnnouncement(`${workflow.name} loaded.`);
      },
      (error: unknown) => {
        if (!active) return;
        setPersistenceStatus("error");
        setPersistenceError(error instanceof Error ? error.message : "The workflow could not be loaded.");
      },
    );
    return () => {
      active = false;
    };
  }, [workflowId]);

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
      setPendingReplayStartId(undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [captchaLocked]);

  const beginRecording = () => session.startRecording();

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

  const exportNow = () => {
    const parsed = WorkflowSchema.safeParse(workflowState.workflow);
    if (!parsed.success) {
      session.reportError(`Workflow export is blocked: ${parsed.error.issues[0]?.message}`);
      return;
    }
    downloadWorkflow(parsed.data);
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

  const saveWorkflow = async () => {
    const baseWorkflow = workflowState.workflow;
    const parsed = WorkflowSchema.safeParse(baseWorkflow);
    if (!parsed.success) {
      setPersistenceStatus("error");
      setPersistenceError(`Workflow save is blocked: ${parsed.error.issues[0]?.message}`);
      return;
    }
    setPersistenceStatus("saving");
    setPersistenceError(null);
    try {
      const saved = await workflowEditorClient.save(workflowId, parsed.data, parsed.data.revision);
      dispatch({ type: "saved", workflow: saved, baseWorkflow });
      setPersistenceStatus("ready");
      setAnnouncement("Workflow saved.");
    } catch (error) {
      const conflict = error instanceof WorkflowRequestError && error.status === 409;
      setPersistenceStatus(conflict ? "conflict" : "error");
      setPersistenceError(error instanceof Error ? error.message : "The workflow could not be saved.");
    }
  };

  const finishWorkflow = async () => {
    if (!workflowState.workflow.steps.length) {
      setPersistenceStatus("error");
      setPersistenceError("Add at least one step before finishing this workflow.");
      return;
    }
    setPersistenceStatus("saving");
    setPersistenceError(null);
    try {
      await session.stopRecordingAndWait();
      const baseWorkflow = workflowStateRef.current.workflow;
      const parsed = WorkflowSchema.safeParse(baseWorkflow);
      if (!parsed.success) {
        setPersistenceStatus("error");
        setPersistenceError(`Workflow finish is blocked: ${parsed.error.issues[0]?.message}`);
        return;
      }
      const saved = await workflowEditorClient.finish(workflowId, parsed.data, parsed.data.revision);
      dispatch({ type: "saved", workflow: saved, baseWorkflow });
      setAnnouncement("Recording finished.");
      router.push(`/library?selected=${encodeURIComponent(saved.id)}`);
    } catch (error) {
      const conflict = error instanceof WorkflowRequestError && error.status === 409;
      setPersistenceStatus(conflict ? "conflict" : "error");
      setPersistenceError(error instanceof Error ? error.message : "The workflow could not be finished.");
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
        insertStep: (step: WorkflowStep) => dispatch({
          type: "insert",
          step,
          afterId: workflowState.selectedStepId ?? undefined,
        }),
        rename: (name: string) => dispatch({ type: "renameWorkflow", name }),
        reorderSteps: (activeId: string, overId: string) => dispatch({ type: "reorder", activeId, overId }),
        requestExport,
        reload: loadSavedWorkflow,
        save: saveWorkflow,
        finish: finishWorkflow,
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
        loaded: workflowLoaded,
        persistenceError,
        persistenceStatus,
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
        closeConfirmation: () => setConfirmation(null),
        closeManual: () => setManualOpen(false),
        closeRun: closeRunDialog,
        confirmSensitiveExport: exportNow,
        openManual: () => setManualOpen(true),
      },
      model: {
        confirmation,
        manualOpen,
        pendingReplayStep,
        runDialogOpen,
        workflowContainsSensitiveValues,
      },
    },
  };
}
