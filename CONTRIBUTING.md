# Contributing

## Issues

Search existing issues, then use the bug or feature request template. Keep each issue focused and provide reproduction steps for bugs. Report vulnerabilities through the [security policy](SECURITY.md); never attach private plans or credentials.

## Development

Requires Node.js 24, pinned in `.nvmrc` (`nvm use` picks it up), and npm:

```bash
npm ci
npm run dev
```

Before opening a pull request:

```bash
npm run lint
npm run format:check
npm test
npm run build
git diff --check
```

CI fails on unformatted files; `npm run format` fixes them.

Two more checks, when they apply:

- Changed `.github/scripts`? Run `node --test .github/scripts/*.test-node.mjs`.
- Changed dependencies, startup or the viewer? Run `npm run build && npm run perf:size`. The required `size` check fails when a size budget is exceeded.

`npm run test:coverage` runs the tests with coverage and writes an HTML report to `coverage/`. CI shows the totals in the job summary; there is no threshold.

## Pull requests

- Keep changes focused; exclude generated or unrelated edits.
- Use a Conventional Commit title, such as `feat:`, `fix:`, or `docs:`; add `!` for a breaking change. The squash commit title drives releases.
- The first pull request from a new contributor needs a maintainer to approve the checks before they run. This is a GitHub safety rule, not a judgement on your change.
- Follow the PR template. Describe the change and its effect in the first **Summary** bullet; it supplies the release-note description.
- Record validation and known limitations. Include screenshots when useful.
- Link the relevant issue with `Closes #123` when fully resolved.
- Update the relevant documentation when behavior or setup changes.
- Changes to startup, the viewer, the canvas or the panels follow [Adding features without losing performance](docs/PERFORMANCE.md#adding-features-without-losing-performance). A failing test in `src/performance/` is a regression to fix, not an expectation to update.
- Keep the JavaScript size budget: a pull request may grow each size metric only by a small allowance, and more growth or a higher ceiling needs the maintainer's `size: approved` label after review. Never add that label yourself. See [JavaScript size](docs/PERFORMANCE.md#2-javascript-size).

## Credits

Being listed in [CREDITS.md](CREDITS.md) is optional.

- Add one row in your first mergeable pull request, or in a separate pull request titled `chore: add credits for @handle` (`chore` creates no release; `docs` does).
- Row format: `| [@handle](https://github.com/handle) | Short contribution, up to about 80 characters | Optional link |`.
- Keep rows sorted by handle, after the maintainer.
- The link is optional: one `https://` URL to a personal site, GitHub or a social profile. No advertising or affiliate links.
- Use only information that is already public; never an email address.
- If you contributed without code (bug reports, reviews, ideas, translations), ask in the issue and a maintainer will add you with your consent.
- Maintainers may reword or remove entries that break these rules or the [Code of conduct](CODE_OF_CONDUCT.md).

## AI-assisted contributions

AI-assisted pull requests are welcome under the same rules as any other: you are responsible for the change. Understand and test what you submit and keep it focused. Reviews judge the result (tests, scope, clarity), not the tool; unreviewed bulk output will be closed.

## Becoming a maintainer

- Expect a first response to issues and pull requests within about a day.
- Contributors with several good merged pull requests may be offered triage permissions (labels, issue management), and later review rights.
- See the [roadmap](docs/ROADMAP.md) for direction. Start with issues labeled `good first issue` or `help wanted`. For orientation, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

See [Releasing](docs/RELEASING.md) for publication and [Code of conduct](CODE_OF_CONDUCT.md) for community expectations.
