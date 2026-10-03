import { pathToFileURL } from "node:url";

export const isMain = (url) => process.argv[1] && url === pathToFileURL(process.argv[1]).href;

export function workflowContext(env = process.env) {
  const { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha } = env;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[\w.-]+$/.test(repository ?? "") ||
    !/^[a-f0-9]{40}$/.test(sha ?? "")
  ) {
    throw new Error("Expected a GitHub repository and full commit SHA.");
  }
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Publication and deployment require a push to main.");
  }
  return { repository, sha };
}

// Only explicit 404 responses mean missing data. Permission, rate-limit and
// server failures must stop publication, not masquerade as an absent release.
export function githubApi(token = process.env.GH_TOKEN, request = fetch) {
  if (!token) throw new Error("GH_TOKEN is required.");
  return async (path, { method = "GET", body, optional = false } = {}) => {
    if (!path.startsWith("/repos/")) throw new Error("Expected a repository API path.");
    const response = await request(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        // PR merge_commit_sha remains available in this supported API version.
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) {
      // Log only GitHub's bounded message and request ID, never raw bodies or headers.
      const error = await response.json().catch(() => null);
      const message =
        typeof error?.message === "string"
          ? error.message
              .replaceAll(token, "[redacted]")
              .replace(/[\p{Cc}]/gu, " ")
              .slice(0, 300)
          : "";
      const requestId = (response.headers.get("x-github-request-id") ?? "")
        .replace(/[^\w:-]/g, "")
        .slice(0, 100);
      throw new Error(
        `GitHub ${method} ${path}: HTTP ${response.status}${message ? ` — ${message}` : ""}${requestId ? ` (request ID: ${requestId})` : ""}`,
      );
    }
    if (response.status === 204) return null;
    return response.json();
  };
}

export async function* pages(api, path) {
  for (let page = 1; ; page += 1) {
    const data = await api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (!Array.isArray(data)) throw new Error(`Expected a paginated array: ${path}`);
    yield* data;
    if (data.length < 100) break;
  }
}
