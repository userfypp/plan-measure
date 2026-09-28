# Releases

Release Please owns `package.json`, `package-lock.json`, the version manifest and
`CHANGELOG.md`. Do not edit their release versions or generated changelog by hand.

## Repository settings

- Keep **Squash merging** as the only merge method. Under **Settings → General →
  Pull Requests**, set the default squash message to **Pull request title and
  description** (`squash_merge_commit_title=PR_TITLE`,
  `squash_merge_commit_message=PR_BODY`). Check the final title before merging.
- Keep `verify` and `dependency-review` required on `main`, require the branch to
  be up to date, and retain the existing pull-request and CodeQL protections.
  Deployment and publication jobs only run after a push to `main`; do not add them
  as required PR checks.
- Keep Pages configured with **GitHub Actions** and the `github-pages` environment
  restricted to `main`. Any environment approval requirement will still pause the
  deployment until a reviewer approves it.
- Keep `RELEASE_PLEASE_TOKEN` available to the Release Please workflow. Use a
  repository-scoped token with **Contents**, **Pull requests**, and **Issues**
  read/write access, and renew it before expiry. A PAT or GitHub App token lets the
  bot's PR updates trigger CI. Publication uses the workflow's `GITHUB_TOKEN` with
  explicit job permissions; no new secret or broader default token permission is
  needed. Releases created with that token do not trigger additional workflows
  listening for `release` events; add such downstream work explicitly if needed.

## Pull requests and release notes

Use a Conventional Commit title (`feat:`, `fix:`, `perf:`, `revert:`, `docs:`,
`refactor:`, `chore:`, `ci:`, `test:`, `build:`, or `style:`), with an optional scope
and `!` for a breaking change. CI validates the title, including after edits.
Only the squash commit needs to describe the final change; intermediate commits
may describe the steps taken to implement it.

Keep the existing **Summary**, **Validation**, and **Related Issue** structure.
Write the first Summary bullet as a complete, concrete description of the change
and its user-visible effect. For example:

```markdown
## Summary

- Add annotated PDF export that preserves the original pages and overlays visible measurements and labels.
- Explain any additional implementation detail here.

## Validation

- Tests and checks performed.

## Related Issue

- Closes #113
```

The first Summary bullet (including wrapped continuation lines) enriches the
release entry automatically. When a commit produces multiple distinct changelog
entries, their specific descriptions are retained. Other bullets and validation commands are not copied
into release notes. Avoid placeholders or a first bullet that merely says “Fix the
bug”. Without a usable Summary, the generated changelog description is retained;
the automation does not invent missing context. Keep the Summary accurate when
updating a PR. No separate release-note field or manual release editing is needed.

Notes normalize initial capitalization and terminal punctuation, retain Markdown,
link the source PR and explicit `Closes` / `Fixes` / `Resolves` issue references,
and retain a commit link if no PR/issue reference is available. Source PRs must
match the actual squash commit; a mentioned issue is never assumed to be a PR.
Breaking-change explanations are preserved in their own section. Existing hidden
changelog types remain hidden; `ci:` alone does not create a new product release.

A preview using only the local changelog is included in the CI job summary. To
preview the enriched notes locally, with a GitHub token available as `GH_TOKEN`:

```bash
node .github/scripts/preview-release-notes.mjs --with-pull-requests
```

This command performs only reads. It does not modify the changelog or any release.

## Publishing

1. Merge ordinary PRs using squash. After the main pipeline succeeds, Release
   Please creates or updates its draft release PR. Keep its generated version, branch name and state labels intact.
2. When ready to ship, mark the release PR ready, wait for required checks, then
   squash-merge it. Do not create tags or releases manually.
3. The `CI` run for that exact main commit runs `verify`, then the reusable Pages
   workflow, then the reusable publication workflow. A failed check or deployment
   blocks publication. Pages continues to deploy ordinary main commits too.
4. Publication validates all version files, creates a tag at the tested SHA,
   prepares and verifies a draft with complete notes, then publishes it. Only
   afterward does it reconcile `autorelease: tagged` and `autorelease: pending`.
5. Release Please refreshes the next release PR after publication. This also
   picks up changes merged while an earlier release was pending. It can be
   refreshed manually with the **Release Please** workflow on `main`.

Main pipelines queue without canceling a pending release when more PRs merge.
GitHub's [`queue: max`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) has a platform limit of 100 pending runs and orders them by
when they enter the queue. The Pages guard prevents an old rerun or out-of-order
run from rolling back a newer successful deployment. Release Please and release
publication also share a serialization group so they cannot observe a half-updated
label transition.

## Recovery

Use **Actions → CI → the affected main run → Re-run failed jobs**. The reusable
workflows are part of this run; they are not separate manually dispatched flows.
Prefer retrying a failure before merging additional work.

- Existing tags must point to the exact validated SHA. A mismatch stops the run;
  the automation never moves or deletes a tag.
- A tag without a release or a partially prepared draft is completed on retry.
- A published release is verified and missing state labels are repaired. Its
  notes are preserved even if someone later edits a source PR.
- Retrying an older published version does not replace a newer **Latest** release.
- An old run whose exact SHA previously deployed can finish publication without
  redeploying over newer Pages content. If a newer SHA is already deployed and
  the old SHA never deployed successfully, the run fails safely. Do not delete a
  newer deployment or move a tag to bypass it; investigate that skipped release
  before deciding how to recover it.
- API failures are failures, not “release does not exist”. Correct permissions,
  renew an expired token, or retry a transient failure as appropriate.

Before merging the workflow migration, let any in-flight executions of the old
standalone deployment/publication workflows finish.

The local test suite simulates API state transitions and failures. The first
post-merge run still needs to confirm real GitHub permissions, environment rules
and publication behavior. Local checks do not create a test release in GitHub.
