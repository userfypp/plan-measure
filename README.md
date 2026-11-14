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
  <p><a href="https://userfypp.github.io/plan-measure/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/button-open-dark.svg"><img src="assets/readme/button-open-light.svg" alt="Open the app" height="32"></picture></a><a href="https://userfypp.github.io/plan-measure/?sample=1"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/button-sample-dark.svg"><img src="assets/readme/button-sample-light.svg" alt="Try the sample project" height="32"></picture></a></p>
</div>

![Plan Measure with a ground floor plan open: rooms measured as polygons, rectangles and an ellipse, doors and windows counted, and every measurement listed with its perimeter and area](assets/screenshots/plan-measure-overview.webp)

Drop in a PDF, set the scale once, and measure lengths, perimeters, areas and counts directly on the drawing. Totals add up across every page and leave as the spreadsheet or annotated PDF you already work with.

There is no account, no upload and no subscription. Plans never leave your device, projects save themselves, and once installed the app keeps working offline. It is free and MIT licensed.

<h3 id="what-you-can-do"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/section-features-dark.svg"><img src="assets/readme/section-features-light.svg" alt="What you can do" height="32"></picture></h3>

<p>
  <picture>
    <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="assets/readme/features-narrow-dark.svg">
    <source media="(max-width: 600px)" srcset="assets/readme/features-narrow-light.svg">
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/features-wide-dark.svg">
    <img src="assets/readme/features-wide-light.svg" alt="Calibrate each page from a known distance, a ratio, or separate X and Y scales. Draw lines, polylines, polygons, rectangles, ellipses and clouds, with snapping. Count symbols one by one, or box one and let Find similar locate the rest. Organize the work with classifications, groups, notes and reusable templates. See the totals of every page in Takeoff, with optional prices. Compare revisions by overlaying a second PDF to see what was added or removed. Rebind any shortcut and tune how drawing behaves. Export CSV, XLSX, ODS, JSON, annotated PDFs and project backups.">
  </picture>
</p>

<h3 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/section-start-dark.svg"><img src="assets/readme/section-start-light.svg" alt="Your first measurement" height="32"></picture></h3>

<p>
  <picture>
    <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="assets/readme/steps-narrow-dark.svg">
    <source media="(max-width: 600px)" srcset="assets/readme/steps-narrow-light.svg">
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/steps-wide-dark.svg">
    <img src="assets/readme/steps-wide-light.svg" alt="1. Open a plan: drop a PDF on the workspace, or start from the sample. 2. Set the scale: in Scales, choose Add scale, mark a known distance and type its length. 3. Measure: pick a drawing tool, click to place points and press Enter to finish. 4. Take the numbers: open Takeoff for totals, or Export to take them with you.">
  </picture>
</p>

The [user guide](docs/user-guide.md) covers scales, editing, settings, keyboard controls, exports, recovery and [offline use](docs/user-guide.md#install-the-app-and-use-it-offline).

<h3 id="good-to-know"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/section-notes-dark.svg"><img src="assets/readme/section-notes-light.svg" alt="Good to know" height="32"></picture></h3>

- Projects live only in this browser, and clearing site data removes them. Keep a `.planmeasure` backup with the PDF and editable data from Export backup or Projects → Export; JSON and spreadsheet exports are not backups.
- PDFs can be up to 100 MiB (104.9 MB). Password-protected files cannot be opened.
- Drawing needs at least 480 × 360 px of viewer space and a mouse, trackpad or pen, unless keyboard authoring is on in Settings.
- X/Y calibration corrects differing axis scales, not skew or perspective.
- Offline use needs one online visit first and is not available in private windows.

Missing something? [Open an issue](https://github.com/userfypp/plan-measure/issues/new/choose).

<h3 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/section-development-dark.svg"><img src="assets/readme/section-development-light.svg" alt="Development" height="32"></picture></h3>

[![CI](https://img.shields.io/github/actions/workflow/status/userfypp/plan-measure/ci.yml?label=CI)](https://github.com/userfypp/plan-measure/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/userfypp/plan-measure)](https://github.com/userfypp/plan-measure/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Requires Node.js 24 (pinned in `.nvmrc`):

```bash
npm ci
npm run dev
```

[Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Performance](docs/PERFORMANCE.md) · [Roadmap](docs/ROADMAP.md) · [Releasing](docs/RELEASING.md) · [JSON export contract](docs/export-json.md) · [Changelog](CHANGELOG.md) · [Credits](CREDITS.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)

<p align="center"><a href="https://userfypp.github.io/plan-measure/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/readme/footer-dark.svg"><img src="assets/readme/footer-light.svg" alt="Open Plan Measure" height="36"></picture></a></p>
