import { AlertTriangle } from "lucide-react";
import { AppSidebar } from "@/shared/ui/navigation";
import { ActivityPane } from "./components/ActivityPane";
import { FolderPane } from "./components/FolderPane";
import { TaskPane } from "./components/TaskPane";
import styles from "./AutomationsScreen.module.css";

export function AutomationsScreen() {
  return (
    <>
      <div className={styles.viewportGuard} role="main">
        <AlertTriangle size={28} aria-hidden="true" />
        <h1>A larger screen is required</h1>
        <p>Memory Recorder is a desktop workspace designed for viewports at least 1024px wide.</p>
      </div>
      <div className={styles.shell}>
        <AppSidebar activeDestination="automations" />
        <main className={styles.content}>
          <header className={styles.pageHeader}>
            <h1>Automations</h1>
            <p>Organize and run workflows by folder.</p>
          </header>
          <div className={styles.workspace}>
            <FolderPane />
            <TaskPane />
            <ActivityPane />
          </div>
        </main>
      </div>
    </>
  );
}
