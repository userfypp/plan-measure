# Releasing Plan Measure

Release Please prepares release pull requests. CI publishes a release only after its commit passes validation and deploys to GitHub Pages.

## Pull requests

Use a Conventional Commit title, such as `feat:`, `fix:`, `perf:`, or `docs:`. Add `!` for a breaking change. The repository uses squash merge, so Release Please reads the PR title from the resulting commit on `main`.

Write the first **Summary** bullet as a concrete description of the change and its effect. It becomes the release-note description. Include checks under **Validation** and issue references under **Related Issue**.

Release Please manages versions in `package.json`, `package-lock.json`, and `.release-please-manifest.json`, along with `CHANGELOG.md`. Do not edit them by hand to prepare a release.

## Publishing

1. Review the draft release PR and its version and changelog changes.
2. Mark it **Ready for review**, wait for required checks, and squash merge it into `main`.
3. CI validates the merged commit, deploys it to Pages, and publishes its tag and GitHub Release.
4. Release Please creates or updates the next draft release PR.

Do not create release tags or edit `autorelease` labels manually. Pages deploys from `main`; pushing a tag does not deploy the app.

## Versioning

- **PATCH**: compatible bug fixes and documentation updates.
- **MINOR**: compatible new features.
- **MAJOR**: breaking changes.

## Recovery and configuration

For a failed release, open **Actions → CI → the affected main run → Re-run failed jobs**. Resolve the reported failure before retrying; do not edit generated files or move tags to bypass it.

See [release operations](.github/RELEASING.md) for repository settings, token permissions, release-note previews, and recovery details. Local validation commands are in [CONTRIBUTING.md](CONTRIBUTING.md).
