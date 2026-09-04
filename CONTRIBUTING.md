# Contributing to Plan Measure

Thanks for helping improve Plan Measure.

## Before opening an issue

- Search the open issues first so related work stays together.
- Use the bug report template for reproducible problems.
- Use the feature request template for one focused improvement.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Keep each issue focused on one problem or proposal.

## Local development

Plan Measure requires Node.js 24 LTS and npm.

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Before opening a pull request, run the checks that apply to your change:

```bash
npm run lint
npm run test
npm run build
```

Use `npm run format` when formatting is part of the change. Keep generated or unrelated changes out of the pull request.

## Pull requests

- Keep the change small and focused.
- Link the relevant issue. Use `Closes #123` when the pull request fully resolves it.
- Describe the user-visible behavior and how you validated it.
- Include screenshots or a short recording when they clarify a UI change.
- Update the README or other documentation when behavior or setup changes.
- Do not commit PDFs, credentials, secrets, or other private files.

All contributions are reviewed through GitHub pull requests. Please be clear about any known limitations or follow-up work.
