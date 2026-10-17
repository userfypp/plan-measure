import { appendFile } from "node:fs/promises";
import { githubApi, isMain, pages } from "./github-api.mjs";
import { isVersion } from "./format-release-notes.mjs";

const RELEASE_BRANCH = "release-please--branches--main--components--plan-measure";
const MANIFEST = ".release-please-manifest.json";
export const BUMPS = ["patch", "minor", "major"];
export const CHOICES = ["keep", "auto", ...BUMPS];
const LABEL_PREFIX = "release: ";
export const bumpLabel = (bump) => `${LABEL_PREFIX}${bump}`;
const LABEL_DESCRIPTIONS = {
  patch: "Next release is a patch, whatever the commits say",
  minor: "Next release is a minor version, whatever the commits say",
  major: "Next release is a major version, whatever the commits say",
};

export function parseChoice(value = "") {
  const choice = value.trim() || "keep";
  if (!CHOICES.includes(choice)) {
    throw new Error(`Expected a release version choice: ${CHOICES.join(", ")}.`);
  }
  return choice;
}

export function nextVersion(current, bump) {
  if (!isVersion(current))
    throw new Error("The release manifest must contain a stable X.Y.Z version.");
  const [major, minor, patch] = current.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown version bump: ${bump}.`);
}

export function savedBump(labels) {
  const bumps = BUMPS.filter((bump) => labels.some((label) => label.name === bumpLabel(bump)));
  if (bumps.length > 1) {
    throw new Error(
      `The release PR has conflicting version labels: ${bumps.map(bumpLabel).join(", ")}.`,
    );
  }
  return bumps[0] ?? null;
}

export async function openReleasePullRequest(api, repository) {
  const [owner] = repository.split("/");
  const candidates = [];
  const path = `/repos/${repository}/pulls?state=open&base=main&head=${encodeURIComponent(`${owner}:${RELEASE_BRANCH}`)}`;
  for await (const pr of pages(api, path)) {
    if (
      pr.base.ref === "main" &&
      pr.base.repo.full_name === repository &&
      pr.head.repo?.full_name === repository &&
      pr.head.ref === RELEASE_BRANCH
    )
      candidates.push(pr);
  }
  if (candidates.length > 1) throw new Error("More than one open release PR exists.");
  return candidates[0] ?? null;
}

// Release Please reads the manifest from main through the API, so the bump starts from the same version.
async function manifestVersion(api, repository) {
  const file = await api(`/repos/${repository}/contents/${MANIFEST}?ref=main`);
  if (file?.encoding !== "base64" || typeof file.content !== "string") {
    throw new Error("Could not read the release manifest from main.");
  }
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"))["."];
}

/**
 * The version Release Please must use, or null to follow Conventional Commits.
 * "keep" reuses the bump saved as a label on the open release PR.
 */
export async function resolveReleaseAs(api, repository, choice) {
  let bump = BUMPS.includes(choice) ? choice : null;
  if (choice === "keep") {
    const pr = await openReleasePullRequest(api, repository);
    bump = pr ? savedBump(pr.labels) : null;
  }
  if (!bump) return { bump: null, releaseAs: null };
  return { bump, releaseAs: nextVersion(await manifestVersion(api, repository), bump) };
}

async function ensureLabel(api, repository, bump) {
  const name = bumpLabel(bump);
  const existing = await api(`/repos/${repository}/labels/${encodeURIComponent(name)}`, {
    optional: true,
  });
  if (!existing) {
    await api(`/repos/${repository}/labels`, {
      method: "POST",
      body: { name, color: "5319e7", description: LABEL_DESCRIPTIONS[bump] },
    });
  }
}

/** Saves an explicit choice on the open release PR so later runs keep it; "auto" clears it. */
export async function saveChoice(api, repository, choice) {
  if (choice === "keep") return { saved: false, pr: null };
  const pr = await openReleasePullRequest(api, repository);
  if (!pr) return { saved: false, pr: null };
  const path = `/repos/${repository}/issues/${pr.number}/labels`;
  const wanted = BUMPS.includes(choice) ? bumpLabel(choice) : null;
  if (wanted) await ensureLabel(api, repository, choice);
  for (const label of pr.labels) {
    if (label.name.startsWith(LABEL_PREFIX) && label.name !== wanted) {
      await api(`${path}/${encodeURIComponent(label.name)}`, { method: "DELETE", optional: true });
    }
  }
  if (wanted && !pr.labels.some((label) => label.name === wanted)) {
    await api(path, { method: "POST", body: { labels: [wanted] } });
  }
  const finalLabels = [];
  for await (const label of pages(api, path)) finalLabels.push(label);
  if (savedBump(finalLabels) !== (wanted ? choice : null)) {
    throw new Error("Release version label reconciliation failed.");
  }
  return { saved: true, pr: pr.number };
}

function releaseContext(env = process.env) {
  const repository = env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[\w.-]+$/.test(repository ?? "")) {
    throw new Error("Expected a GitHub repository.");
  }
  if (env.GITHUB_REF !== "refs/heads/main") throw new Error("Release versions are chosen on main.");
  return repository;
}

if (isMain(import.meta.url)) {
  try {
    const mode = process.argv[2];
    const repository = releaseContext();
    const choice = parseChoice(process.env.RELEASE_BUMP);
    const api = githubApi();
    if (mode === "resolve") {
      const { bump, releaseAs } = await resolveReleaseAs(api, repository, choice);
      await appendFile(process.env.GITHUB_OUTPUT, `release_as=${releaseAs ?? ""}\n`);
      console.log(
        bump
          ? `Next release: ${releaseAs} (${bump}, chosen manually).`
          : "Next release follows Conventional Commits.",
      );
    } else if (mode === "save") {
      const { saved, pr } = await saveChoice(api, repository, choice);
      if (saved) console.log(`Saved "${choice}" on release PR #${pr}.`);
      else if (choice !== "keep")
        console.log(
          `::warning::No open release PR, so "${choice}" was not saved. Run this workflow again once one exists.`,
        );
    } else {
      throw new Error('Expected "resolve" or "save".');
    }
  } catch (error) {
    console.error(`release-bump: ${error.message}`);
    process.exitCode = 1;
  }
}
