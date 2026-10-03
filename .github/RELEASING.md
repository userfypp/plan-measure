# Release operations

For the release process and versioning rules, see [RELEASING.md](../RELEASING.md). Release Please manages release versions and the changelog; do not edit them by hand.

## Repository settings

- Allow only **Squash merging**. Under **Settings → General → Pull Requests**, set the squash message to **Pull request title and description** (`squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=PR_BODY`). Check the final title before merging.
- Require `verify` and `dependency-review` on `main`, require branches to be up to date, and keep the existing PR and CodeQL protections. Deployment and publication run only after pushes to `main`; do not require them on PRs.
- Configure Pages with **GitHub Actions** and restrict the `github-pages` environment to `main`. Environment approval rules still apply.
- Provide `RELEASE_PLEASE_TOKEN` to the Release Please workflow. Use a repository-scoped PAT or GitHub App token with **Contents**, **Pull requests**, and **Issues** read/write access so bot PR updates trigger CI. Renew it before expiry; never commit its value.

Publication uses `GITHUB_TOKEN` with explicit job permissions: `contents: write`, `pull-requests: write`, and `issues: write` in both the CI caller and the reusable publication workflow. PR-label updates require pull-request write access. It needs no additional secret or broader default permissions. Releases created with this token do not trigger workflows listening for `release` events; configure downstream work explicitly if needed.

## Pull requests and release notes

Use a Conventional Commit title: `feat:`, `fix:`, `perf:`, `revert:`, `docs:`, `refactor:`, `chore:`, `ci:`, `test:`, `build:`, or `style:`. Add a scope if useful and `!` for a breaking change. CI checks the title, including after edits. The final squash commit describes the complete change; intermediate commits can describe individual steps.

Follow the PR template. Write the first **Summary** bullet as a complete description of the change and its effect. Omit **Related Issue** when there is no issue.

```markdown
## Summary

- Add annotated PDF export that preserves the original pages and overlays visible measurements and labels.

## Validation

- Tests and checks performed.

## Related Issue

- Closes #113
```

The first Summary bullet, including continuation lines, supplies the release-note description. Other bullets and validation commands are excluded. Keep this summary accurate when updating a PR. If it is missing or unusable, the generated changelog description is kept. When a commit produces several distinct changelog entries, their specific descriptions are preserved.

Release notes preserve Markdown, normalize initial capitalization and final punctuation, and link the source PR and explicit `Closes`, `Fixes`, or `Resolves` references. A commit link is kept when no PR or issue link is available. The source PR must match the squash commit; mentioning an issue does not make it a source PR.

Use inline code in the first Summary bullet for commands (`npm test`), file paths (`package.json`), identifiers (`setRatio`), flags (`--with-pull-requests`), and literal values. Keep UI labels in plain text. The formatter preserves this Markdown; it does not guess which words are code. Closing references may include a colon (`Closes: #123`); references inside fenced code examples are excluded.

Breaking changes have their own section. Documentation PRs (`docs:`) appear under **Documentation** and can produce a patch release. Other maintenance types stay hidden; `ci:` alone does not create a release.

CI includes a preview based on the local changelog. To preview notes with PR summaries, set `GH_TOKEN` and run:

```bash
node .github/scripts/preview-release-notes.mjs --with-pull-requests
```

The preview reads data without changing the changelog or releases.

## Publication sequence

1. Squash merge ordinary PRs. After the main pipeline succeeds, Release Please creates or updates its draft release PR. Leave its generated version, branch name, and state labels intact.
2. To publish, mark the release PR ready, wait for required checks, and squash merge it. Do not create tags or releases manually.
3. CI runs `verify`, then Pages deployment, then publication for that exact commit. A failed check or deployment blocks publication. Ordinary main commits also deploy to Pages.
4. Publication verifies version files, the successful Pages `deploy` job, and the unique merged Release Please PR with `autorelease: pending`. It creates the tag at the validated SHA, prepares and verifies a draft release with complete notes, and publishes it. Only then does it update the `autorelease: tagged` and `autorelease: pending` labels.
5. Release Please refreshes the next release PR, including changes merged while an earlier release was pending. To refresh it manually, run the **Release Please** workflow on `main`.

Main pipelines queue without canceling pending releases. GitHub's [`queue: max`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) allows up to 100 pending runs, ordered by queue entry time. The Pages guard prevents older runs from replacing a newer successful deployment. Release Please and publication share a serialization group to keep label updates consistent.

## Recovery

Open **Actions → CI → the affected main run → Re-run failed jobs**. Deployment and publication are reusable workflows within that run, not separate manually dispatched workflows. Retry failures before merging more work when possible.

- Tags must point to the validated SHA. A mismatch fails the run; the automation never moves or deletes tags.
- Retries complete missing releases and partially prepared drafts.
- Retries verify published releases and repair missing state labels. Published notes are preserved even if the source PR is edited later.
- Retrying an older version does not replace a newer **Latest** release.
- An older run can finish publication if its exact SHA previously deployed, without replacing newer Pages content. If it never deployed and a newer SHA is already deployed, it fails. Investigate the skipped release; do not delete a newer deployment or move a tag to bypass the guard.
- Rerunning a failed run uses its original workflow permissions. If a workflow fix was merged later, open **Actions → Recover Release → Run workflow**, select `main`, and enter the original CI run ID (the number in its URL). Recovery uses the current code and permissions, verifies successful `verify` and `pages / deploy` jobs for the original SHA across that run's attempts, and reads version metadata from that commit. It reuses the publisher to finish a missing release or repair state labels, preserves published notes and tags, and then refreshes the next Release Please PR. It never redeploys Pages. A run from another branch, an unvalidated or undeployed SHA, or a commit that is not a merged release PR is rejected.
- API errors fail the run and report the HTTP status, GitHub message when available, and request ID. Check permissions, renew expired tokens, or retry transient failures; do not treat an API failure as a missing release. Writes are not automatically retried.

Local tests cover API transitions and failures. After workflow changes, verify GitHub permissions, environment rules, and publication behavior in the first main run. Local checks do not publish a test release.
