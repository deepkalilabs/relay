import { CircleAlert } from "lucide-react";
import { automationRuns, type AutomationRun } from "../mockData";
import { AutomationThumbnail } from "./AutomationThumbnail";
import styles from "../AutomationsScreen.module.css";

function RunCard({ run }: { run: AutomationRun }) {
  return (
    <article className={styles.runCard}>
      <AutomationThumbnail variant={run.thumbnail} />
      <div className={styles.runCopy}>
        <div className={styles.runTitle}>
          <h4>{run.name}</h4>
          <span>{run.updated}</span>
        </div>
        <p className={styles[`${run.state}Status`]}>
          {run.state === "failed" ? <CircleAlert size={13} fill="currentColor" aria-hidden="true" /> : null}
          {run.status}
        </p>
        {run.progress ? (
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label={`${run.name} progress`}
            aria-valuenow={run.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span />
          </div>
        ) : null}
        {run.detail ? <p className={styles.failureDetail}>{run.detail}</p> : null}
        {run.state === "failed" ? (
          <button className={styles.viewDetails} type="button" disabled>View details</button>
        ) : null}
      </div>
    </article>
  );
}

export function ActivityPane() {
  const activeRuns = automationRuns.filter((run) => run.state !== "failed");
  const failedRuns = automationRuns.filter((run) => run.state === "failed");

  return (
    <section className={styles.activity} aria-label="Run activity">
      <header className={styles.activityHeader}>
        <h2>Run activity</h2>
      </header>
      <div className={styles.activityBody}>
        <section aria-labelledby="active-runs-heading">
          <h3 id="active-runs-heading">Active runs</h3>
          <div className={styles.runList}>
            {activeRuns.map((run) => <RunCard run={run} key={run.id} />)}
          </div>
        </section>
        <section className={styles.failedSection} aria-labelledby="failed-runs-heading">
          <h3 id="failed-runs-heading">Failed runs</h3>
          <div className={styles.runList}>
            {failedRuns.map((run) => <RunCard run={run} key={run.id} />)}
          </div>
        </section>
      </div>
    </section>
  );
}
