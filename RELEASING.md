# Releasing Plan Measure

Plan Measure releases are currently prepared and published manually.

## Release process

1. Finish the features and fixes planned for the release.
2. Run a release-focused audit or hardening pass when appropriate.
3. Confirm the working tree is clean before preparing the release changes.
4. Update `CHANGELOG.md`: replace `Unreleased` for the release entry with the release date, and ensure the entry contains only relevant user-facing changes.
5. Update the version in `package.json` and `package-lock.json` together.
6. Use Node.js 24.
7. Perform a clean dependency installation:

   ```bash
   npm ci
   ```

8. Run the release validation commands:

   ```bash
   npm test
   npm run lint
   npm run build
   git diff --check
   ```

9. Review the complete release diff and confirm it contains only intended release changes.
10. Merge the release pull request into `main`.
11. Wait for CI on `main` to complete successfully.
12. Confirm the GitHub Pages deployment for that `main` commit succeeds and verify the deployed application.
13. Create tag `vX.Y.Z` only after the final merge. The tag must point to the exact `main` commit that contains the release.
14. Create the GitHub Release for that tag.
15. Verify the published application again after the release is complete.

Do not create the release tag before the final merge. GitHub Pages deploys from `main` after successful CI; creating or pushing a tag does not deploy the application.

## GitHub release notes

Release notes should summarize changes that matter to users. Base them on the corresponding `CHANGELOG.md` entry and the pull requests or issues included in the release, and omit internal implementation details that do not affect users.

## Versioning

- **PATCH**: bug fixes without new user-facing capability.
- **MINOR**: backwards-compatible features or improvements.
- **MAJOR**: breaking changes that require migration or introduce incompatible behavior.
