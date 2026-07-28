"use client";

import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { LibraryWorkflowItem } from "@/shared/contracts/workflow/library";
import styles from "../LibraryScreen.module.css";

interface RecordingDetailsProps {
  workflow: LibraryWorkflowItem;
}

const representativeValues = [
  "Alex Morgan",
  "Morgan",
  "(415) 555-0137",
  "San Francisco",
  "CA",
] as const;

const representativeSources = [
  "full-name",
  "recorded",
  "phone-number",
  "city",
  "recorded",
] as const;

const profileFieldOptions = [
  { value: "recorded", label: "Recorded value" },
  { value: "full-name", label: "Full name" },
  { value: "email", label: "Email" },
  { value: "phone-number", label: "Phone number" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
] as const;

type StepParameterDraft = {
  defaultValue: string;
  source: string;
};

function createParameterDrafts(
  workflow: LibraryWorkflowItem,
): Record<string, StepParameterDraft> {
  return Object.fromEntries(
    workflow.steps.slice(0, representativeValues.length).map((step, index) => [
      step.id,
      {
        defaultValue: representativeValues[index],
        source: representativeSources[index],
      },
    ]),
  );
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
  return <RecordingDetailsView key={workflow.id} workflow={workflow} />;
}

function RecordingDetailsView({ workflow }: RecordingDetailsProps) {
  const draft = workflow.status === "draft";
  const [parameterDrafts, setParameterDrafts] = useState(() => (
    createParameterDrafts(workflow)
  ));

  const updateParameterDraft = (
    stepId: string,
    patch: Partial<StepParameterDraft>,
  ) => {
    setParameterDrafts((current) => ({
      ...current,
      [stepId]: { ...current[stepId], ...patch },
    }));
  };

  return (
    <section className={styles.details} aria-label="Workflow details">
      <header className={styles.detailsHeader}>
        <div>
          <span className={draft ? styles.statusBadge : "sr-only"}>{draft ? "Draft" : "Complete workflow"}</span>
          <h2>{workflow.name}</h2>
          <p>{workflow.steps.length} steps</p>
        </div>
        <div className={styles.detailActions}>
          <button
            className={styles.secondaryAction}
            type="button"
            aria-label="Run with profile (UI preview only)"
            title="UI preview only"
          >
            <Play size={16} aria-hidden="true" />
            Run with profile
          </button>
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
        <div className={styles.stepsHeading}>
          <h3>Steps</h3>
          <p>Set a default value or use a field from the selected profile.</p>
        </div>
        <div className={styles.steps} role="table" aria-label="Workflow step parameters">
          <div className={styles.stepsColumns} role="row">
            <span role="columnheader">Step</span>
            <span role="columnheader">Default value</span>
            <span role="columnheader">Use profile field</span>
          </div>
          {workflow.steps.map((step, index) => {
            const parameterDraft = parameterDrafts[step.id];
            return (
              <div className={styles.stepRow} role="row" key={step.id}>
                <div className={styles.stepIdentity} role="cell">
                  <span>{index + 1}</span>
                  <p>{step.name}</p>
                </div>
                {parameterDraft ? (
                  <>
                    <label className={styles.parameterField} role="cell">
                      <span className="sr-only">Default value for {step.name}</span>
                      <input
                        value={parameterDraft.defaultValue}
                        onChange={(event) => updateParameterDraft(step.id, {
                          defaultValue: event.target.value,
                        })}
                      />
                    </label>
                    <label className={styles.parameterField} role="cell">
                      <span className="sr-only">Profile field for {step.name}</span>
                      <select
                        value={parameterDraft.source}
                        onChange={(event) => updateParameterDraft(step.id, {
                          source: event.target.value,
                        })}
                      >
                        {profileFieldOptions.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <span className={styles.noValue} role="cell">No value</span>
                    <span className={styles.noValue} role="cell">No value</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
