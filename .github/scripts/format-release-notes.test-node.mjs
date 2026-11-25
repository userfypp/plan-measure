import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  parseChangelog,
  renderNotes,
  sentence,
  closingReferences,
  compareUrl,
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

test("documentation-only and mixed releases keep the entry text and links", () => {
  const sources = new Map([
    [
      sha,
      {
        repository,
        number: 156,
        body: "## Summary\n\n- Ignored text.\n\n## Related Issue\n\n- Closes #113",
      },
    ],
  ]);
  const documentation = entry(`document PDF export options ${metadata}`, "Documentation");
  const expected = `## Documentation\n\n- Document PDF export options. ([#156](https://github.com/${repository}/pull/156), [#113](https://github.com/${repository}/issues/113))\n`;
  assert.equal(renderNotes(parseChangelog(documentation, "3.0.0"), sources), expected);
  assert.equal(
    renderNotes(parseChangelog(documentation + "\n### Fixed\n\n* fix export\n", "3.0.0"), sources),
    `## Improvements and fixes\n\n- Fix export.\n\n${expected}`,
  );
});

test("release notes use the normalized PR title, never the PR description", () => {
  const entries = parseChangelog(
    entry(`**export:** export measurements as annotated PDF ${metadata}`),
    "3.0.0",
  );
  const sources = new Map([
    [
      sha,
      {
        repository,
        number: 156,
        body: "## Summary\n\n- Add annotated PDF export that preserves the original pages.\n\n## Related Issue\n\n- Closes #113",
      },
    ],
  ]);
  assert.equal(
    renderNotes(entries, sources),
    `## What's new\n\n- Export measurements as annotated PDF. ([#156](https://github.com/${repository}/pull/156), [#113](https://github.com/${repository}/issues/113))\n`,
  );
});

test("each line of a BEGIN_COMMIT_OVERRIDE block keeps its own text and the PR links", () => {
  // Release Please writes one changelog entry per override line, all on the squash commit.
  const changelog =
    entry(`**viewer:** let users move labels ${metadata}`) +
    `\n### Fixed\n\n* **export:** keep CSV numbers exact ${metadata}\n`;
  const notes = renderNotes(
    parseChangelog(changelog, "3.0.0"),
    new Map([[sha, { repository, number: 156, body: "BEGIN_COMMIT_OVERRIDE\n...\nCloses #113" }]]),
  );
  const links = `([#156](https://github.com/${repository}/pull/156), [#113](https://github.com/${repository}/issues/113))`;
  assert.equal(
    notes,
    `## What's new\n\n- Let users move labels. ${links}\n\n## Improvements and fixes\n\n- Keep CSV numbers exact. ${links}\n`,
  );
});

