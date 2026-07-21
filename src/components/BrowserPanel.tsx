"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Cloud, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import type { RecordingStatus } from "@/components/Toolbar";

interface PopupState { pageId: string; title: string; url: string }

interface BrowserPanelProps {
  status: RecordingStatus;
  liveViewUrl: string | null;
  error: string | null;
  popup: PopupState | null;
  onStart: () => void;
  onRetry: () => void;
  onSwitchPopup: (pageId: string) => void;
}

export function BrowserPanel({ status, liveViewUrl, error, popup, onStart, onRetry, onSwitchPopup }: BrowserPanelProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loading = status === "starting" || (liveViewUrl && loadedUrl !== liveViewUrl);

  return (
    <section className="browser-panel" aria-labelledby="browser-title">
      <div className="browser-frame-header">
        <div className="traffic-lights" aria-hidden="true"><span /><span /><span /></div>
        <div className="address-shell"><LockKeyhole size={13} aria-hidden="true" /><span>{liveViewUrl ? "Secure Browserbase session" : "New cloud browser"}</span></div>
        <span className="browser-live"><span className={status === "recording" ? "live-pulse" : ""} />{status === "recording" ? "Live" : "Offline"}</span>
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
            <button className="button button-primary" type="button" onClick={onStart} disabled={status === "configurationMissing"}>
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
