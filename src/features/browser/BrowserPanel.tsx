"use client";

import { useId, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronsUpDown,
  Cloud,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { RecorderControls } from "@/features/recorder/RecorderControls";
import { ReplayControls } from "@/features/replay/ReplayControls";
import { DatePickerOverlay } from "@/features/browser/DatePickerOverlay";
import { SelectPickerOverlay } from "@/features/browser/SelectPickerOverlay";
import type {
  BrowserPageState,
  DatePickerState,
  PopupState,
  RecordingStatus,
  TransportStatus,
  ReplayStepResultState,
  SelectPickerState,
} from "@/lib/recorder-session";
import type { ReplayStatus } from "@/lib/protocol";

interface BrowserPanelProps {
  status: RecordingStatus;
  transportStatus: TransportStatus;
  startedAt: number | null;
  liveViewUrl: string | null;
  error: string | null;
  navigationError: string | null;
  navigationPending: boolean;
  page: BrowserPageState | null;
  popup: PopupState | null;
  datePicker?: DatePickerState | null;
  selectPicker?: SelectPickerState | null;
  nativeSelects?: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (url: string) => void;
  onReload: () => void;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onSwitchPopup: (pageId: string) => void;
  onDateSelect?: (requestId: string, value: string) => void;
  onDateDismiss?: (requestId: string) => void;
  onSelectPickerSelect?: (requestId: string, value: string) => void;
  onSelectPickerDismiss?: (requestId: string) => void;
  onNativeSelectsChange?: (enabled: boolean) => void;
  replayStatus?: ReplayStatus;
  replayCurrentIndex?: number;
  replayTotalSteps?: number;
  replayCurrentResult?: ReplayStepResultState;
  replayReadyCount?: number;
  onReplay?: () => void;
  onReplayPause?: () => void;
  onReplayResume?: () => void;
  onReplayRetry?: () => void;
  onReplaySkip?: () => void;
  onReplayTakeControl?: () => void;
  onReplayStop?: () => void;
  errorContext?: "recording" | "replay";
  onDismissError?: () => void;
}

function BrowserAddress({ disabled, error, initialAddress, pending, onNavigate }: {
  disabled: boolean;
  error: string | null;
  initialAddress: string;
  pending: boolean;
  onNavigate: (url: string) => void;
}) {
  const [address, setAddress] = useState(initialAddress);
  const inputId = useId();
  return (
    <form className={`browser-address ${error ? "has-error" : ""}`} aria-label="Browser address" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); if (!disabled && address.trim()) onNavigate(address); }}>
      <LockKeyhole size={14} aria-hidden="true" />
      <label className="sr-only" htmlFor={inputId}>Web address</label>
      <input
        id={inputId}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder={disabled && !initialAddress ? "Start a secure cloud session" : "Enter a web address"}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        disabled={disabled}
      />
    </form>
  );
}