test("references stay, and commit links appear only without a stronger reference", () => {
  const notes = renderNotes(
    parseChangelog(entry(`support multiple saved projects ${metadata}`), "3.0.0"),
  );
  assert.match(notes, /Support multiple saved projects\. \(\[#156\]/);
  assert.doesNotMatch(notes, /commit\//);
  const fallback = renderNotes(
    parseChangelog(
      entry(`export PDF ([aaaaaaa](https://github.com/${repository}/commit/${sha}))`),
      "3.0.0",
    ),
  );
  assert.match(fallback, /Export PDF\. \(\[aaaaaaa\]/);
});

test("normalization drops the scope, capitalizes and ends with a period", () => {
  const cases = [
    ["align page bounds", "Align page bounds."],
    ["PDF export works!", "PDF export works!"],
    ["**viewer:** preserve PDF pages", "Preserve PDF pages."],
    ["**deps-dev:** bump vite", "Bump vite."],
    ["[export](https://example.com/export) works", "[Export](https://example.com/export) works."],
    ["`setRatio` preserves scale", "`setRatio` preserves scale."],
    ["keep `setRatio`", "Keep `setRatio`."],
    ["improve rendering?", "Improve rendering?"],
    ["éxport works", "Éxport works."],
    ["Prevent overflow.", "Prevent overflow."],
    ['add a "What\'s new" button', 'Add a "What\'s new" button.'],
    ["iOS Safari support", "iOS Safari support."],
    ["pdf.js upgrade", "pdf.js upgrade."],
    ["2x faster rendering", "2x faster rendering."],
  ];
  for (const [input, expected] of cases) assert.equal(sentence(input), expected);
  assert.throws(() => sentence("**viewer:** "));
});

test("breaking changes stay in their own section", () => {
  const text =
    entry(`remove the old project format ${metadata}`, "⚠ BREAKING CHANGES") +
    "\n### Added\n\n* add import\n\n### Reverted\n\n* revert automatic saving\n";
  const notes = renderNotes(
    parseChangelog(text, "3.0.0"),
    new Map([[sha, { repository, number: 156, body: "## Summary\n- Add a new importer." }]]),
  );
  assert.match(notes, /^## Breaking changes\n\n- Remove the old project format/);
  assert.match(notes, /## What's new\n\n- Add import\./);
  assert.match(notes, /## Improvements and fixes\n\n- Revert automatic saving\./);
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

test("release notes preserve inline code without guessing technical terms", () => {
  const entries = parseChangelog(
    entry(`fix \`setRatio\` in \`viewer.ts\` with \`--strict\` ${metadata}`),
    "3.0.0",
  );
  assert.match(renderNotes(entries), /- Fix `setRatio` in `viewer\.ts` with `--strict`\. /);
});

test("the footer links the app, the install guide and the full changelog", () => {
  const changelog = `## [3.0.0](https://github.com/${repository}/compare/v2.9.0...v3.0.0) (2026-01-01)\n\n### Fixed\n\n* fix export\n`;
  const compare = compareUrl(changelog, "3.0.0");
  assert.equal(compare, `https://github.com/${repository}/compare/v2.9.0...v3.0.0`);
  const notes = renderNotes(parseChangelog(changelog, "3.0.0"), new Map(), undefined, {
    repository,
    compare,
  });
  assert.equal(
    notes,
    `## Improvements and fixes\n\n- Fix export.\n\n---\n\n**Open Plan Measure:** https://userfypp.github.io/plan-measure/ (an open copy updates on its next reload). To install it as an app or use it offline, see [Install and offline](https://github.com/${repository}/blob/main/docs/user-guide.md#install-the-app-and-use-it-offline).\n\n**Full changelog:** [v2.9.0...v3.0.0](${compare})\n`,
  );
  assert.equal(compareUrl(entry("fix export"), "3.0.0"), null);
  assert.doesNotMatch(
    renderNotes(parseChangelog(entry("fix export"), "3.0.0"), new Map(), undefined, {
      repository,
      compare: null,
    }),
    /Full changelog/,
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

test("every released changelog entry parses into plain text with no leaked links", async () => {
  const changelog = await readFile(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
  const versions = [...changelog.matchAll(/^## \[?(\d+\.\d+\.\d+)\]?/gm)].map(([, v]) => v);
  assert.ok(versions.length > 5);
  for (const version of versions)
    for (const { text } of parseChangelog(changelog, version))
      assert.doesNotMatch(text, /\]\(https?:|, closes/, `${version}: ${text}`);
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
  for (const title of [
    "Fix PDF",
    "feat: ",
    "unknown: change",
    "fix: one\nfeat: two",
    "fix(): bad",
    "fix( ): bad",
    'Revert "feat: export PDF"',
  ])
    assert.throws(() => checkTitle(title));
  assert.throws(() => checkTitle('Revert "feat: x"'), /revert: \.\.\./);
});

test("wrapped changelog entries retain references and each entry keeps its description", () => {
  const changelog =
    entry(`add import\n  with validation ${metadata}`) +
    `\n### Fixed\n\n* prevent invalid export ${metadata}\n`;
  const entries = parseChangelog(changelog, "3.0.0");
  assert.equal(entries[0].text, "add import with validation");
  const notes = renderNotes(
    entries,
    new Map([[sha, { repository, number: 156, body: "## Summary\n- Add general functionality." }]]),
  );
  assert.match(notes, /Add import with validation/);
  assert.match(notes, /Prevent invalid export/);
  assert.doesNotMatch(notes, /general functionality/);
});

test("absent PR descriptions keep the PR link and do not mutate parser output", () => {
  const entries = parseChangelog(entry(`add export ${metadata}`), "3.0.0");
  const before = structuredClone(entries);
  const notes = renderNotes(entries, new Map([[sha, { repository, number: 156, body: null }]]));
  assert.match(notes, /Add export/);
  assert.match(notes, /\/pull\/156/);
  assert.deepEqual(entries, before);
});

test("a Release Please closes footer keeps the commit, PR and closed issues", () => {
  const url = (kind, id) => `https://github.com/${repository}/${kind}/${id}`;
  const line = (footer) =>
    `trim the existing undo history when its limit is lowered ([#346](${url("issues", 346)})) ([${sha.slice(0, 7)}](${url("commit", sha)})), closes ${footer}`;
  const [single] = parseChangelog(entry(line(`[#299](${url("issues", 299)})`), "Fixed"), "3.0.0");
  assert.equal(single.text, "trim the existing undo history when its limit is lowered");
  assert.equal(single.commit.sha, sha);
  assert.deepEqual(
    single.references.map(({ label }) => label),
    ["#346", "#299"],
  );
  const [several] = parseChangelog(
    entry(line(`[#299](${url("issues", 299)}), [#300](${url("issues", 300)})`), "Fixed"),
    "3.0.0",
  );
  assert.deepEqual(
    several.references.map(({ label }) => label),
    ["#346", "#299", "#300"],
  );
  const sources = new Map([[sha, { repository, number: 346, body: "" }]]);
  assert.equal(
    renderNotes([single], sources),
    `## Improvements and fixes\n\n- Trim the existing undo history when its limit is lowered. ([#346](${url("pull", 346)}), [#299](${url("issues", 299)}))\n`,
  );
});

test("text that only resembles a closes footer stays in the entry", () => {
  const [kept] = parseChangelog(
    entry("handle the word closes [#5](https://example.com/5)"),
    "3.0.0",
  );
  assert.equal(kept.text, "handle the word closes [#5](https://example.com/5)");
  assert.deepEqual(kept.references, []);
});

test("compare link parsing rejects malformed headings in linear time", () => {
  const heading = (url) => `## [3.0.0](${url}) (2026-01-01)\n`;
  const base = `https://github.com/${repository}/compare/`;
  for (const url of [
    `${base}main...v3.0.0`,
    `${base}v2.9.0..v3.0.0`,
    `https://example.com/compare/v1.0.0...v3.0.0`,
  ])
    assert.equal(compareUrl(heading(url), "3.0.0"), null, url);
  const started = performance.now();
  assert.equal(compareUrl(heading(base + ".".repeat(100_000)), "3.0.0"), null);
  assert.ok(performance.now() - started < 100);
});
