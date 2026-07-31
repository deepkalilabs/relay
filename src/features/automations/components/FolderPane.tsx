import { ChevronDown, ChevronRight, Folder, Plus } from "lucide-react";
import styles from "../AutomationsScreen.module.css";

function Count({ value }: { value: number }) {
  return <span className={styles.folderCount}>{value}</span>;
}

export function FolderPane() {
  return (
    <section className={styles.folders} aria-label="Automation folders">
      <header className={styles.paneHeader}>
        <h2>Folders</h2>
        <button className={styles.textAction} type="button" disabled>
          <Plus size={15} aria-hidden="true" />
          New folder
        </button>
      </header>
      <div className={styles.folderTree}>
        <div className={styles.folderRow}>
          <ChevronRight size={15} aria-hidden="true" />
          <Folder size={17} aria-hidden="true" />
          <span>Inbox</span>
          <Count value={12} />
        </div>
        <div className={styles.folderRow}>
          <ChevronDown size={15} aria-hidden="true" />
          <Folder size={17} aria-hidden="true" />
          <span>Customers</span>
        </div>
        <div className={`${styles.folderRow} ${styles.folderRowNested} ${styles.folderRowSelected}`}>
          <span className={styles.treeIndent} />
          <Folder size={17} aria-hidden="true" />
          <span aria-current="true">Verification</span>
          <Count value={8} />
        </div>
        <div className={`${styles.folderRow} ${styles.folderRowNested}`}>
          <span className={styles.treeIndent} />
          <Folder size={17} aria-hidden="true" />
          <span>Leads</span>
          <Count value={4} />
        </div>
        <div className={styles.folderRow}>
          <ChevronRight size={15} aria-hidden="true" />
          <Folder size={17} aria-hidden="true" />
          <span>Research</span>
          <Count value={6} />
        </div>
      </div>
    </section>
  );
}