export function BrowserPanel({ status, transportStatus, startedAt, liveViewUrl, error, errorContext = "recording", onDismissError, navigationError, navigationPending, page, popup, datePicker, selectPicker, nativeSelects = false, replayStatus = "idle", replayCurrentIndex = 0, replayTotalSteps = 0, replayCurrentResult, replayReadyCount = 0, onReplay, onReplayPause, onReplayResume, onReplayRetry, onReplaySkip, onReplayTakeControl, onReplayStop, onBack, onForward, onNavigate, onReload, onStart, onStop, onRetry, onSwitchPopup, onDateSelect, onDateDismiss, onSelectPickerSelect, onSelectPickerDismiss, onNativeSelectsChange }: BrowserPanelProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const liveViewRef = useRef<HTMLIFrameElement>(null);
  const restoreLiveViewFocus = () => requestAnimationFrame(() => liveViewRef.current?.focus());
  const loading = status === "starting" || replayStatus === "preparing" || (liveViewUrl && loadedUrl !== liveViewUrl);
  const replayMode = ["preparing", "running", "pausing", "paused", "manual", "stopping"].includes(replayStatus);
  const nativeSelectsDisabled = !liveViewUrl || transportStatus !== "connected" || ["preparing", "running", "pausing", "paused", "stopping"].includes(replayStatus);
  const navigationDisabled = !liveViewUrl || navigationPending || (!["recording", "reconnecting"].includes(status) && replayStatus !== "manual");
  const tabTitle = page?.title && page.title !== "about:blank" ? page.title : liveViewUrl ? "Browserbase" : "New cloud browser";
  const pageAddress = page?.url === "about:blank" ? "" : page?.url ?? "";

  return (
    <section className="browser-panel" aria-labelledby="browser-title">
      <div className="browser-chrome">
        <div className="browser-tab-strip">
          <div className="traffic-lights" aria-hidden="true"><span /><span /><span /></div>
          <div className="browser-tab" aria-hidden="true">
            <Globe2 size={15} />
            <span>{tabTitle}</span>
          </div>
          <button
            className="native-dropdown-toggle"
            type="button"
            role="switch"
            aria-checked={nativeSelects}
            disabled={nativeSelectsDisabled}
            onClick={() => onNativeSelectsChange?.(!nativeSelects)}
            title={nativeSelects
              ? "Website dropdowns are active"
              : "Use the website's own dropdowns instead of the recorder picker"}
          >
            <ChevronsUpDown size={14} aria-hidden="true" />
            <span className="native-dropdown-label">Use native <span className="native-dropdown-detail">dropdowns</span></span>
            <span className="native-dropdown-track" aria-hidden="true"><span /></span>
            <span className="native-dropdown-state" aria-hidden="true">{nativeSelects ? "On" : "Off"}</span>
          </button>
        </div>
        <div className="browser-navigation">
          <div className="browser-nav-controls">
            <button type="button" onClick={onBack} disabled={navigationDisabled} aria-label="Go back" title="Back"><ArrowLeft size={18} /></button>
            <button type="button" onClick={onForward} disabled={navigationDisabled} aria-label="Go forward" title="Forward"><ArrowRight size={18} /></button>
            <button type="button" onClick={onReload} disabled={navigationDisabled} aria-label="Reload page" title="Reload">
              {navigationPending ? <LoaderCircle className="spin" size={17} /> : <RotateCw size={17} />}
            </button>
          </div>
          <BrowserAddress
            key={`${page?.pageId ?? "none"}:${pageAddress}`}
            disabled={navigationDisabled}
            error={navigationError}
            initialAddress={pageAddress}
            pending={navigationPending}
            onNavigate={onNavigate}
          />
          {replayMode ? (
            <ReplayControls
              status={replayStatus}
              currentIndex={replayCurrentIndex}
              totalSteps={replayTotalSteps}
              failed={replayCurrentResult?.status === "failed"}
              phase={replayCurrentResult?.phase}
              onPause={() => onReplayPause?.()}
              onResume={() => onReplayResume?.()}
              onRetry={() => onReplayRetry?.()}
              onSkip={() => onReplaySkip?.()}
              onTakeControl={() => onReplayTakeControl?.()}
              onStop={() => onReplayStop?.()}
            />
          ) : <RecorderControls status={status} transportStatus={transportStatus} startedAt={startedAt} onStart={onStart} onStop={onStop} announce />}
        </div>
        {navigationError ? <div className="browser-address-error" role="alert">{navigationError}</div> : null}
      </div>
      <h2 id="browser-title" className="sr-only">Interactive cloud browser</h2>
      <div className="browser-content" ref={contentRef}>
        {liveViewUrl ? (
          <iframe
            ref={liveViewRef}
            className="live-view"
            src={liveViewUrl}
            title="Interactive Browserbase browser"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
            allow="clipboard-read; clipboard-write"
            onLoad={() => setLoadedUrl(liveViewUrl)}
          />
        ) : (
          <div className="browser-empty">
            <span className="cloud-orbit"><Cloud size={30} aria-hidden="true" /></span>
            <h2>{replayReadyCount ? "Workflow ready to replay" : "Start with a fresh cloud browser"}</h2>
            <p>{replayReadyCount ? `${replayReadyCount} steps are loaded. Replay them, then keep recording in the same browser.` : "Your interactions become structured, editable workflow steps in real time."}</p>
            {replayReadyCount ? <button className="button button-primary" type="button" onClick={onReplay} disabled={status === "configurationMissing" || transportStatus === "offline" || !["idle", "stopped", "error"].includes(status)}>Replay workflow <Play size={17} aria-hidden="true" /></button> : null}
            <button className={`button ${replayReadyCount ? "button-secondary" : "button-primary"}`} type="button" onClick={onStart} disabled={status === "configurationMissing" || transportStatus === "offline"}>
              Start recording <ArrowRight size={17} aria-hidden="true" />
            </button>
            <div className="privacy-note"><LockKeyhole size={14} /><span>Values are held in memory until you export.</span></div>
          </div>
        )}
        {loading ? <div className="browser-overlay" aria-live="polite"><LoaderCircle className="spin" size={24} /><strong>Preparing secure browser</strong><span>Connecting the recorder and Live View…</span></div> : null}
        {status === "reconnecting" ? <div className="connection-banner"><RefreshCw className="spin" size={15} /> Reconnecting recorder transport…</div> : null}
        {error ? <div className="error-card" role="alert"><AlertTriangle size={20} /><div><strong>{errorContext === "replay" ? "Replay needs attention" : "Browser session needs attention"}</strong><p>{error}</p><button className="text-button" type="button" onClick={errorContext === "replay" ? onDismissError : onRetry}>{errorContext === "replay" ? "Review workflow" : "Try a new recording"}</button></div></div> : null}
        {popup ? <div className="popup-card" role="status"><div><strong>New tab opened</strong><span>{popup.title || popup.url}</span></div><button className="button button-secondary" type="button" onClick={() => onSwitchPopup(popup.pageId)}>Switch tab <ArrowRight size={16} /></button></div> : null}
        {replayCurrentResult?.status === "failed" && replayCurrentResult.diagnostic ? (
          <div className="replay-failure-card" role="alert">
            <AlertTriangle size={20} aria-hidden="true" />
            <div><strong>Replay paused on this step</strong><p>{replayCurrentResult.diagnostic.message}</p></div>
            <div className="replay-failure-actions">
              <button type="button" onClick={onReplayRetry}>Retry</button>
              <button type="button" onClick={onReplaySkip}>Skip</button>
              <button type="button" onClick={onReplayTakeControl}>Take control</button>
              <button type="button" onClick={onReplayStop}>Stop</button>
            </div>
          </div>
        ) : null}
        {datePicker ? (
          <DatePickerOverlay
            key={datePicker.requestId}
            picker={datePicker}
            containerRef={contentRef}
            onSelect={(value) => onDateSelect?.(datePicker.requestId, value)}
            onDismiss={() => onDateDismiss?.(datePicker.requestId)}
          />
        ) : null}
        {selectPicker ? (
          <SelectPickerOverlay
            key={selectPicker.requestId}
            picker={selectPicker}
            containerRef={contentRef}
            onSelect={(value) => {
              onSelectPickerSelect?.(selectPicker.requestId, value);
              restoreLiveViewFocus();
            }}
            onDismiss={() => {
              onSelectPickerDismiss?.(selectPicker.requestId);
              restoreLiveViewFocus();
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
