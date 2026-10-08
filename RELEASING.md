# Releasing

Release Please manages versions in `package.json`, `package-lock.json`, and `.release-please-manifest.json`, plus `CHANGELOG.md`. Do not edit these manually to prepare a release.

## Publish a release

1. Review the draft release PR, version, and changelog.
2. Mark it **Ready for review**, wait for required checks, and squash merge into `main`.
3. CI validates the commit, deploys to GitHub Pages, then publishes its tag and GitHub Release.
4. Release Please creates or updates the next draft release PR.

Ordinary changes to `main` also deploy to Pages. Pushing a tag does not deploy the app. Do not create release tags or edit `autorelease` labels manually.

## Versions and notes

| Change                                              | Version |
| --------------------------------------------------- | ------- |
| Compatible fixes or documentation (`fix:`, `docs:`) | Patch   |
| Compatible features (`feat:`)                       | Minor   |
| Breaking changes (`!`)                              | Major   |

Use Conventional Commit PR titles and the first **Summary** bullet for release notes; see [Contributing](CONTRIBUTING.md). Maintenance types are hidden from notes; `ci:` alone does not create a release.

## Failed releases

Open **Actions → CI → the affected main run → Re-run failed jobs**. Resolve the reported failure before retrying; do not move tags or modify generated files to bypass checks.

For permissions, note previews, and recovery after a workflow fix, see [Release operations](.github/RELEASING.md).
