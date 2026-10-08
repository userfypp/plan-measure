# Release operations

[Release process](../RELEASING.md) · [Contribution guidelines](../CONTRIBUTING.md)

## Repository configuration

- Allow only **Squash merging**. In **Settings → General → Pull Requests**, select **Pull request title and description** for the squash message (`PR_TITLE` / `PR_BODY`). Check the final title before merging.
- Require `verify` and `dependency-review` on `main`, up-to-date branches, and the existing PR and CodeQL protections. Deployment and publication run on `main`, not PRs.
- Set Pages to **GitHub Actions** and restrict the `github-pages` environment to `main`. Environment approval rules still apply.
- Set `RELEASE_PLEASE_TOKEN` to a repository-scoped PAT or GitHub App token with **Contents**, **Pull requests**, and **Issues** read/write permissions. This lets bot PR updates trigger CI. Renew it before expiry; never commit it.

Publication uses `GITHUB_TOKEN` with `contents: write`, `pull-requests: write`, and `issues: write` in both the CI caller and reusable publication workflow. No additional publication secret is needed. Releases created with this token do not trigger workflows listening for `release` events.

## Release notes and preview

The first **Summary** bullet, including continuation lines, supplies the release description. Keep it accurate. Use inline code for commands, paths, identifiers, flags, and literal values; use plain text for UI labels.

Notes preserve Markdown and link the source PR and explicit closing references. Missing summaries fall back to generated descriptions; distinct entries from one commit keep their specific descriptions. Breaking changes have their own section; `docs:` appears under **Documentation**.

CI previews notes from the local changelog. To include PR summaries, set `GH_TOKEN` and run this read-only preview:

```bash
node .github/scripts/preview-release-notes.mjs --with-pull-requests
```

## Automation

CI gates publication on validation and Pages deployment. The publisher checks version files and the matching merged release PR, creates a tag at the validated SHA, verifies a draft release, publishes it, and reconciles `autorelease` labels. Retries also handle already-published releases.

Main pipelines queue without canceling pending releases. The Pages guard prevents older runs from replacing a newer deployment. Release Please and publication share a serialization group. To refresh the next draft release PR manually, run **Actions → Release Please** on `main`.

## Recovery

Start with **Actions → CI → the affected main run → Re-run failed jobs**. Deployment and publication are reusable workflows within that run. Retry failures before merging more work when possible.

- Tags must match the validated SHA; automation never moves or deletes them.
- Retries finish missing releases or incomplete drafts and repair state labels. Published notes are preserved, and older releases do not replace a newer **Latest** release.
- An older run can publish if its exact SHA previously deployed. If it never deployed and a newer deployment exists, investigate the skipped release; do not remove the newer deployment or move tags.
- API failures report status, GitHub message when available, and request ID. Check permissions or token expiry, or retry transient failures. Writes are not automatically retried.

If a workflow fix was merged after the failed run, its rerun still uses the original permissions. Instead:

1. Open **Actions → Recover Release → Run workflow** and select `main`.
2. Enter the original CI run ID from its URL.
3. Recovery verifies successful `verify` and `pages / deploy` jobs for the original SHA across that run's attempts, reads its version metadata, completes publication or repairs labels, and refreshes the next release PR.

Recovery uses current code and permissions. It never redeploys Pages or changes existing tags or published notes. It rejects runs from another branch, unvalidated or undeployed commits, and commits that are not merged release PRs.

After workflow changes, verify permissions, environment rules, and publication behavior in the first main run. Local checks do not publish a test release.
