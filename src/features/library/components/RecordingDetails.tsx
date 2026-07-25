import { ArrowRight, Play } from "lucide-react";
import type { LibraryRecording } from "../model/mockRecordings";
import styles from "../LibraryScreen.module.css";

interface RecordingDetailsProps {
  recording: LibraryRecording;
}

function MockBrowserPreview({ recording }: { recording: LibraryRecording }) {
  return (
    <div className={styles.preview} data-preview={recording.preview} aria-hidden="true">
      <div className={styles.previewChrome}>
        <span className={styles.windowDots}>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.addressBar} />
      </div>
      <div className={styles.previewToolbar}>
        <span className={styles.previewLogo}>mr</span>
        <span />
        <span />
      </div>
      <div className={styles.checkoutCanvas}>
        <div className={styles.checkoutMain}>
          <div className={styles.checkoutProgress}>
            <span className={styles.progressActive}>1</span>
            <small>Information</small>
            <span>2</span>
            <small>Shipping</small>
            <span>3</span>
            <small>Payment</small>
            <span>4</span>
            <small>Review</small>
          </div>
          <strong>Contact information</strong>
          <span className={styles.mockInput}>Email address</span>
          <span className={styles.mockInput}>Phone number</span>
          <strong>Shipping address</strong>
          <span className={styles.mockInput}>Full name</span>
        </div>
        <aside className={styles.orderSummary}>
          <strong>Order summary</strong>
          <div>
            <i />
            <span />
            <b />
          </div>
          <div>
            <i />
            <span />
            <b />
          </div>
          <div>
            <i />
            <span />
            <b />
          </div>
          <footer>
            <strong>Total</strong>
            <strong>$129.00</strong>
          </footer>
        </aside>
      </div>
    </div>
  );
}

export function RecordingDetails({ recording }: RecordingDetailsProps) {
  return (
    <section className={styles.details} aria-label="Recording details">
      <header className={styles.detailsHeader}>
        <div>
          <h2>{recording.title}</h2>
          <p>
            {recording.stepCount} steps · {recording.updatedLabel}
          </p>
        </div>
        <div className={styles.detailActions}>
          <button
            className={styles.secondaryAction}
            type="button"
            disabled
            aria-label={`Run ${recording.title}`}
            aria-describedby="library-actions-note"
          >
            <Play size={16} aria-hidden="true" />
            Run
          </button>
          <button
            className={styles.primaryAction}
            type="button"
            disabled
            aria-label={`Open ${recording.title}`}
            aria-describedby="library-actions-note"
          >
            Open recording
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      <MockBrowserPreview recording={recording} />
      <div className={styles.stepsSection}>
        <h3>Steps</h3>
        <ol className={styles.steps}>
          {recording.steps.map((step, index) => (
            <li key={step.id}>
              <span>{index + 1}</span>
              <p>{step.label}</p>
            </li>
          ))}
        </ol>
      </div>
      <p id="library-actions-note" className="sr-only">
        This action is unavailable in the mock Library.
      </p>
    </section>
  );
}
