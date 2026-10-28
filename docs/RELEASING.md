# Releasing

Release Please manages versions in `package.json`, `package-lock.json`, and `.release-please-manifest.json`, plus `CHANGELOG.md`. Do not edit these manually to prepare a release. Contribution rules are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Publish a release

1. Review the draft release PR, version, and changelog.
2. Mark it **Ready for review**, wait for required checks, and squash merge into `main`.
3. CI validates the commit, deploys to GitHub Pages, then publishes its tag and GitHub Release.
4. Release Please creates or updates the next draft release PR.

Ordinary changes to `main` also deploy to Pages. Pushing a tag does not deploy the app. Do not create release tags or edit `autorelease` labels manually, except for the cases under [Errors that need a person](#errors-that-need-a-person).

## Versions and notes

| Change                                              | Version |
| --------------------------------------------------- | ------- |
| Compatible fixes or documentation (`fix:`, `docs:`) | Patch   |
| Compatible features (`feat:`)                       | Minor   |
| Breaking changes (`!`)                              | Major   |

To choose the bump yourself, open **Actions → Release Please → Run workflow** on `main` and pick **patch**, **minor**, or **major**. The draft release PR is rebuilt with that version, and its `release: <bump>` label keeps the choice on later updates until the release ships. Pick **auto** to return to the table above; the default, **keep**, leaves the current choice. If no release PR exists yet (no releasable commits), nothing is saved and the run warns. Conflicting labels stop the run.

Use Conventional Commit PR titles. Maintenance types are hidden from notes, and `ci:` alone does not create a release.

The first **Summary** bullet of the PR, including continuation lines, is the release description, so keep it accurate. Use inline code for commands, paths, identifiers, flags, and literal values; use plain text for UI labels. Notes preserve Markdown and link the source PR and explicit closing references. Missing summaries fall back to generated descriptions, and distinct entries from one commit keep their specific descriptions. Breaking changes have their own section; `docs:` appears under **Documentation**.

CI previews notes from the local changelog. To include PR summaries, set `GH_TOKEN` and run this read-only preview:

```bash
node .github/scripts/preview-release-notes.mjs --with-pull-requests
```

## Failed releases and recovery

Start with **Actions → CI → the affected main run → Re-run failed jobs**. Deployment and publication are reusable workflows within that run. Resolve the reported failure before retrying, and retry before merging more work when possible. Do not move tags or modify generated files to bypass checks.

- Tags must match the validated SHA; automation never moves or deletes them.
- Retries finish missing releases or incomplete drafts and repair state labels. Published notes are preserved, and older releases do not replace a newer **Latest** release.
- An older run can publish if its exact SHA previously deployed. If it never deployed and a newer deployment exists, automation cannot publish it; follow [Publish by hand](#publish-by-hand). Do not remove the newer deployment or move tags.
- A publish run that finds a commit titled like a release (`chore(main): release X.Y.Z (#N)`) but no matching merged release PR fails on purpose instead of finishing green with nothing published. Re-run it once, since GitHub can lag in linking the commit to its PR; if it persists, check that the PR's branch is `release-please--branches--main--components--plan-measure`.
- API failures report status, GitHub message when available, and request ID. Check permissions or token expiry, or retry transient failures. Writes are not automatically retried.

If a workflow fix was merged after the failed run, its rerun still uses the original permissions. Instead:

1. Open **Actions → Recover Release → Run workflow** and select `main`.
2. Enter the original CI run ID from its URL.
3. Recovery verifies successful `verify` and `pages / deploy` jobs for the original SHA across that run's attempts, reads its version metadata, completes publication or repairs labels, and refreshes the next release PR.

Recovery uses current code and permissions. It never redeploys Pages or changes existing tags or published notes. It rejects runs from another branch, unvalidated or undeployed commits, and commits that are not merged release PRs.

### Errors that need a person

These stop the publisher before it writes anything. Fix the cause, then **Re-run failed jobs**.

| Error                                                       | Cause                                                           | Fix                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Release PR has no pending or tagged state label             | The `autorelease` label was removed from the merged PR          | Add `autorelease: pending` to the merged release PR                                    |
| Multiple releases use the expected tag                      | A duplicate draft exists                                        | Delete the extra draft on the Releases page; keep a published one                      |
| Existing draft does not belong to this exact stable release | An old draft has the tag but another commit or is a pre-release | Delete that draft                                                                      |
| PR is tagged but its published release is missing           | The release was deleted after publication                       | Swap the PR label to `autorelease: pending`; the tag at the release commit is reused   |
| A published release exists without its tag                  | The tag was deleted                                             | Create tag `vX.Y.Z` at the release commit SHA (creation is allowed by the tag ruleset) |
| Tag does not point to the validated commit                  | The tag points elsewhere                                        | Do not move it. Compare the SHAs and decide with the maintainer before changing it     |

### Publish by hand

Only when automation cannot, for example because the release commit never deployed and later work has. The release commit's code is already live through the newer deployment, so no redeploy is needed.

1. Create tag `vX.Y.Z` at the release commit, from its page on GitHub.
2. Create the GitHub Release from that tag, titled `Plan Measure vX.Y.Z`, with the changelog section as notes. Set it as **Latest** only if it is the newest version.
3. On the merged release PR, replace `autorelease: pending` with `autorelease: tagged`, so the next Release Please run opens the following release PR.

## Repository configuration

- Allow only **Squash merging**. In **Settings → General → Pull Requests**, select **Pull request title and description** for the squash message (`PR_TITLE` / `PR_BODY`). Check the final title before merging.
- Protect `main` with a ruleset: squash merging only, linear history, up-to-date branches, resolved review threads, the `verify`, `dependency-review` and `size` checks, and CodeQL results. Add the repository admin role to its bypass list for pull requests only, as an emergency exit when a required check cannot run. Deployment and publication run on `main`, not PRs.
- Protect release tags with a tag ruleset on `v*` that blocks deleting, moving and force-pushing, and leave creation open so the release workflows can tag.
- Run CodeQL with the advanced setup in `.github/workflows/codeql.yml`. The default setup does not analyze pull requests from forks, which left every external pull request blocked by the code scanning rule.
- In **Settings → Actions → General**, allow only GitHub-created actions plus the ones listed in the workflows, require actions to be pinned to a full commit SHA, keep the workflow token read-only by default, and require approval for first-time contributors' pull requests.
- Set Pages to **GitHub Actions** and restrict the `github-pages` environment to `main`. Environment approval rules still apply.
- Set `RELEASE_PLEASE_TOKEN` to a repository-scoped PAT or GitHub App token with **Contents**, **Pull requests**, and **Issues** read/write permissions. This lets bot PR updates trigger CI. Renew it before expiry; never commit it.

Publication uses `GITHUB_TOKEN` with `contents: write`, `pull-requests: write`, and `issues: write` in both the CI caller and reusable publication workflow. No additional publication secret is needed. Releases created with this token do not trigger workflows listening for `release` events.

After workflow changes, verify permissions, environment rules, and publication behavior in the first main run. Local checks do not publish a test release.

## Automation

CI gates publication on validation and Pages deployment. The publisher checks version files and the matching merged release PR, creates a tag at the validated SHA, verifies a draft release, publishes it, and reconciles `autorelease` labels. Retries also handle already-published releases.

Main pipelines queue without canceling pending releases. The Pages guard prevents older runs from replacing a newer deployment. Release Please and publication share a serialization group.

The Release Please workflow's **version** input resolves the next version from the `main` manifest. A chosen bump runs the Release Please CLI with `--release-as`, because the action ignores `release-as` in manifest mode. The CLI is pinned in `.github/release-please-cli` (version `17.6.0`, the one the action bundles) and installed from its lockfile without lifecycle scripts, in a step that has no token. Dependabot proposes updates to it (never auto-merged). To change its version by hand, edit that `package.json`, run `npm install --package-lock-only --ignore-scripts` in that folder, and keep it in step with the action. The choice is stored as a `release: patch|minor|major` label on the open release PR, and CI runs reuse it.

Changes to workflows run **Workflow Lint** (actionlint and zizmor, installed with pinned hashes from `.github/workflow-lint`). It is not a required check because it only runs when those paths change. Locally: `python -m pip install --require-hashes --no-deps -r .github/workflow-lint/requirements.txt`, then `zizmor --offline --min-severity medium .github/workflows`. `.github/zizmor.yml` lists the one accepted finding, with its reason.
