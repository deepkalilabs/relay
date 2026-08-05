import { Folder, Radio, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import styles from "./AppSidebar.module.css";

export type AppDestination = "library" | "automations" | "profiles";

interface AppSidebarProps {
  activeDestination: AppDestination;
}

const destinations = [
  { id: "library" as const, href: "/library", label: "Library", Icon: Folder },
  { id: "automations" as const, href: "/automations", label: "Automations", Icon: Zap },
  { id: "profiles" as const, href: "/profile", label: "Profiles", Icon: UserRound },
];

export function AppSidebar({ activeDestination }: AppSidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Primary navigation">
      <Link
        className={styles.brand}
        href="/library"
        aria-label="Memory Recorder home"
        title="Memory Recorder home"
      >
        <span className={styles.brandMark}>
          <Radio size={17} aria-hidden="true" />
        </span>
        <span>Memory Recorder</span>
      </Link>
      <nav className={styles.navigation}>
        {destinations.map(({ id, href, label, Icon }) => {
          const active = activeDestination === id;
          return (
            <Link
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              key={id}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <span className={styles.spacer} />
      <span className={styles.avatar}>
        <span className="sr-only">Signed in as </span>
        N
      </span>
    </aside>
  );
}
