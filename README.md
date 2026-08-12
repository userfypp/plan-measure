# Plan Measure

Plan Measure is a focused desktop web application for measuring real-world distances,
perimeters, and areas on architectural PDF plans. Open a PDF, calibrate each page from a known
distance, then draw and edit line or polygon measurements directly over the plan.

## Privacy

Plan Measure runs entirely in the browser. PDFs, calibrations, measurements, and preferences are
never uploaded and no analytics, telemetry, accounts, cloud services, or remote logging are used.
The active session is stored only in the browser's IndexedDB so it can be recovered after a reload.

## v1 features

- Live app: https://userfypp.github.io/plan-measure/
- PDF loading through a file picker or drag-and-drop, with a 100 MB limit.
- Multi-page PDF navigation with independent calibration and measurement numbering per page.
- Millimetre, centimetre, and metre calibration and display units.
- Straight-line length measurements and polygon perimeter/area measurements.
- Editable measurement names and draggable line endpoints or polygon vertices.
- Pan, pointer-centred zoom, keyboard zoom, and fit-to-screen controls.
- Independent visibility controls for labels, measurements, and calibration references.
- One recoverable, browser-local autosaved session with explicit Continue/Discard recovery.
- CSV export across every page using the current display unit.

## Requirements

- Node.js 24 LTS
- npm
- A recent desktop version of Chrome, Edge, Firefox, or Safari

## Installation and development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. All PDF processing remains local even during development.

Available commands:

```bash
npm run dev      # Start the local development server
npm run build    # Type-check and create a production build
npm run test     # Run the Vitest unit suite
npm run lint     # Run ESLint
npm run format   # Format the repository with Prettier
```

## Using Plan Measure

1. Choose **Open PDF** or drop a PDF into the empty workspace.
2. Select **Calibrate**, choose two points whose real distance is known, and enter that distance.
3. Select **Line** or **Polygon** and click on the plan. Close a polygon by clicking its first
   vertex. Press Escape to cancel unfinished work.
4. Use **Select** to choose a measurement and drag its vertex handles. Names can be edited in the
   left panel.
5. Choose **Export CSV** to export measurements from every page.

Line and Polygon are unavailable until the current page is calibrated. Recalibration preserves
page geometry and immediately recomputes all values on that page.

## Architecture

The application uses Vite 8, React 19.2, strict TypeScript, CSS Modules, PDF.js, Konva, and
react-konva. Important state is centralized in a reducer and Context. The source is grouped into
application state/shell, PDF and viewer behavior, calibration, measurements, persistence/export
services, domain types, and pure mathematical utilities.

### Coordinate and measurement model

For each PDF page, PDF.js creates one logical viewport at scale 1 using the page's intrinsic
rotation. Calibration points and measurement vertices are stored only in this stable, rotated,
top-left-origin page coordinate system.

The viewer owns a transient transform:

```text
screen = pan + page × zoom
page   = (screen − pan) ÷ zoom
```

The PDF canvas and Konva page group use that same transform. PDF.js renders its backing bitmap at
`zoom × devicePixelRatio`, while the canvas CSS size uses logical page size multiplied by zoom.
There is no additional CSS zoom transform, so zoom is applied exactly once. Device pixel ratio
changes backing resolution only and never changes stored points or measurement calculations.

Calibration distance is stored canonically in millimetres. Linear results multiply page distance
by the calibration ratio; polygon area uses the square of that ratio and the shoelace formula.
Values retain full internal precision and are rounded to two decimals only for display and CSV.

### Local persistence

The small [`idb`](https://www.npmjs.com/package/idb) wrapper is used to keep IndexedDB transactions
and error handling understandable. The PDF blob is stored separately from versioned session
metadata, so ordinary autosaves do not repeatedly rewrite the PDF. Only meaningful completed
changes are saved; pointer movement, drafts, zoom, and pan are never persisted.

Exactly one active local session is retained. Opening a replacement PDF requires confirmation and
atomically replaces that session. If browser storage is unavailable, Plan Measure keeps working in
memory and displays a warning that reload recovery is unavailable.

## Testing and CI

Vitest covers geometry, calibration, squared area scaling, units, CSV escaping and all-page export,
session serialization/IndexedDB round trips, reducer invariants, and page/screen transforms across
zoom, pan, rotation, fit-to-screen, and device pixel ratios. GitHub Actions installs from the
lockfile and runs lint, tests, and a production build on pushes to `main` and pull requests.

## Supported browsers

v1 officially supports recent desktop releases of Chrome, Edge, Firefox, and Safari. It is designed
for pointer, trackpad, and keyboard use. Dedicated mobile and tablet layouts are not provided.

## Known v1 limitations

- Desktop focused; no dedicated mobile or tablet support.
- Password-protected PDFs are not supported and there is no password-entry flow.
- Physical units are limited to mm, cm, and m; imperial units are not supported.
- No undo/redo history.
- Line measurements contain one straight segment; there are no multi-segment polylines.
- No cloud storage, synchronization, accounts, collaboration, or sharing links.
- Only one browser-local recoverable session is retained; there is no project library.
- No OCR, AI, automatic room detection, angles, coordinates, volume calculations, or advanced
  architectural interpretation.
- No circles, arcs, annotations, freehand drawing, print/image export, PDF modification, or saving
  measurements back into the PDF.
- No thumbnail sidebar; pages use Previous/Next navigation.
