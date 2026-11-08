/** One list of user-facing entries (for example "Added") of a release. */
export interface ReleaseNoteSection {
  title: string;
  entries: string[];
}

/** A release as the start screen shows it, read from `CHANGELOG.md` at build time. */
export interface ReleaseNote {
  version: string;
  /** ISO date (`2026-11-06`). */
  date: string;
  /** The GitHub release page; null when the changelog does not name the repository. */
  url: string | null;
  sections: ReleaseNoteSection[];
  /** Entries left out of `sections` to keep the list short. */
  more: number;
}
