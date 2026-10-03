import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseChangelog,
  renderNotes,
  summaryFromBody,
  sentence,
  closingReferences,
} from "./format-release-notes.mjs";
import { checkTitle } from "./check-pr-title.mjs";

const repository = "userfypp/plan-measure";
const sha = "a".repeat(40);
const entry = (text, section = "Added") =>
  `## [3.0.0](https://example.com)\n\n### ${section}\n\n* ${text}\n`;
const metadata = `([#156](https://github.com/${repository}/issues/156)) ([aaaaaaa](https://github.com/${repository}/commit/${sha}))`;

test("release configuration exposes documentation while keeping maintenance types hidden", async () => {
  const config = JSON.parse(
    await readFile(new URL("../../release-please-config.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    config["changelog-sections"].filter(({ hidden }) => !hidden).map(({ type }) => type),
    ["feat", "fix", "perf", "revert", "docs"],
  );
  assert.equal(
    config["changelog-sections"].find(({ type }) => type === "docs").section,
    "Documentation",
  );
});

test("documentation-only and mixed releases retain documentation summaries and links", () => {
  const sources = new Map([
    [
      sha,
      {
        repository,
        number: 156,
        body: "## Summary\n\n- Document PDF export options.\n\n## Related Issue\n\n- Closes #113",
      },
    ],
  ]);
  const documentation = entry(`document PDF export ${metadata}`, "Documentation");
  const expected = `## Documentation\n\n- Document PDF export options. ([#156](https://github.com/${repository}/pull/156), [#113](https://github.com/${repository}/issues/113))\n`;
  assert.equal(renderNotes(parseChangelog(documentation, "3.0.0"), sources), expected);
  assert.equal(
    renderNotes(parseChangelog(documentation + "\n### Fixed\n\n* fix export\n", "3.0.0"), sources),
    `## Improvements and fixes\n\n- Fixed export.\n\n${expected}`,
  );
  assert.match(
    renderNotes(parseChangelog(documentation, "3.0.0")),
    /## Documentation\n\n- Document PDF export\./,
  );
});

test("release notes use the concrete Summary and link PR plus related issue", () => {
  const entries = parseChangelog(
    entry(`export measurements as annotated PDF ${metadata}`),
    "3.0.0",
  );
  const sources = new Map([
    [
      sha,
      {
        repository,
        number: 156,
        body: "## Summary\n\n- Add annotated PDF export that preserves the original pages and overlays visible measurements.\n- Extend the dialog.\n\n## Validation\n\n- npm test\n\n## Related Issue\n\n- Closes #113",
      },
    ],
  ]);
  assert.equal(
    renderNotes(entries, sources),
    `## What's new\n\n- Added annotated PDF export that preserves the original pages and overlays visible measurements. ([#156](https://github.com/${repository}/pull/156), [#113](https://github.com/${repository}/issues/113))\n`,
  );
});

test("fallback retains references and only hides commit links when a stronger reference exists", () => {
  const notes = renderNotes(
    parseChangelog(entry(`support multiple saved projects ${metadata}`), "3.0.0"),
  );
  assert.match(notes, /Supported multiple saved projects\. \(\[#156\]/);
  assert.doesNotMatch(notes, /commit\//);
  const fallback = renderNotes(
    parseChangelog(
      entry(`export PDF ([aaaaaaa](https://github.com/${repository}/commit/${sha}))`),
      "3.0.0",
    ),
  );
  assert.match(fallback, /Exported PDF\. \(\[aaaaaaa\]/);
});

test("Summary parsing excludes comments, other sections, placeholders, and duplicate summaries", () => {
  assert.equal(
    summaryFromBody(
      "## Summary\r\n\r\n<!-- Example - do not use -->\r\n- Preserve the PDF\r\n  and add measurements.\r\n- Another change.\r\n## Validation\r\n- Build.",
    ),
    "Preserve the PDF and add measurements.",
  );
  for (const body of [
    "## Validation\n- tests",
    "## Summary\n- TBD",
    "## Summary\nDescribe the change.",
    "## Summary\n- A\n## Summary\n- B",
    "## Summary\n<!-- - Example -->",
  ]) {
    assert.equal(summaryFromBody(body), null, body);
  }
  assert.equal(summaryFromBody("## Summary\n- Fix a bug"), "Fix a bug");
});

test("capitalization, formatting and punctuation preserve meaning", () => {
  const cases = [
    ["align page bounds", "Align page bounds."],
    ["PDF export works!", "PDF export works!"],
    ["**viewer:** preserve PDF pages", "**Viewer:** preserve PDF pages."],
    ["[export](https://example.com/export) works", "[Export](https://example.com/export) works."],
    ["`setRatio` preserves scale", "Updated: `setRatio` preserves scale."],
    ["improve rendering?", "Improved rendering?"],
    ["éxport works", "Éxport works."],
    ["Prevent overflow.", "Prevented overflow."],
  ];
  for (const [input, expected] of cases) assert.equal(sentence(input, "Fixed"), expected);
});

test("breaking changes remain visible and never replaced by a summary", () => {
  const text =
    entry(`remove the old project format ${metadata}`, "⚠ BREAKING CHANGES") +
    "\n### Added\n\n* add import\n\n### Reverted\n\n* revert automatic saving\n";
  const notes = renderNotes(
    parseChangelog(text, "3.0.0"),
    new Map([[sha, { repository, number: 156, body: "## Summary\n- Add a new importer." }]]),
  );
  assert.match(notes, /^## Breaking changes\n\n- Removed the old project format/);
  assert.match(notes, /## What's new\n\n- Added import\./);
  assert.match(notes, /## Improvements and fixes\n\n- Reverted automatic saving\./);
});

test("malformed, ambiguous or empty changelog fails closed", () => {
  for (const text of [
    entry("test", "Unknown"),
    "## [3.0.0]\n",
    entry("test") + entry("again"),
    "## [3.0.0]\ncontent",
    entry(metadata),
  ]) {
    assert.throws(() => parseChangelog(text, "3.0.0"));
  }
  assert.throws(() => parseChangelog(entry("test"), "3.0.1"));
  assert.throws(() => parseChangelog(entry("test"), "03.0.0"));
  assert.throws(() => parseChangelog(entry("test"), "3.0.0-beta.1"));
  assert.equal(
    parseChangelog(entry("one") + "\n## [3.1.0]\n\n### Added\n\n* two", "3.0.0").length,
    1,
  );
  assert.equal(parseChangelog("## 3.0.0 (2026-01-01)\n### Added\n- a", "3.0.0").length, 1);
});

test("only explicit closing references become issue links", () => {
  const refs = closingReferences(
    "Closes #12, fixes other/repo#7; resolved https://github.com/another/repo/issues/9. See #88. <!-- Closes #90 --> `fixes #99`",
    repository,
  );
  assert.deepEqual(
    refs.map((ref) => ref.label),
    ["#12", "other/repo#7", "another/repo#9"],
  );
});

test("closing references accept colons and ignore fenced and inline code examples", () => {
  const body = [
    "Closes: #12; FIXES: other/repo#7; resolves: https://github.com/another/repo/issues/9",
    "~~~text",
    "Closes #90",
    "~~~",
    "````markdown",
    "```",
    "Fixes #91",
    "```",
    "````",
    "  ~~~",
    "Resolves #92",
    "  ~~~~",
    "`Closes #93` and ``example ` fixes #94``",
    "Closes #15",
    "```",
    "Closes #95", // An unclosed fence remains code through the end.
  ].join("\n");
  assert.deepEqual(
    closingReferences(body, repository).map((ref) => ref.label),
    ["#12", "other/repo#7", "another/repo#9", "#15"],
  );
});

test("release summaries preserve inline code without guessing technical terms", () => {
  const entries = parseChangelog(entry(`add export ${metadata}`), "3.0.0");
  const sources = new Map([
    [
      sha,
      {
        repository,
        number: 156,
        body: "## Summary\n- Fix `setRatio` in `viewer.ts` with `--strict` and keep Show labels readable.",
      },
    ],
  ]);
  assert.match(
    renderNotes(entries, sources),
    /Fixed `setRatio` in `viewer\.ts` with `--strict` and keep Show labels readable\./,
  );
});

test("all existing changelog versions render without invented validation claims", async () => {
  const changelog = await readFile(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
  for (const version of ["2.3.0", "2.4.0", "2.5.0", "2.5.1", "2.6.0"]) {
    const notes = renderNotes(parseChangelog(changelog, version));
    assert.ok(notes.length > 100);
    assert.doesNotMatch(notes, /## Validation/);
  }
});

test("Conventional Commit title validation accepts release and dependency PRs", () => {
  for (const title of [
    "feat: export PDF",
    "fix(viewer)!: remove old mode",
    "chore(main): release 2.6.0",
    "chore(deps-dev): bump vite",
    "ci: harden releases",
    "docs: explain PDF export",
    "docs(readme): explain calibration",
  ])
    checkTitle(title);
  for (const title of ["Fix PDF", "feat: ", "unknown: change", "fix: one\nfeat: two", "fix(): bad"])
    assert.throws(() => checkTitle(title));
});

test("wrapped changelog entries retain references and multi-change commits keep specific descriptions", () => {
  const changelog =
    entry(`add import\n  with validation ${metadata}`) +
    `\n### Fixed\n\n* prevent invalid export ${metadata}\n`;
  const entries = parseChangelog(changelog, "3.0.0");
  assert.equal(entries[0].text, "add import with validation");
  const notes = renderNotes(
    entries,
    new Map([[sha, { repository, number: 156, body: "## Summary\n- Add general functionality." }]]),
  );
  assert.match(notes, /Added import with validation/);
  assert.match(notes, /Prevented invalid export/);
  assert.doesNotMatch(notes, /general functionality/);
});

test("absent PR descriptions fall back without losing links or mutating parser output", () => {
  assert.equal(summaryFromBody(null), null);
  const entries = parseChangelog(entry(`add export ${metadata}`), "3.0.0");
  const before = structuredClone(entries);
  const notes = renderNotes(entries, new Map([[sha, { repository, number: 156, body: null }]]));
  assert.match(notes, /Added export/);
  assert.match(notes, /\/pull\/156/);
  assert.deepEqual(entries, before);
});
