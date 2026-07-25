"use client";

import { AlertTriangle, Plus, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LibrarySidebar } from "./components/LibrarySidebar";
import { RecordingDetails } from "./components/RecordingDetails";
import { RecordingList } from "./components/RecordingList";
import type { LibraryRecording } from "./model/mockRecordings";
import styles from "./LibraryScreen.module.css";

export interface LibraryScreenProps {
  recordings: readonly LibraryRecording[];
}

export function LibraryScreen({ recordings }: LibraryScreenProps) {
  const [query, setQuery] = useState("");
  const [selectedRecordingId, setSelectedRecordingId] = useState(recordings[0]?.id ?? "");
  const visibleRecordings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return recordings;
    return recordings.filter((recording) => recording.title.toLocaleLowerCase().includes(normalizedQuery));
  }, [query, recordings]);
  const selectedRecording =
    visibleRecordings.find((recording) => recording.id === selectedRecordingId) ?? visibleRecordings[0];

  return (
    <>
      <div className={styles.viewportGuard} role="main">
        <AlertTriangle size={28} aria-hidden="true" />
        <h1>A larger screen is required</h1>
        <p>Memory Recorder is a desktop workspace designed for viewports at least 1024px wide.</p>
      </div>
      <div className={styles.shell}>
        <LibrarySidebar />
        <main className={styles.content}>
          <header className={styles.pageHeader}>
            <div>
              <h1>Library</h1>
              <p>Browse and manage your saved recordings.</p>
            </div>
            <Link className={styles.newRecording} href="/">
              New recording
              <Plus size={17} aria-hidden="true" />
            </Link>
          </header>
          <label className={styles.search}>
            <span className="sr-only">Search recordings</span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Search recordings"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {selectedRecording ? (
            <div className={styles.workspace}>
              <RecordingList
                recordings={visibleRecordings}
                selectedRecordingId={selectedRecording.id}
                onSelect={setSelectedRecordingId}
              />
              <RecordingDetails recording={selectedRecording} />
            </div>
          ) : (
            <section className={styles.emptyState} role="status">
              <SearchX size={26} aria-hidden="true" />
              <h2>No recordings match</h2>
              <p>Try a different search term.</p>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
