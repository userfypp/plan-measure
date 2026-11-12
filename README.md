<div align="center">
  <p>
    <a href="https://userfypp.github.io/plan-measure/">
      <picture>
        <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="assets/readme/hero-narrow-dark.svg">
        <source media="(max-width: 600px)" srcset="assets/readme/hero-narrow-light.svg">
        <source media="(prefers-color-scheme: dark)" srcset="assets/readme/hero-wide-dark.svg">
        <img src="assets/readme/hero-wide-light.svg" alt="Plan Measure: quantity takeoffs from PDF plans, right in your browser.">
      </picture>
    </a>
  </p>
  <p><a href="https://userfypp.github.io/plan-measure/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/button-open-dark.svg"><img src="assets/readme/button-open-light.svg" alt="Open the app"></picture></a><a href="https://userfypp.github.io/plan-measure/?sample=1"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/button-sample-dark.svg"><img src="assets/readme/button-sample-light.svg" alt="Try the sample project"></picture></a></p>
</div>

![Plan Measure with a ground floor plan open: rooms measured as polygons, rectangles and an ellipse, doors and windows counted, and every measurement listed with its perimeter and area](assets/screenshots/plan-measure-overview.webp)

Drop in a PDF, set the scale once, and measure lengths, perimeters, areas and counts directly on the drawing. Totals add up across every page and leave as the spreadsheet or annotated PDF you already work with.

There is no account, no upload and no subscription. Plans never leave your device, projects save themselves, and once installed the app keeps working offline. It is free and MIT licensed.

## What you can do

- Calibrate each page from a known distance, a ratio, or separate X and Y scales.
- Draw lines, polylines, polygons, rectangles, ellipses and revision clouds, with snapping, ortho and undo.
- Count symbols one by one, or box one and let Find similar locate the rest.
- Organize work with classifications, groups, notes and reusable templates.
- Review totals across pages in Takeoff, with optional prices.
- Compare two revisions of the same plan.
- Rebind any shortcut and tune how drawing behaves.
- Export CSV, XLSX, ODS, JSON, annotated PDFs or editable project backups.

## Your first measurement

1. Open a PDF or drop it on the workspace, or start from the sample.
2. In Scales, choose Add scale, mark a known distance and type its real length.
3. Pick a drawing tool, click to place points and press `Enter` to finish.
4. Open Takeoff for totals, or Export to take them with you.

The [user guide](docs/user-guide.md) covers scales, editing, settings, keyboard controls, exports, recovery and [offline use](docs/user-guide.md#install-the-app-and-use-it-offline).

## Good to know

- Projects live only in this browser, and clearing site data removes them. Keep a `.planmeasure` backup with the PDF and editable data from Export backup or Projects → Export; JSON and spreadsheet exports are not backups.
- PDFs can be up to 100 MiB (104.9 MB). Password-protected files cannot be opened.
- Drawing needs at least 480 × 360 px of viewer space and a mouse, trackpad or pen, unless keyboard authoring is on in Settings.
- X/Y calibration corrects differing axis scales, not skew or perspective.
- Offline use needs one online visit first and is not available in private windows.

Missing something? [Open an issue](https://github.com/userfypp/plan-measure/issues/new/choose).

## Development

[![CI](https://img.shields.io/github/actions/workflow/status/userfypp/plan-measure/ci.yml?label=CI)](https://github.com/userfypp/plan-measure/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/userfypp/plan-measure)](https://github.com/userfypp/plan-measure/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Requires Node.js 24 (pinned in `.nvmrc`):

```bash
npm ci
npm run dev
```

[Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Performance](docs/PERFORMANCE.md) · [Roadmap](docs/ROADMAP.md) · [Releasing](docs/RELEASING.md) · [JSON export contract](docs/export-json.md) · [Changelog](CHANGELOG.md) · [Credits](CREDITS.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)
