import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { githubApi, isMain, pages, workflowContext } from "./github-api.mjs";
import { isVersion, parseChangelog, renderNotes } from "./format-release-notes.mjs";

const RELEASE_BRANCH = "release-please--branches--main--components--plan-measure";
const PENDING = "autorelease: pending";
const TAGGED = "autorelease: tagged";

export async function releasePullRequest(api, repository, sha) {
  const candidates = [];
  for await (const pr of pages(api, `/repos/${repository}/commits/${sha}/pulls`)) {
    if (
      pr.merged_at &&
      pr.merge_commit_sha === sha &&
      pr.base.ref === "main" &&
      pr.base.repo.full_name === repository &&
      pr.head.repo?.full_name === repository &&
      pr.head.ref === RELEASE_BRANCH
    )
      candidates.push(pr);
  }
  if (candidates.length > 1)
    throw new Error("More than one release PR matches the deployed commit.");
  return candidates[0] ?? null;
}

export function releaseMetadata({ manifest, pkg, lock, changelog }, pr) {
  const version = manifest["."];
  if (!isVersion(version))
    throw new Error("The release manifest must contain a stable X.Y.Z version.");
  if (
    pkg.version !== version ||
    lock.version !== version ||
    lock.packages?.[""]?.version !== version
  ) {
    throw new Error("Release manifest, package.json and package-lock.json versions must agree.");
  }
  const expectedTitle = new RegExp(
    `^chore(?:\\(main\\))?: release(?: plan-measure)? ${version.replaceAll(".", "\\.")}$`,
  );
  if (!expectedTitle.test(pr.title))
    throw new Error("Release PR title does not match the version being published.");
  return {
    version,
    tag: `v${version}`,
    title: `Plan Measure v${version}`,
    entries: parseChangelog(changelog, version),
  };
}

function stateOf(labels) {
  const names = new Set(labels.map((label) => label.name));
  const pending = names.has(PENDING);
  const tagged = names.has(TAGGED);
  // Both labels can occur if a previous run stopped between add and remove.
  if (!pending && !tagged) throw new Error("Release PR has no pending or tagged state label.");
  return { pending, tagged };
}

async function verifyTag(api, root, tag, sha, { optional = false } = {}) {
  const ref = await api(`${root}/git/ref/tags/${tag}`, { optional });
  if (!ref) return false;
  // Resolve the tag object itself. /commits/<name> is ambiguous when a branch
  // and tag share a name, and annotated tags can reference another tag.
  let object = ref.object;
  const seen = new Set();
  while (object?.type === "tag") {
    if (seen.has(object.sha)) throw new Error(`Cyclic annotated tag: ${tag}`);
    seen.add(object.sha);
    object = (await api(`${root}/git/tags/${object.sha}`)).object;
  }
  if (object?.type !== "commit" || object.sha !== sha)
    throw new Error(`Tag ${tag} does not point to the validated commit ${sha}.`);
  return true;
}

function verifyRelease(release, metadata, body) {
  if (
    release.tag_name !== metadata.tag ||
    release.name !== metadata.title ||
    release.prerelease !== false ||
    !release.body?.trim()
  ) {
    throw new Error("Release metadata does not match the expected stable release.");
  }
  if (body !== undefined && release.body.replace(/\r\n/g, "\n").trimEnd() !== body.trimEnd()) {
    throw new Error("GitHub did not preserve the prepared release notes.");
  }
}

export async function collectSources(api, repository, entries) {
  const sources = new Map();
  for (const entry of entries) {
    const commit = entry.commit;
    if (!commit || commit.repository !== repository || sources.has(commit.sha)) continue;
    const candidates = [];
    for await (const pr of pages(api, `/repos/${repository}/commits/${commit.sha}/pulls`)) {
      if (
        pr.merged_at &&
        pr.merge_commit_sha === commit.sha &&
        pr.base.ref === "main" &&
        pr.base.repo.full_name === repository
      )
        candidates.push(pr);
    }
    if (candidates.length > 1) throw new Error(`Ambiguous source PR for ${commit.sha}.`);
    sources.set(commit.sha, candidates.length ? { ...candidates[0], repository } : null);
  }
  return sources;
}

