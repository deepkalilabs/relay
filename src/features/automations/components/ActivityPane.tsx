import { CheckCircle2, CircleAlert } from "lucide-react";
import type { AutomationRun } from "../model/automationWorkspace";
import { AutomationThumbnail } from "./AutomationThumbnail";
import styles from "../AutomationsScreen.module.css";

interface RunCardProps {
  run: AutomationRun;
  onViewDetails: (runKey: string) => void;
}

function RunCard({ run, onViewDetails }: RunCardProps) {
  const progress = run.totalSteps ? Math.round((run.currentStep / run.totalSteps) * 100) : 0;
  const status = run.state === "running"
    ? run.totalSteps
      ? `Running · Step ${run.currentStep} of ${run.totalSteps}`
      : "Running"
    : run.state === "failed"
      ? run.failedStep
        ? `Failed at step ${run.failedStep}`
        : "Failed"
      : run.state === "completed"
        ? `Completed · ${run.totalSteps} steps`
        : "Queued";
  return (
    <article className={styles.runCard} aria-label={`${run.name}: ${status}`}>
      <AutomationThumbnail variant={run.thumbnail ?? "search"} />
      <div className={styles.runCopy}>
        <div className={styles.runTitle}>
          <h4>{run.name}</h4>
          <span>{run.updated}</span>
        </div>
        <p className={styles[`${run.state}Status`]}>
          {run.state === "failed"
            ? <CircleAlert size={13} fill="currentColor" aria-hidden="true" />
            : null}
          {run.state === "completed"
            ? <CheckCircle2 size={13} aria-hidden="true" />
            : null}
          {status}
        </p>
        {run.state === "running" ? (
          <progress
            className={styles.runProgress}
            aria-label={`${run.name} progress`}
            value={progress}
            max={100}
          />
        ) : null}
        {run.detail ? <p className={styles.failureDetail}>{run.detail}</p> : null}
        {run.state === "failed" ? (
          <button
            className={styles.viewDetails}
            type="button"
            aria-label={`View details for ${run.name}`}
            onClick={() => onViewDetails(run.id)}
          >
            View details
          </button>
        ) : null}
      </div>
    </article>
  );
}

interface RunSectionProps {
  id: string;
  title: string;
  runs: AutomationRun[];
  className?: string;
  onViewDetails: (runKey: string) => void;
}

function RunSection({ id, title, runs, className, onViewDetails }: RunSectionProps) {
  return (
    <section className={className} aria-labelledby={id} aria-label={title}>
      <h3 id={id}>{title}</h3>
      <div className={styles.runList}>
        {runs.length
          ? runs.map((run) => (
            <RunCard run={run} onViewDetails={onViewDetails} key={run.id} />
          ))
          : <p className={styles.runEmpty}>No {title.toLocaleLowerCase()}.</p>}
      </div>
    </section>
  );
}

interface ActivityPaneProps {
  runs: AutomationRun[];
  onViewDetails: (runKey: string) => void;
}

export function ActivityPane({ runs, onViewDetails }: ActivityPaneProps) {
  const activeRuns = runs.filter((run) => run.state === "running" || run.state === "queued");
  const failedRuns = runs.filter((run) => run.state === "failed");
  const completedRuns = runs.filter((run) => run.state === "completed");

  return (
    <section className={styles.activity} aria-label="Run activity">
      <header className={styles.activityHeader}>
        <h2>Run activity</h2>
      </header>
      <div className={styles.activityBody}>
        <RunSection
          id="active-runs-heading"
          title="Active runs"
          runs={activeRuns}
          onViewDetails={onViewDetails}
        />
        <RunSection
          id="failed-runs-heading"
          title="Failed runs"
          runs={failedRuns}
          className={styles.failedSection}
          onViewDetails={onViewDetails}
        />
        {completedRuns.length ? (
          <RunSection
            id="completed-runs-heading"
            title="Completed runs"
            runs={completedRuns}
            className={styles.completedSection}
            onViewDetails={onViewDetails}
          />
        ) : null}
      </div>
    </section>
  );
}
