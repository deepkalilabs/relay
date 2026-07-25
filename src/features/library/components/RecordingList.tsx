import type { LibraryRecording } from "../model/mockRecordings";
import styles from "../LibraryScreen.module.css";

interface RecordingListProps {
  recordings: readonly LibraryRecording[];
  selectedRecordingId: string;
  onSelect: (recordingId: string) => void;
}

function RecordingThumbnail({ recording }: { recording: LibraryRecording }) {
  return (
    <span className={styles.thumbnail} data-preview={recording.preview} aria-hidden="true">
      <span className={styles.thumbnailChrome}>
        <i />
        <i />
        <i />
      </span>
      <span className={styles.thumbnailCanvas}>
        <span className={styles.thumbnailRail} />
        <span className={styles.thumbnailContent}>
          <i />
          <i />
          <i />
          <span>
            <b />
            <b />
            <b />
          </span>
        </span>
      </span>
    </span>
  );
}

export function RecordingList({ recordings, selectedRecordingId, onSelect }: RecordingListProps) {
  return (
    <section className={styles.recordingList} aria-labelledby="recordings-heading">
      <h2 id="recordings-heading" className={styles.listHeading}>
        Recordings
      </h2>
      <ul className={styles.recordingItems}>
        {recordings.map((recording) => {
          const selected = recording.id === selectedRecordingId;
          return (
            <li className={styles.recordingItem} key={recording.id}>
              <button
                className={`${styles.recordingButton} ${selected ? styles.recordingButtonSelected : ""}`}
                type="button"
                aria-label={`Select ${recording.title} recording`}
                aria-pressed={selected}
                onClick={() => onSelect(recording.id)}
              >
                <RecordingThumbnail recording={recording} />
                <span className={styles.recordingCopy}>
                  <strong>{recording.title}</strong>
                  <span>
                    {recording.stepCount} steps · {recording.updatedLabel}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
