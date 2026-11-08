import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_ENTRIES_PER_RELEASE, MAX_RELEASES, parseReleaseNotes } from "./releaseNotes";

const REPO = "https://github.com/acme/app";
const changelog = `# Changelog

## [2.1.0](${REPO}/compare/v2.0.0...v2.1.0) (2026-02-03)


### Added

* **export:** add \`CSV\` bundles ([#12](${REPO}/issues/12)) ([abc1234](${REPO}/commit/abc1234))
* keep the undo history ([abc1234](${REPO}/commit/abc1234)), closes [#9](${REPO}/issues/9)


### Fixed

* fix a [link](https://example.com) label ([abc1234](${REPO}/commit/abc1234))


### Documentation

* explain things ([abc1234](${REPO}/commit/abc1234))

## [2.0.1](${REPO}/compare/v2.0.0...v2.0.1) (2026-01-20)


### Documentation

* only docs ([abc1234](${REPO}/commit/abc1234))

## [2.0.0](${REPO}/compare/v1.9.0...v2.0.0) (2026-01-01)


### Improved

* **viewer:** draw faster ([abc1234](${REPO}/commit/abc1234))
`;

describe("parseReleaseNotes", () => {
  it("reads version, date, link and the user-facing entries without commit noise", () => {
    expect(parseReleaseNotes(changelog)[0]).toEqual({
      version: "2.1.0",
      date: "2026-02-03",
      url: `${REPO}/releases/tag/v2.1.0`,
      sections: [
        { title: "Added", entries: ["Add CSV bundles", "Keep the undo history"] },
        { title: "Fixed", entries: ["Fix a link label"] },
      ],
      more: 0,
    });
  });

  it("skips releases with only maintenance entries and keeps the newest first", () => {
    expect(parseReleaseNotes(changelog).map((release) => release.version)).toEqual([
      "2.1.0",
      "2.0.0",
    ]);
    expect(parseReleaseNotes(changelog)[1]!.sections[0]!.title).toBe("Improved");
  });

  it("limits the releases and the entries of each, counting what it left out", () => {
    const list = (items: number) =>
      Array.from({ length: items }, (_, i) => `* item ${i}`).join("\n");
    const release = (minor: number) =>
      `## [1.${minor}.0](${REPO}/compare/a...b) (2026-01-01)\n\n### Added\n\n${list(3)}\n\n### Fixed\n\n${list(3)}\n`;
    const parsed = parseReleaseNotes(
      Array.from({ length: MAX_RELEASES + 2 }, (_, i) => release(9 - i)).join("\n"),
    );
    expect(parsed).toHaveLength(MAX_RELEASES);
    expect(parsed[0]!.sections.map((section) => section.entries.length)).toEqual([3, 1]);
    expect(parsed[0]!.more).toBe(6 - MAX_ENTRIES_PER_RELEASE);
  });

  it("has no release link without a repository and returns nothing for an empty changelog", () => {
    expect(parseReleaseNotes("## 1.0.0 (2026-01-01)\n\n### Added\n\n* first\n")[0]?.url).toBeNull();
    expect(parseReleaseNotes("")).toEqual([]);
  });

  it("parses the repository's own changelog into at least one release", () => {
    const releases = parseReleaseNotes(
      readFileSync(`${import.meta.dirname}/../CHANGELOG.md`, "utf8"),
    );
    expect(releases.length).toBeGreaterThan(0);
    for (const release of releases) {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.url).toContain(`/releases/tag/v${release.version}`);
      for (const entry of release.sections.flatMap((section) => section.entries)) {
        expect(entry).not.toMatch(/\]\(|\*\*|`|\(#\d+\)/);
      }
    }
  });
});
