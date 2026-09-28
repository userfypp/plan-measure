import { readFile, appendFile } from "node:fs/promises";
import { releaseMetadata, collectSources } from "./publish-release.mjs";
import { githubApi } from "./github-api.mjs";
import { renderNotes } from "./format-release-notes.mjs";

// CI runs offline by default. Local authenticated previews may opt in to PR
// enrichment; this entry point performs no GitHub writes.
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--with-pull-requests"))
  throw new Error("Only --with-pull-requests is supported.");
const [manifest, pkg, lock] = await Promise.all(
  [".release-please-manifest.json", "package.json", "package-lock.json"].map(async (path) =>
    JSON.parse(await readFile(path, "utf8")),
  ),
);
const changelog = await readFile("CHANGELOG.md", "utf8");
const { entries } = releaseMetadata(
  { manifest, pkg, lock, changelog },
  { title: `chore(main): release ${manifest["."]}` },
);
const sources = args.includes("--with-pull-requests")
  ? await collectSources(githubApi(), "userfypp/plan-measure", entries)
  : new Map();
const notes = renderNotes(entries, sources);
console.log(notes);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `# Release notes preview\n\n${notes}`);
