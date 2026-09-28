import { appendFile } from "node:fs/promises";
import { githubApi, isMain, pages, workflowContext } from "./github-api.mjs";

// The CI workflow serializes main's complete verify -> deploy -> publish chain.
// This guard also handles old reruns and runs queued out of commit order.
export async function planDeployment(api, { repository, sha }) {
  const root = `/repos/${repository}`;
  let previouslyDeployed = false;
  let newerDeployment = false;
  for await (const deployment of pages(api, `${root}/deployments?environment=github-pages`)) {
    if (deployment.ref !== "main" && deployment.ref !== "refs/heads/main") continue;
    let succeeded = false;
    for await (const status of pages(api, `${root}/deployments/${deployment.id}/statuses`)) {
      if (status.state === "success") {
        succeeded = true;
        break;
      }
    }
    if (!succeeded) continue;
    if (deployment.sha === sha) {
      previouslyDeployed = true;
      break;
    }
    const comparison = await api(`${root}/compare/${sha}...${deployment.sha}`);
    if (comparison.status === "ahead") newerDeployment = true;
    else if (comparison.status === "behind") break;
    else if (comparison.status !== "identical") {
      throw new Error("Pages deployment history diverges from this commit; refusing a rollback.");
    }
  }
  if (newerDeployment && !previouslyDeployed) {
    throw new Error(
      "A newer commit is already on Pages and this SHA was never deployed. Refusing to roll back or publish an unverified release.",
    );
  }
  return !newerDeployment;
}

if (isMain(import.meta.url)) {
  const shouldDeploy = await planDeployment(githubApi(), workflowContext());
  await appendFile(process.env.GITHUB_OUTPUT, `should-deploy=${shouldDeploy}\n`);
}
