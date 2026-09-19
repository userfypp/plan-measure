# Releasing Plan Measure

Plan Measure uses Release Please to prepare releases and publishes them only after the release commit has passed CI and deployed successfully to GitHub Pages.

## Development pull requests

Because the repository uses squash merge, development pull request titles must use Conventional Commits. The squashed commit on `main` is what Release Please analyzes. Typical prefixes are `feat:`, `fix:`, `perf:`, `docs:`, `refactor:`, and `chore:`; use `feat!:` or `fix!:` for a breaking change.

After changes are merged or pushed to `main`, the `Release Please` workflow creates or updates a **draft Release PR**. During the normal release flow, maintainers must not manually change release versions or the generated changelog entry. Release Please updates:

- `package.json`
- `package-lock.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`

The workflow uses the repository secret `RELEASE_PLEASE_TOKEN` when creating or updating the Release PR so normal pull request workflows can run for those updates. The secret must be configured before this release automation is merged; its value must not be documented or committed.

## Publishing a release

1. Review the draft Release PR and its generated version and changelog changes.
2. Mark the Release PR **Ready for review** when the release should be published.
3. Wait for all required checks to pass, then squash merge the Release PR into `main`.
4. CI runs for the resulting `main` commit.
5. `Deploy to GitHub Pages` runs after successful CI and deploys that exact `main` SHA.
6. `Publish Release` verifies the successful Pages `deploy` job and confirms that the SHA came from the unique merged Release Please PR with `autorelease: pending`.
7. Release Please creates tag `vX.Y.Z` and the corresponding GitHub Release, then marks the Release PR as tagged.

GitHub Pages continues to deploy from `main`. Creating or pushing a release tag does not deploy the application.

Use Node.js 24 for local release validation when needed:

```bash
npm ci
npm test
npm run lint
npm run build
git diff --check
```

## Versioning

- **PATCH**: backwards-compatible bug fixes.
- **MINOR**: backwards-compatible features or improvements.
- **MAJOR**: breaking changes that require migration or introduce incompatible behavior.

## Recovery

If Release Please cannot update the Release PR, fix the workflow or token problem and rerun the failed automation rather than editing generated release files manually. If publication fails after the Release PR has been merged, first verify CI, the Pages deployment, the exact `main` SHA, and the `autorelease: pending` state, then rerun `Publish Release`. Only use a manual tag and GitHub Release as an exceptional recovery path after confirming the release version, changelog, and deployed SHA are all correct.
