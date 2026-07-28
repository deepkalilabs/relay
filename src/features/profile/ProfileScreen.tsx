import {
  AlertTriangle,
  ChevronDown,
  Play,
  Plus,
  UserRound,
} from "lucide-react";
import { AppSidebar } from "@/shared/ui/navigation";
import styles from "./ProfileScreen.module.css";

const profiles = [
  { name: "Personal", updated: "Updated 2d ago" },
  { name: "Work — US", updated: "Updated 1h ago", selected: true },
  { name: "QA Test", updated: "Updated 3d ago" },
];

interface StaticFieldProps {
  label: string;
  value: string;
  selectLike?: boolean;
  type?: "text" | "email";
}

function StaticField({ label, value, selectLike = false, type = "text" }: StaticFieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.inputWrap}>
        <input type={type} value={value} readOnly />
        {selectLike ? <ChevronDown size={16} aria-hidden="true" /> : null}
      </span>
    </label>
  );
}

function PrototypeButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <button className={className} type="button" aria-disabled="true">
      {children}
    </button>
  );
}

function ProfileList() {
  return (
    <section className={styles.profileList} aria-label="Saved profiles">
      <header className={styles.listHeader}>
        <h2>Profiles</h2>
        <PrototypeButton className={styles.secondaryAction}>
          New profile
          <Plus size={16} aria-hidden="true" />
        </PrototypeButton>
      </header>
      <ul className={styles.profileItems}>
        {profiles.map((profile) => (
          <li
            className={`${styles.profileItem} ${profile.selected ? styles.profileItemSelected : ""}`}
            aria-current={profile.selected ? "true" : undefined}
            key={profile.name}
          >
            <span className={styles.profileIcon} aria-hidden="true">
              <UserRound size={25} />
            </span>
            <span className={styles.profileCopy}>
              <strong>{profile.name}</strong>
              <span>{profile.updated}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProfileDetails() {
  return (
    <section className={styles.details} aria-label="Work — US profile details">
      <header className={styles.detailsHeader}>
        <div className={styles.detailsTitle}>
          <h2>Work — US</h2>
          <span className={styles.readyBadge}>Ready</span>
        </div>
        <div className={styles.detailActions}>
          <PrototypeButton className={styles.deleteAction}>Delete</PrototypeButton>
          <PrototypeButton className={styles.primaryAction}>Save profile</PrototypeButton>
        </div>
      </header>

      <div className={styles.formBody}>
        <section className={styles.formSection} aria-labelledby="identity-heading">
          <h3 id="identity-heading">Identity</h3>
          <StaticField label="Full name" value="Alex Johnson" />
          <StaticField label="Email address" value="alex.johnson@acmecorp.com" type="email" />
        </section>

        <section className={styles.formSection} aria-labelledby="location-heading">
          <h3 id="location-heading">Location</h3>
          <StaticField label="Country/region" value="United States" selectLike />
          <StaticField label="ZIP code" value="94103" />
        </section>

        <section className={styles.formSection} aria-labelledby="browser-heading">
          <h3 id="browser-heading">Browser</h3>
          <StaticField label="Browser" value="Google Chrome 125" selectLike />
          <StaticField label="Operating system" value="Windows 11" selectLike />
        </section>
      </div>

      <footer className={styles.detailsFooter}>
        <PrototypeButton className={styles.runAction}>
          <Play size={16} aria-hidden="true" />
          Run a workflow with this profile
        </PrototypeButton>
      </footer>
    </section>
  );
}

export function ProfileScreen() {
  return (
    <>
      <div className={styles.viewportGuard} role="main">
        <AlertTriangle size={28} aria-hidden="true" />
        <h1>A larger screen is required</h1>
        <p>Memory Recorder is a desktop workspace designed for viewports at least 1024px wide.</p>
      </div>
      <div className={styles.shell}>
        <AppSidebar activeDestination="profiles" />
        <main className={styles.content}>
          <header className={styles.pageHeader}>
            <h1>Profiles</h1>
            <p>Create reusable parameters for your workflow runs.</p>
          </header>
          <div className={styles.workspace}>
            <ProfileList />
            <ProfileDetails />
          </div>
        </main>
      </div>
    </>
  );
}
