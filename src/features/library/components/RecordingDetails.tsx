import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { LibraryWorkflowItem } from "@/lib/workflow/library";
import styles from "../LibraryScreen.module.css";

interface RecordingDetailsProps {
  workflow: LibraryWorkflowItem;
}

function MockBrowserPreview() {
  return (
    <div className={styles.preview} data-testid="static-workflow-preview" aria-hidden="true">
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
          <div><i /><span /><b /></div>
          <div><i /><span /><b /></div>
          <div><i /><span /><b /></div>
          <footer><strong>Total</strong><strong>$129.00</strong></footer>
        </aside>
      </div>
    </div>
  );
}

export function RecordingDetails({ workflow }: RecordingDetailsProps) {
  const draft = workflow.status === "draft";
  return (
    <section className={styles.details} aria-label="Workflow details">
      <header className={styles.detailsHeader}>
        <div>
          <span className={draft ? styles.statusBadge : "sr-only"}>{draft ? "Draft" : "Complete workflow"}</span>
          <h2>{workflow.name}</h2>
          <p>{workflow.steps.length} steps</p>
        </div>
        <div className={styles.detailActions}>
          <Link
            className={styles.primaryAction}
            href={`/workflows/${workflow.id}/edit`}
            aria-label={`${draft ? "Continue editing" : "Edit workflow"} ${workflow.name}`}
          >
            {draft ? "Continue editing" : "Edit workflow"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <MockBrowserPreview />
      <div className={styles.stepsSection}>
        <h3>Steps</h3>
        <ol className={styles.steps}>
          {workflow.steps.map((step, index) => (
            <li key={step.id}>
              <span>{index + 1}</span>
              <p>{step.name}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

