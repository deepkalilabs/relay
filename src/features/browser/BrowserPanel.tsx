"use client";

import { useId, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Cloud,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { RecorderControls } from "@/features/recorder/RecorderControls";
import type {
  BrowserPageState,
  PopupState,
  RecordingStatus,
  TransportStatus,
} from "@/lib/recorder-session";

interface BrowserPanelProps {
  status: RecordingStatus;
  transportStatus: TransportStatus;
  elapsed: string;
  liveViewUrl: string | null;
  error: string | null;
  navigationError: string | null;
  navigationPending: boolean;
  page: BrowserPageState | null;
  popup: PopupState | null;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (url: string) => void;
  onReload: () => void;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onSwitchPopup: (pageId: string) => void;
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

export function BrowserPanel({ status, transportStatus, elapsed, liveViewUrl, error, navigationError, navigationPending, page, popup, onBack, onForward, onNavigate, onReload, onStart, onStop, onRetry, onSwitchPopup }: BrowserPanelProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loading = status === "starting" || (liveViewUrl && loadedUrl !== liveViewUrl);
  const navigationDisabled = !liveViewUrl || navigationPending || !["recording", "reconnecting"].includes(status);
  const tabTitle = page?.title && page.title !== "about:blank" ? page.title : liveViewUrl ? "Browserbase" : "New cloud browser";
  const pageAddress = page?.url === "about:blank" ? "" : page?.url ?? "";

  return (
    <section className="browser-panel" aria-labelledby="browser-title">
      <div className="browser-chrome">
        <div className="browser-tab-strip" aria-hidden="true">
          <div className="traffic-lights"><span /><span /><span /></div>
          <div className="browser-tab">
            <Globe2 size={15} />
            <span>{tabTitle}</span>
          </div>
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
          <RecorderControls status={status} transportStatus={transportStatus} elapsed={elapsed} onStart={onStart} onStop={onStop} announce />
        </div>
        {navigationError ? <div className="browser-address-error" role="alert">{navigationError}</div> : null}
      </div>
      <h2 id="browser-title" className="sr-only">Interactive cloud browser</h2>
      <div className="browser-content">
        {liveViewUrl ? (
          <iframe
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
            <h2>Start with a fresh cloud browser</h2>
            <p>Your interactions become structured, editable workflow steps in real time.</p>
            <button className="button button-primary" type="button" onClick={onStart} disabled={status === "configurationMissing" || transportStatus === "offline"}>
              Start recording <ArrowRight size={17} aria-hidden="true" />
            </button>
            <div className="privacy-note"><LockKeyhole size={14} /><span>Values are held in memory until you export.</span></div>
          </div>
        )}
        {loading ? <div className="browser-overlay" aria-live="polite"><LoaderCircle className="spin" size={24} /><strong>Preparing secure browser</strong><span>Connecting the recorder and Live View…</span></div> : null}
        {status === "reconnecting" ? <div className="connection-banner"><RefreshCw className="spin" size={15} /> Reconnecting recorder transport…</div> : null}
        {error ? <div className="error-card" role="alert"><AlertTriangle size={20} /><div><strong>Browser session needs attention</strong><p>{error}</p><button className="text-button" type="button" onClick={onRetry}>Try a new recording</button></div></div> : null}
        {popup ? <div className="popup-card" role="status"><div><strong>New tab opened</strong><span>{popup.title || popup.url}</span></div><button className="button button-secondary" type="button" onClick={() => onSwitchPopup(popup.pageId)}>Switch tab <ArrowRight size={16} /></button></div> : null}
      </div>
    </section>
  );
}
