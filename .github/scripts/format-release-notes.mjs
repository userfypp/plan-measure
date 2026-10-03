import { readFile, writeFile } from "node:fs/promises";
import { isMain } from "./github-api.mjs";

const SECTIONS = [
  "⚠ BREAKING CHANGES",
  "BREAKING CHANGES",
  "Added",
  "Improved",
  "Fixed",
  "Reverted",
  "Documentation",
];
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const isVersion = (value) => VERSION.test(value);

function splitMetadata(value) {
  let text = value.trim();
  const references = [];
  let commit;
  for (;;) {
    const match = text.match(
      /\s*\(\[([^\]]+)\]\((https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(issues|pull|commit)\/([\da-f]+))\)\)\s*$/i,
    );
    if (!match) break;
    const [, label, url, repository, kind, id] = match;
    if (kind === "commit") {
      if (!/^[a-f\d]{7,40}$/i.test(label) || !/^[a-f\d]{40}$/i.test(id) || !id.startsWith(label))
        break;
      if (commit && commit.sha !== id)
        throw new Error("A changelog entry references multiple commits.");
      commit = { sha: id, url, repository };
    } else {
      if (label !== `#${id}` || !/^[1-9]\d*$/.test(id)) break;
      references.unshift({ label, url, repository, number: Number(id) });
    }
    text = text.slice(0, match.index).trimEnd();
  }
  if (!text) throw new Error("Empty changelog entry after metadata removal.");
  return { text, references, commit };
}

function stripHtmlComments(value = "") {
  let current = value;
  while (true) {
    const next = current.replace(/<!--[^]*?-->/g, "");
    if (next === current) return next;
    current = next;
  }
}