function newerVersion(left, right) {
  const a = left.split(".").map(BigInt);
  const b = right.split(".").map(BigInt);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function reconcileLabels(api, root, prNumber) {
  const path = `${root}/issues/${prNumber}/labels`;
  const labels = [];
  for await (const label of pages(api, path)) labels.push(label);
  const state = stateOf(labels);
  // Add first, then remove: an interrupted repair always has a recoverable state.
  if (!state.tagged) await api(path, { method: "POST", body: { labels: [TAGGED] } });
  if (state.pending) await api(`${path}/${encodeURIComponent(PENDING)}`, { method: "DELETE" });
  const finalLabels = [];
  for await (const label of pages(api, path)) finalLabels.push(label);
  const finalState = stateOf(finalLabels);
  if (!finalState.tagged || finalState.pending)
    throw new Error("Release label reconciliation failed.");
}

export async function publishRelease(api, context, readMetadata) {
  const { repository, sha } = context;
  const root = `/repos/${repository}`;
  const pr = await releasePullRequest(api, repository, sha);
  if (!pr) return { status: "skipped", reason: "This commit is not a merged Release Please PR." };
  const state = stateOf(pr.labels);
  const metadata = releaseMetadata(await readMetadata(), pr);
  const { tag, title, entries } = metadata;
  // Listing includes drafts visible to a writer; the tag endpoint is for
  // published releases and cannot be our only recovery lookup.
  const matchingReleases = [];
  for await (const candidate of pages(api, `${root}/releases`)) {
    if (candidate.tag_name === tag) matchingReleases.push(candidate);
  }
  if (matchingReleases.length > 1) throw new Error("Multiple releases use the expected tag.");
  let release = matchingReleases[0];
  let tagExists = await verifyTag(api, root, tag, sha, { optional: true });

  if (release && !release.draft) {
    if (!tagExists) throw new Error("A published release exists without its tag.");
    // Published notes are immutable to this automation. PR edits and reruns
    // must not silently change the historical account of a shipped version.
    verifyRelease(release, metadata);
    await reconcileLabels(api, root, pr.number);
    return { status: "already-published", tag };
  }
  if (state.tagged) throw new Error("PR is tagged but its published release is missing.");
  if (
    release &&
    (release.tag_name !== tag || release.target_commitish !== sha || release.prerelease)
  ) {
    throw new Error("Existing draft does not belong to this exact stable release commit.");
  }
  const sources = await collectSources(api, repository, entries);
  const body = renderNotes(entries, sources, context);
  const latest = await api(`${root}/releases/latest`, { optional: true });
  let makeLatest = "true";
  if (latest) {
    const latestVersion = latest.tag_name.replace(/^v/, "");
    if (!isVersion(latestVersion))
      throw new Error("Cannot safely compare the latest release version.");
    makeLatest = newerVersion(metadata.version, latestVersion) ? "true" : "false";
  }
  if (!tagExists) {
    await api(`${root}/git/refs`, { method: "POST", body: { ref: `refs/tags/${tag}`, sha } });
    tagExists = await verifyTag(api, root, tag, sha);
  }
  if (!tagExists) throw new Error("Release tag was not created.");
  const draft = {
    tag_name: tag,
    target_commitish: sha,
    name: title,
    body,
    draft: true,
    prerelease: false,
  };
  if (release) {
    release = await api(`${root}/releases/${release.id}`, { method: "PATCH", body: draft });
  } else {
    release = await api(`${root}/releases`, { method: "POST", body: draft });
  }
  release = await api(`${root}/releases/${release.id}`);
  verifyRelease(release, metadata, body);
  if (!release.draft || release.target_commitish !== sha)
    throw new Error("Expected an exact-commit draft before publication.");
  await verifyTag(api, root, tag, sha);
  await api(`${root}/releases/${release.id}`, {
    method: "PATCH",
    body: { draft: false, make_latest: makeLatest },
  });
  release = await api(`${root}/releases/${release.id}`);
  verifyRelease(release, metadata, body);
  if (release.draft) throw new Error("Release remained a draft after publication.");
  await verifyTag(api, root, tag, sha);
  await reconcileLabels(api, root, pr.number);
  return { status: "published", tag };
}

if (isMain(import.meta.url)) {
  try {
    const context = {
      ...workflowContext(),
      runId: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
    };
    if (!/^[1-9]\d*$/.test(context.runId ?? "") || !/^[1-9]\d*$/.test(context.attempt ?? "")) {
      throw new Error("Expected workflow run and attempt identifiers.");
    }
    if (execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== context.sha) {
      throw new Error("Checkout does not match the validated commit.");
    }
    const readMetadata = async () => {
      const files = await Promise.all(
        [".release-please-manifest.json", "package.json", "package-lock.json", "CHANGELOG.md"].map(
          (path) => readFile(path, "utf8"),
        ),
      );
      return {
        manifest: JSON.parse(files[0]),
        pkg: JSON.parse(files[1]),
        lock: JSON.parse(files[2]),
        changelog: files[3],
      };
    };
    console.log(JSON.stringify(await publishRelease(githubApi(), context, readMetadata)));
  } catch (error) {
    console.error(`publish-release: ${error.message}`);
    process.exitCode = 1;
  }
}
