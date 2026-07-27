import { Folder, Radio } from "lucide-react";
import Link from "next/link";
import styles from "../LibraryScreen.module.css";

export function LibrarySidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Primary navigation">
      <Link className={styles.brand} href="/library" aria-label="Memory Recorder home">
        <span className={styles.brandMark}>
          <Radio size={17} aria-hidden="true" />
        </span>
        <span>Memory Recorder</span>
      </Link>
      <nav className={styles.navigation}>
        <Link className={`${styles.navItem} ${styles.navItemActive}`} href="/library" aria-current="page">
          <Folder size={17} aria-hidden="true" />
          <span>Library</span>
        </Link>
      </nav>
      <span className={styles.sidebarSpacer} />
      <span className={styles.avatar} aria-label="Signed in as N">
        N
      </span>
    </aside>
  );
}
