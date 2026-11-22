# Contributing

## Issues

Search existing issues, then use the bug or feature request template. Keep each issue focused and provide reproduction steps for bugs. Report vulnerabilities through the [security policy](SECURITY.md); never attach private plans or credentials.

### How issues are classified

Issues are described by labels on three independent axes, and by nothing else:

| Axis     | Labels                                                                                       | Rule         |
| -------- | -------------------------------------------------------------------------------------------- | ------------ |
| Type     | `bug`, `enhancement`, `documentation`, `test`                                                | exactly one  |
| Area     | `area: viewer`, `drawing`, `measurements`, `classifications`, `ui`, `projects`, `ci`, `docs` | at least one |
| Priority | `priority: P0` to `P3`                                                                       | once planned |

There are no parent issues or epics: a parent can only express one axis, so it ends up contradicting the labels. The one exception is [#487 Test coverage](https://github.com/userfypp/plan-measure/issues/487), a finite checklist of test work. To see a slice, filter on the labels, for example [open bugs in the viewer](https://github.com/userfypp/plan-measure/issues?q=is%3Aissue+is%3Aopen+label%3Abug+label%3A%22area%3A+viewer%22). An issue that spans two areas carries both. The areas follow the code: `viewer` pan, zoom, input, Pages, Find similar and Compare; `drawing` tools, markups and snapping; `measurements` values, units, Takeoff and exports; `classifications` classifications and prices; `ui` design contract, accessibility, dialogs, shortcuts, layout and translations; `projects` project files, autosave, tabs, updates and offline; `ci` workflows and release tooling; `docs` documentation.

### Where to start

- [`good first issue`](https://github.com/userfypp/plan-measure/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22): small and self-contained. Start here.
- [`help wanted`](https://github.com/userfypp/plan-measure/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22): well specified; most are test-coverage checklists in [Test coverage](https://github.com/userfypp/plan-measure/issues/487). Pick one item per pull request and prefer `priority: P1` and `P2`.
- Anything else: comment before you start, because the answer is not settled yet.

Comment on the issue you pick and wait for the assignment. Issues listed as assigned in the [roadmap](docs/ROADMAP.md) are taken.

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

More checks, when they apply:

- Changed `.github/scripts`? Run `node --test .github/scripts/*.test-node.mjs`.
- Changed dependencies, startup or the viewer? Run `npm run build && npm run perf:size:diff -- --base origin/main`, the same check as the required `size` check in CI. It fails when the gzip size of startup or of opening a plan grows more than the allowance or exceeds a ceiling, and says what to do.
- Changed startup, loading or the app shell? Run `npm run build && npm run test:smoke`, which opens the start screen and the sample project in Chromium and fails on any page error. It needs `npm ci --prefix perf` and `./perf/node_modules/.bin/playwright install chromium webkit` once.
- Changed focus, dialogs, popovers or anything that affects Tab? Run `npm run build && npm run test:keyboard`, which compares the Tab sequence in Chromium and WebKit (Safari's engine).
- Changed the service worker, the manifest or caching? Run `npm run build && npm run test:pwa`, which loads the build, goes offline and reloads. See [Architecture](docs/ARCHITECTURE.md#build-output) and [Install the app and use it offline](docs/user-guide.md#install-the-app-and-use-it-offline).
- Added a setting or a shortcut? Add the Settings row or the action (default, catalog entry, handler) as described in [Architecture](docs/ARCHITECTURE.md#where-to-change-what), make tooltips read the live key, and document it in the [user guide](docs/user-guide.md).

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
- Keep the JavaScript size budget: a pull request may grow the startup and plan-open JavaScript only by a small allowance, and more growth or a higher ceiling needs the maintainer's `size: approved` label after review. Never add that label yourself. See [JavaScript size](docs/PERFORMANCE.md#2-javascript-size).

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
