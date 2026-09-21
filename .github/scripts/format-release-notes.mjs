import { readFile, writeFile } from "node:fs/promises";

const ALLOWED_SECTIONS = new Set(["Added", "Fixed", "Improved", "Reverted"]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = new Map();

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!["--changelog", "--version", "--output"].includes(flag) || value == null) {
      fail(
        "Usage: node format-release-notes.mjs --changelog <path> --version <X.Y.Z> --output <path>",
      );
    }

    if (values.has(flag)) {
      fail(`Duplicate argument: ${flag}`);
    }

    values.set(flag, value);
  }

  if (values.size !== 3) {
    fail(
      "Usage: node format-release-notes.mjs --changelog <path> --version <X.Y.Z> --output <path>",
    );
  }

  return {
    changelogPath: values.get("--changelog"),
    version: values.get("--version"),
    outputPath: values.get("--output"),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeReleasePleaseMetadata(value) {
  let text = value.trim();

  while (true) {
    const issueMatch = text.match(
      /\s*\(\[#(\d+)\]\(https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/(?:issues|pull)\/(\d+)\)\)\s*$/i,
    );

    if (issueMatch && issueMatch[1] === issueMatch[2]) {
      text = text.slice(0, issueMatch.index).trimEnd();
      continue;
    }

    const commitMatch = text.match(
      /\s*\(\[([0-9a-f]{7,40})\]\(https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/commit\/([0-9a-f]{40})\)\)\s*$/i,
    );

    if (commitMatch && commitMatch[2].toLowerCase().startsWith(commitMatch[1].toLowerCase())) {
      text = text.slice(0, commitMatch.index).trimEnd();
      continue;
    }

    return text;
  }
}

function normalizeBullet(section, value) {
  const replacements = {
    Added: ["add", "Added"],
    Improved: ["improve", "Improved"],
    Fixed: ["fix", "Fixed"],
    Reverted: ["revert", "Reverted"],
  };

  let text = removeReleasePleaseMetadata(value);
  const [verb, replacement] = replacements[section];
  const verbPattern = new RegExp(`^${verb}(?=\\s)`, "i");

  text = text.replace(verbPattern, replacement).trim();

  if (!text) {
    fail(`Section "${section}" contains an empty bullet after metadata removal.`);
  }

  if (!/[.!?]$/.test(text)) {
    text += ".";
  }

  return `- ${text}`;
}

function parseVersionSection(changelog, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`Expected version in X.Y.Z form; received "${version}".`);
  }

  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const versionHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\].*$`);
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (versionHeading.test(lines[index])) {
      matches.push(index);
    }
  }

  if (matches.length === 0) {
    fail(`Version ${version} was not found in the changelog.`);
  }

  if (matches.length > 1) {
    fail(`Version ${version} appears ${matches.length} times in the changelog.`);
  }

  const start = matches[0] + 1;
  let end = lines.length;

  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end);
}

function collectBullets(lines) {
  const bullets = new Map([...ALLOWED_SECTIONS].map((section) => [section, []]));
  let currentSection = null;
  let currentSectionKnown = false;

  for (const line of lines) {
    const headingMatch = line.match(/^### (.+?)\s*$/);

    if (headingMatch) {
      currentSection = headingMatch[1];
      currentSectionKnown = ALLOWED_SECTIONS.has(currentSection);
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    if (currentSection == null) {
      fail(`Unexpected content before a ### section: "${line.trim()}".`);
    }

    if (!currentSectionKnown) {
      fail(`Unknown changelog section "### ${currentSection}" contains content.`);
    }

    const bulletMatch = line.match(/^\s*[-*]\s+(.+?)\s*$/);

    if (!bulletMatch) {
      fail(`Unexpected content in "### ${currentSection}": "${line.trim()}".`);
    }

    bullets.get(currentSection).push(normalizeBullet(currentSection, bulletMatch[1]));
  }

  return bullets;
}

function renderNotes(bullets) {
  const sections = [];
  const added = bullets.get("Added");
  const improvementsAndFixes = [
    ...bullets.get("Improved"),
    ...bullets.get("Fixed"),
    ...bullets.get("Reverted"),
  ];

  if (added.length > 0) {
    sections.push(`## What's new\n\n${added.join("\n")}`);
  }

  if (improvementsAndFixes.length > 0) {
    sections.push(`## Improvements and fixes\n\n${improvementsAndFixes.join("\n")}`);
  }

  sections.push(
    "## Validation\n\n- Automated tests, lint and production build passing.\n- GitHub Pages deployment passing.",
  );

  return `${sections.join("\n\n")}\n`;
}

async function main() {
  const { changelogPath, version, outputPath } = parseArgs(process.argv.slice(2));
  const changelog = await readFile(changelogPath, "utf8");
  const versionSection = parseVersionSection(changelog, version);
  const bullets = collectBullets(versionSection);
  const notes = renderNotes(bullets);

  await writeFile(outputPath, notes, "utf8");
}

main().catch((error) => {
  console.error(`format-release-notes: ${error.message}`);
  process.exitCode = 1;
});
