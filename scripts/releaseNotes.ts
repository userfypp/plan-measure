import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import type { ReleaseNote, ReleaseNoteSection } from "../src/types/releaseNotes";

/** The changelog sections that describe what a user sees; the rest is maintenance. */
export const SHOWN_SECTIONS = ["Added", "Fixed", "Improved"] as const;
export const MAX_RELEASES = 3;
/** Entries shown per release, taken in section order, so the card stays short. */
export const MAX_ENTRIES_PER_RELEASE = 4;

const HEADING = /^## \[?(\d+\.\d+\.\d+[^\]\s)]*)\]?(?:\(([^)]*)\))? \((\d{4}-\d{2}-\d{2})\)\s*$/;
const REPOSITORY = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/compare\//;

function entryText(line: string): string {
  let text = line.replace(/^\*\s+/, "");
  // Release Please ends each entry with links to its issues and commits.
  for (;;) {
    const stripped = text
      .replace(/,\s*(?:closes|fixes)\s+\[#\d+\]\([^)]*\)\s*$/i, "")
      .replace(/\s*\(\[[^\]]+\]\([^)]*\)\)\s*$/, "");
    if (stripped === text) break;
    text = stripped;
  }
  text = text
    .replace(/^\*\*[^*]+:\*\*\s*/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Reads the newest releases that have user-facing entries from a Release Please changelog. */
export function parseReleaseNotes(changelog: string, limit = MAX_RELEASES): ReleaseNote[] {
  const releases: ReleaseNote[] = [];
  let repository: string | null = null;
  let current: { version: string; date: string; sections: Map<string, string[]> } | null = null;
  let sectionTitle: string | null = null;

  const finish = () => {
    if (!current) return;
    const sections: ReleaseNoteSection[] = [];
    let room = MAX_ENTRIES_PER_RELEASE;
    let more = 0;
    for (const title of SHOWN_SECTIONS) {
      const entries = current.sections.get(title) ?? [];
      const shown = entries.slice(0, room);
      room -= shown.length;
      more += entries.length - shown.length;
      if (shown.length > 0) sections.push({ title, entries: shown });
    }
    if (sections.length > 0) {
      releases.push({
        version: current.version,
        date: current.date,
        url: repository ? `${repository}/releases/tag/v${current.version}` : null,
        sections,
        more,
      });
    }
    current = null;
  };

  for (const line of changelog.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      finish();
      repository ??= REPOSITORY.exec(heading[2] ?? "")?.[1] ?? null;
      current = { version: heading[1]!, date: heading[3]!, sections: new Map() };
      sectionTitle = null;
      continue;
    }
    if (!current) continue;
    const section = /^### (.+?)\s*$/.exec(line);
    if (section) {
      sectionTitle = section[1]!;
      continue;
    }
    if (sectionTitle && /^\*\s+\S/.test(line)) {
      const entries = current.sections.get(sectionTitle) ?? [];
      entries.push(entryText(line));
      current.sections.set(sectionTitle, entries);
    }
  }
  finish();
  return releases.slice(0, limit);
}

const VIRTUAL_ID = "virtual:release-notes";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * `virtual:release-notes` is the latest releases as plain data, so the start screen needs no
 * request and works offline. Only the lazy "What's new" chunk imports it.
 */
export function releaseNotes(changelogPath: string): Plugin {
  return {
    name: "plan-measure:release-notes",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      this.addWatchFile(changelogPath);
      let changelog = "";
      try {
        changelog = readFileSync(changelogPath, "utf8");
      } catch {
        // Without a changelog the section simply does not render.
      }
      return `export default ${JSON.stringify(parseReleaseNotes(changelog))};`;
    },
  };
}
