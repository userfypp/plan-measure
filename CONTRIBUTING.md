# Contributing

## Issues

Search existing issues, then use the bug or feature request template. Keep each issue focused and provide reproduction steps for bugs. Report vulnerabilities through the [security policy](SECURITY.md); never attach private plans or credentials.

## Development

Requires Node.js 24 and npm:

```bash
npm ci
npm run dev
```

Before opening a pull request:

```bash
npm run lint
npm test
npm run build
git diff --check
```

Use `npm run format` only when formatting is part of the change.

## Pull requests

- Keep changes focused; exclude generated or unrelated edits.
- Use a Conventional Commit title, such as `feat:`, `fix:`, or `docs:`; add `!` for a breaking change. The squash commit title drives releases.
- Follow the PR template. Describe the change and its effect in the first **Summary** bullet; it supplies the release-note description.
- Record validation and known limitations. Include screenshots when useful.
- Link the relevant issue with `Closes #123` when fully resolved.
- Update the relevant documentation when behavior or setup changes.

See [Releasing](RELEASING.md) for publication and [Code of conduct](CODE_OF_CONDUCT.md) for community expectations.
