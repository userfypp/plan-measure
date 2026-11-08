import { useState } from "react";
import releases from "virtual:release-notes";
import { Badge, Button, Dialog } from "../components/ui";
import type { ReleaseNote } from "../types/releaseNotes";
import { useAppPreferences } from "../utils/appPreferences";
import { formatSavedDate } from "../utils/dateFormat";
import { readSeenRelease, writeSeenRelease } from "./whatsNewSeen";
import styles from "./WhatsNew.module.css";

interface WhatsNewListProps {
  releases: readonly ReleaseNote[];
  /** Whether the newest release is one the user has not been shown yet. */
  highlightLatest: boolean;
}

/** The releases as a reading list: the version and its date lead, the entries follow in plain text. */
export function WhatsNewList({ releases, highlightLatest }: WhatsNewListProps) {
  const { dateFormat } = useAppPreferences();
  return (
    <div className={styles.releases}>
      {releases.map((release, index) => (
        <article
          key={release.version}
          className={styles.release}
          aria-labelledby={`release-${release.version}`}
        >
          <header className={styles.releaseHeader}>
            <h3 id={`release-${release.version}`} className={styles.version}>
              {release.version}
            </h3>
            {highlightLatest && index === 0 && <Badge variant="info">New</Badge>}
            <span className={styles.date}>
              {formatSavedDate(new Date(`${release.date}T12:00:00`).getTime(), dateFormat)}
            </span>
            {release.url && (
              <a
                className={styles.link}
                href={release.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Release notes for ${release.version} on GitHub`}
              >
                Release notes
              </a>
            )}
          </header>
          {release.sections.map((section) => (
            <section key={section.title} className={styles.group}>
              <h4 className={styles.groupTitle}>{section.title}</h4>
              <ul className={styles.entries}>
                {section.entries.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
          ))}
          {release.more > 0 && (
            <p className={styles.more}>
              and {release.more} more {release.more === 1 ? "change" : "changes"}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

/**
 * The start screen's "What's new" button and the dialog it opens. Its chunk is loaded lazily and
 * holds the release data. The button carries a "New" badge until the user has opened the dialog for
 * the current version; opening it is what marks the version as seen.
 */
export default function WhatsNew() {
  const latest = releases[0]?.version ?? null;
  const [unseen, setUnseen] = useState(() => latest !== null && readSeenRelease() !== latest);
  const [open, setOpen] = useState(false);
  // Fixed while the dialog is open, so its badge does not vanish the moment it is read.
  const [highlightLatest, setHighlightLatest] = useState(false);
  if (latest === null) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="compact"
        className={styles.trigger}
        aria-haspopup="dialog"
        onClick={() => {
          setHighlightLatest(unseen);
          setOpen(true);
          writeSeenRelease(latest);
          setUnseen(false);
        }}
      >
        What&apos;s new
        {unseen && <Badge variant="info">New</Badge>}
      </Button>
      <Dialog
        open={open}
        title="What's new"
        onClose={() => setOpen(false)}
        trapFocus
        actions={
          <Button variant="ghost" size="compact" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <WhatsNewList releases={releases} highlightLatest={highlightLatest} />
      </Dialog>
    </>
  );
}
