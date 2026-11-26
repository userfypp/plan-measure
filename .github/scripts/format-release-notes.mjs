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

const ISSUE_LINK = String.raw`\[#([1-9]\d*)\]\((https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/([1-9]\d*))\)`;
const CLOSES_FOOTER = new RegExp(String.raw`,\s*closes\s+((?:${ISSUE_LINK}[,\s]*)+)$`, "i");

function splitMetadata(value) {
  let text = value.trim();
  const references = [];
  let commit;
  // Release Please puts a ", closes [#n](url) [#m](url)" footer after the commit link; read it first.
  const closes = text.match(CLOSES_FOOTER);
  if (closes) {
    for (const [, label, url, repository, id] of closes[1].matchAll(new RegExp(ISSUE_LINK, "g"))) {
      if (label !== id) continue;
      references.push({ label: `#${id}`, url, repository, number: Number(id) });
    }
    text = text.slice(0, closes.index).trimEnd();
  }
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

// Release notes are the changelog entries themselves: the squash-merged PR title, or
// the lines of a BEGIN_COMMIT_OVERRIDE block, which Release Please already applied.
// Only the format is normalized: no scope, capital first letter, final period.
export function sentence(value) {
  let text = value.trim().replace(/^\*\*[^*\n]+:\*\*\s*/, "");
  if (!text) throw new Error("Cannot format an empty release note.");
  // Names such as iOS, pdf.js or 2x and code such as `setRatio` keep their own spelling.
  text = text.replace(/^([^\p{L}`]*)(\p{L})([\p{L}\p{N}._-]*)/u, (all, prefix, letter, rest) =>
    /\d/.test(prefix) || /[\p{Lu}.]/u.test(rest) ? all : prefix + letter.toUpperCase() + rest,
  );
  if (!/[.!?](?:["'”’*_`)]*)$/.test(text)) text += ".";
  return text;
}

/** How to open the app, and the guide to installing it and using it offline. */
function useSection(repository) {
  const [owner, name] = repository.split("/");
  const app = `https://${owner.toLowerCase()}.github.io/${name}/`;
  const guide = `https://github.com/${repository}/blob/main/docs/user-guide.md#install-the-app-and-use-it-offline`;
  return `## Use\n\nOpen [Plan Measure](${app}) in your browser. An open copy updates on its next reload. To install it as an app or use it offline, see [Install and use offline](${guide}).`;
}

export function renderNotes(entries, sources = new Map(), repository) {
  const sections = new Map([
    ["Breaking changes", []],
    ["What's new", []],
    ["Improvements and fixes", []],
    ["Documentation", []],
  ]);
  for (const entry of entries) {
    const source = entry.commit && sources.get(entry.commit.sha);
    const breaking = entry.section.includes("BREAKING CHANGES");
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
      .push(`- ${sentence(entry.text)}${links.length ? ` (${links.join(", ")})` : ""}`);
  }
  const rendered = [...sections]
    .filter(([, bullets]) => bullets.length)
    .map(([title, bullets]) => `## ${title}\n\n${bullets.join("\n")}`);
  if (repository) rendered.push(useSection(repository));
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
    const changelog = await readFile(values.get("--changelog"), "utf8");
    const version = values.get("--version");
    const repository = process.env.GITHUB_REPOSITORY ?? "userfypp/plan-measure";
    await writeFile(
      values.get("--output"),
      renderNotes(parseChangelog(changelog, version), new Map(), repository),
      "utf8",
    );
  } catch (error) {
    console.error(`format-release-notes: ${error.message}`);
    process.exitCode = 1;
  }
}
