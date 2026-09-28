import { readFile } from "node:fs/promises";
import { isMain } from "./github-api.mjs";

export function checkTitle(title) {
  if (
    !/^(feat|fix|perf|revert|docs|refactor|chore|ci|test|build|style)(\([^()\r\n]+\))?!?: \S[^\r\n]*$/.test(
      title,
    )
  ) {
    throw new Error(
      "Use a Conventional Commit PR title, e.g. feat: export measurements as annotated PDF.",
    );
  }
}

if (isMain(import.meta.url)) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  checkTitle(event.pull_request?.title ?? "");
}
