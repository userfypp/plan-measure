import { readFile } from "node:fs/promises";
import { isMain } from "./github-api.mjs";

const TYPES = [
  "feat",
  "fix",
  "perf",
  "revert",
  "docs",
  "refactor",
  "chore",
  "ci",
  "test",
  "build",
  "style",
];

export function checkTitle(title) {
  if (
    !new RegExp(`^(${TYPES.join("|")})(\\([^()\\s][^()\\r\\n]*\\))?!?: \\S[^\\r\\n]*$`).test(title)
  ) {
    throw new Error(
      `Use a Conventional Commit PR title, e.g. "feat: export measurements as annotated PDF". Types: ${TYPES.join(", ")}. GitHub's default Revert title is not accepted; write "revert: ..." instead.`,
    );
  }
}

if (isMain(import.meta.url)) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  checkTitle(event.pull_request?.title ?? "");
}