export function parseChangelog(changelog, version) {
  if (!isVersion(version)) throw new Error(`Expected an X.Y.Z version; received "${version}".`);
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const heading = new RegExp(
    `^## (?:\\[${version.replaceAll(".", "\\.")}\\]|${version.replaceAll(".", "\\.")}(?=\\s|$))`,
  );
  const starts = lines.flatMap((line, index) => (heading.test(line) ? [index] : []));
  if (starts.length !== 1)
    throw new Error(
      `Version ${version} must appear exactly once in the changelog (found ${starts.length}).`,
    );
  const entries = [];
  let section;
  for (const line of lines.slice(starts[0] + 1)) {
    if (/^## /.test(line)) break;
    if (!line.trim()) continue;
    const sectionMatch = line.match(/^### (.+?)\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (!SECTIONS.includes(section)) throw new Error(`Unknown changelog section: ${section}`);
      continue;
    }
    const bullet = line.match(/^[-*] (.+)$/);
    if (section && bullet) {
      entries.push({ section, raw: bullet[1] });
    } else if (section && /^ {2,}\S/.test(line) && entries.at(-1)?.section === section) {
      entries.at(-1).raw += ` ${line.trim()}`;
    } else {
      throw new Error(`Unexpected changelog content: ${line}`);
    }
  }
  if (!entries.length) throw new Error(`Version ${version} has no release notes.`);
  return entries.map(({ section, raw }) => ({ section, ...splitMetadata(raw) }));
}

// Use the first concrete Summary bullet, not validation commands, issue text,
// generated prose, or an arbitrary sentence elsewhere in the PR description.
export function summaryFromBody(body = "") {
  const clean = stripHtmlComments(body ?? "").replace(/\r\n/g, "\n");
  const sections = [...clean.matchAll(/^## Summary\s*\n([^]*?)(?=^#{1,2} |$(?![^]))/gim)];
  if (sections.length !== 1) return null;
  const lines = sections[0][1].trim().split("\n");
  const first = lines[0]?.match(/^[-*] (\S.*)$/);
  if (!first) return null;
  let result = first[1];
  for (const line of lines.slice(1)) {
    if (/^ {2,}\S/.test(line) && !/^\s*[-*] /.test(line)) result += ` ${line.trim()}`;
    else break;
  }
  if (
    !/\p{L}/u.test(result) ||
    /^\[[ xX]\]\s/.test(result) ||
    /^(?:todo|tbd|n\/a|what changed|describe)\b/i.test(result)
  )
    return null;
  return result;
}

export function closingReferences(body = "", repository) {
  let fence;
  const clean = stripHtmlComments(body ?? "")
    .split(/\r?\n/)
    .map((line) => {
      if (fence) {
        const closing = line.match(/^ {0,3}(`+|~+)\s*$/);
        if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length)
          fence = undefined;
        return "";
      }
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
        fence = opening[1];
        return "";
      }
      return line;
    })
    .join("\n")
    .replace(/(?<!`)(`+)(?!`)[^]*?(?<!`)\1(?!`)/g, "");
  const result = [];
  const pattern =
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:(https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/([1-9]\d*))|(?:([\w.-]+\/[\w.-]+)?#([1-9]\d*)))\b/gi;
  for (const match of clean.matchAll(pattern)) {
    const repo = match[2] ?? match[4] ?? repository;
    const number = match[3] ?? match[5];
    result.push({
      label: repo === repository ? `#${number}` : `${repo}#${number}`,
      url: `https://github.com/${repo}/issues/${number}`,
      repository: repo,
      number: Number(number),
    });
  }
  return result;
}

export function sentence(value, section) {
  let text = value.trim();
  if (!text) throw new Error("Cannot format an empty release note.");
  const verbs = {
    add: "Added",
    fix: "Fixed",
    improve: "Improved",
    revert: "Reverted",
    export: "Exported",
    synchronize: "Synchronized",
    prevent: "Prevented",
    preserve: "Preserved",
    support: "Supported",
    allow: "Allowed",
    update: "Updated",
    remove: "Removed",
    correct: "Corrected",
    enable: "Enabled",
  };
  text = text.replace(
    /^(add|fix|improve|revert|export|synchronize|prevent|preserve|support|allow|update|remove|correct|enable)(?=\s)/i,
    (word) => verbs[word.toLowerCase()],
  );
  // Preserve code identifiers and their case when they lead a sentence.
  if (/^[*_]*`/.test(text)) text = `${section === "Added" ? "Added" : "Updated"}: ${text}`;
  else
    text = text.replace(/^(\P{L}*)(\p{L})/u, (_, prefix, letter) => prefix + letter.toUpperCase());
  if (!/[.!?](?:["'”’*_]*)$/.test(text)) text += ".";
  return text;
}

export function renderNotes(entries, sources = new Map(), evidence) {
  const sections = new Map([
    ["Breaking changes", []],
    ["What's new", []],
    ["Improvements and fixes", []],
    ["Documentation", []],
  ]);
  for (const entry of entries) {
    const source = entry.commit && sources.get(entry.commit.sha);
    // A breaking-change explanation must never be replaced by a PR summary.
    const breaking = entry.section.includes("BREAKING CHANGES");
    const sameCommitEntries = entry.commit
      ? entries.filter(
          (candidate) =>
            candidate.commit?.sha === entry.commit.sha &&
            !candidate.section.includes("BREAKING CHANGES"),
        ).length
      : 0;
    // A multi-change commit can produce several entries. Preserve each specific
    // description instead of replacing them all with the same PR summary.
    const text =
      !breaking && source && sameCommitEntries === 1
        ? (summaryFromBody(source.body) ?? entry.text)
        : entry.text;
    const references = entry.references.map((ref) => ({ ...ref }));
    if (source) {
      const prUrl = `https://github.com/${source.repository}/pull/${source.number}`;
      for (const ref of references) {
        if (ref.repository === source.repository && ref.number === source.number) ref.url = prUrl;
      }
      references.push(
        { label: `#${source.number}`, url: prUrl },
        ...closingReferences(source.body, source.repository),
      );
    }
    const links = [
      ...new Map(references.map((ref) => [ref.url, `[${ref.label}](${ref.url})`])).values(),
    ];
    if (!links.length && entry.commit)
      links.push(`[${entry.commit.sha.slice(0, 7)}](${entry.commit.url})`);
    const group = breaking
      ? "Breaking changes"
      : entry.section === "Added"
        ? "What's new"
        : entry.section === "Documentation"
          ? "Documentation"
          : "Improvements and fixes";
    sections
      .get(group)
      .push(`- ${sentence(text, entry.section)}${links.length ? ` (${links.join(", ")})` : ""}`);
  }
  const rendered = [...sections]
    .filter(([, bullets]) => bullets.length)
    .map(([title, bullets]) => `## ${title}\n\n${bullets.join("\n")}`);
  if (evidence) {
    rendered.push(
      `## Validation\n\n- Automated tests, lint and production build passed.\n- GitHub Pages deployment verified for [${evidence.sha.slice(0, 7)}](https://github.com/${evidence.repository}/commit/${evidence.sha}).\n- [Workflow run](https://github.com/${evidence.repository}/actions/runs/${evidence.runId}/attempts/${evidence.attempt}).`,
    );
  }
  return `${rendered.join("\n\n")}\n`;
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const values = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (
        !["--changelog", "--version", "--output"].includes(args[i]) ||
        !args[i + 1] ||
        values.has(args[i])
      )
        throw new Error("Expected --changelog <path> --version <X.Y.Z> --output <path>.");
      values.set(args[i], args[i + 1]);
    }
    if (values.size !== 3)
      throw new Error("Expected --changelog <path> --version <X.Y.Z> --output <path>.");
    const entries = parseChangelog(
      await readFile(values.get("--changelog"), "utf8"),
      values.get("--version"),
    );
    await writeFile(values.get("--output"), renderNotes(entries), "utf8");
  } catch (error) {
    console.error(`format-release-notes: ${error.message}`);
    process.exitCode = 1;
  }
}
