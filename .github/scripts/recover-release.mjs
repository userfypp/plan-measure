import { execFileSync } from "node:child_process";
import { githubApi, isMain, pages, workflowContext } from "./github-api.mjs";
import { publishRelease } from "./publish-release.mjs";

export function recoveryContext(env = process.env) {
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch")
    throw new Error("Release recovery requires a manual dispatch on main.");
  const context = workflowContext({ ...env, GITHUB_EVENT_NAME: "push" });
  if (!/^[1-9]\d*$/.test(env.RECOVERY_RUN_ID ?? ""))
    throw new Error("Expected the original CI run ID.");
  return { ...context, runId: env.RECOVERY_RUN_ID };
}

export async function recoverRelease(api, { repository, runId }, readMetadata) {
  const root = `/repos/${repository}`;
  const run = await api(`${root}/actions/runs/${runId}`);
  if (
    run.path !== ".github/workflows/ci.yml" ||
    run.event !== "push" ||
    run.head_branch !== "main" ||
    run.status !== "completed" ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    !/^[a-f0-9]{40}$/.test(run.head_sha ?? "") ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1
  )
    throw new Error("Recovery requires a completed main CI run from this repository.");

  // Retries may reuse verification from an earlier attempt or skip Pages.
  // Both successful jobs must belong to this run and SHA; skips are not evidence.
  let verified = false;
  let deployedAttempt;
  // Unlike list endpoints for PRs and labels, Actions wraps each page in { jobs }.
  const listJobs = async (path) => (await api(path)).jobs;
  for (let attempt = run.run_attempt; attempt >= 1; attempt -= 1) {
    const jobs = [];
    for await (const job of pages(
      listJobs,
      `${root}/actions/runs/${runId}/attempts/${attempt}/jobs`,
    ))
      jobs.push(job);
    const succeeded = (name) => {
      const matches = jobs.filter((job) => job.name === name);
      return (
        matches.length === 1 &&
        matches[0].head_sha === run.head_sha &&
        matches[0].status === "completed" &&
        matches[0].conclusion === "success"
      );
    };
    verified ||= succeeded("verify");
    if (!deployedAttempt && succeeded("pages / deploy")) deployedAttempt = attempt;
    if (!verified || !deployedAttempt) continue;
    const context = { repository, sha: run.head_sha, runId, attempt: String(deployedAttempt) };
    const result = await publishRelease(api, context, () => readMetadata(run.head_sha));
    if (result.status === "skipped")
      throw new Error("The original CI commit is not a merged Release Please PR.");
    return result;
  }
  throw new Error("The original CI run did not successfully validate and deploy this SHA.");
}

if (isMain(import.meta.url)) {
  try {
    const context = recoveryContext();
    if (execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== context.sha)
      throw new Error("Checkout does not match the recovery workflow commit.");
    const readMetadata = async (sha) => {
      const files = [
        ".release-please-manifest.json",
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
      ].map((path) => execFileSync("git", ["show", `${sha}:${path}`], { encoding: "utf8" }));
      return {
        manifest: JSON.parse(files[0]),
        pkg: JSON.parse(files[1]),
        lock: JSON.parse(files[2]),
        changelog: files[3],
      };
    };
    console.log(JSON.stringify(await recoverRelease(githubApi(), context, readMetadata)));
  } catch (error) {
    console.error(`recover-release: ${error.message}`);
    process.exitCode = 1;
  }
}
