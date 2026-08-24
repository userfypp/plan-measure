# Plan Measure

Plan Measure is a focused desktop web application for measuring real-world distances,
perimeters, and areas on architectural PDF plans. Open a PDF, add one or more named scales to
each page from known distances, then draw and edit line or polygon measurements directly over the
plan. It supports Line, open Polyline, and closed Polygon measurements.

## Privacy

Plan Measure runs entirely in the browser. PDFs, calibrations, measurements, and preferences are
never uploaded and no analytics, telemetry, accounts, cloud services, or remote logging are used.
The active session is stored only in the browser's IndexedDB so it can be recovered after a reload.

## v1 features

- Live app: https://userfypp.github.io/plan-measure/
- PDF loading through a file picker or drag-and-drop, with a 100 MB limit.
- Multi-page PDF navigation with independent named scales, active-scale selection, and measurement
  numbering per page. Scales can be normal uniform references or optional X/Y correction for
  scans and plots with different horizontal and vertical scaling.
- Millimetre, centimetre, and metre calibration and display units.
- Line measurements, continuous Polyline lengths, and Polygon perimeter/area measurements.
- Continuous drawing with Enter to finish Polyline or Polygon, and Escape to cancel a draft or
  leave the active drawing tool.
- Keyboard shortcuts: **V** Select, **H** Hand, **L** Line, **M** Polyline, **P** Polygon, and
  **O** Ortho 90° for new drawing segments.
- Editable measurement names and draggable vertices for every measurement type.
- Reusable classification dimensions and values that can be assigned independently to each
  measurement and survive session recovery.
- Optional Ortho 90° drawing mode for new Line, Polyline, and Polygon segments.
- Pan, pointer-centred zoom, keyboard zoom, and fit-to-screen controls.
- Independent visibility controls for labels, measurements, and calibration references.
- One recoverable, browser-local autosaved session with explicit Continue/Discard recovery.
- CSV export across every page with page, measurement, and per-measurement calibration
  traceability; measurement values use the current display unit.

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
2. In **Scale tools**, choose **Add uniform** for the normal two-point flow, or **Add X/Y** for a
   scanned/printed plan with independent horizontal and vertical scale references. The first scale
   is named **Scale 1** by default.
3. Select **Line**, **Polyline**, or **Polygon** and click on the plan. Line completes after its
   second point; Polyline and Polygon continue until you press **Enter**. A Polygon can also close
   by clicking its first vertex. Press **Escape** to cancel an unfinished drawing, then again to
   leave its tool.
4. Use **Select** to choose a measurement and drag its vertex handles. Names and classification
   assignments can be edited in the right workspace panel.
5. Use **O** or the **Ortho 90°** control to constrain new segments horizontally or vertically.
6. Choose **Export CSV** to export measurements from every page.

Line, Polyline, and Polygon are unavailable until the current page has a valid active scale. A page
can have multiple named scales; the selected active scale is used only for new measurements, while
every existing measurement permanently retains its own scale. Recalibrating a scale preserves its
ID and geometry, and recomputes only the measurements linked to that scale. X/Y correction is an
axis-aligned anisotropic scale only: it does not correct skew, perspective, local distortion, or
non-linear warping.

## Architecture

The application uses Vite 8, React 19.2, strict TypeScript, CSS Modules, PDF.js, Konva, and
react-konva. Persistent domain data lives in `SessionState`; selection, tools, drafts, previews, and
temporary workflows live in `WorkspaceState`; and blocking UI is represented by callback-free
descriptors in `OverlayState`. Runtime errors remain in the application shell. The source is grouped
into application state/shell, PDF and viewer behavior, calibration, measurements, classifications,
persistence/export services, domain types, and pure mathematical utilities.

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

Calibration distances are stored canonically in millimetres. Each measurement stores the ID of the
named page calibration used when it was created. Uniform scales use one Euclidean reference ratio.
X/Y correction uses an X reference with `|dx| > |dy|` and a Y reference with `|dy| > |dx|`; it
derives scale from the relevant axis component, tolerating small click deviation. Each Line or path
segment is transformed by its own X/Y components, while Polygon area is multiplied by `scaleX ×
scaleY`. Measurement values retain full internal precision. The UI uses two decimals by default and
expands the decimal places when rounding would hide a finite non-zero value as zero. CSV measurement
values use a locale-independent, deterministic number serialization without rounding; ordinary
decimal values keep at least two fractional places for compatibility with existing exports. CSV rows
include per-measurement calibration IDs, names, modes, and both audit scale factors; uniform-only
reference columns are deliberately blank for X/Y scales.

### Local persistence

The small [`idb`](https://www.npmjs.com/package/idb) wrapper is used to keep IndexedDB transactions
and error handling understandable. The PDF blob is stored separately from versioned session
metadata, so ordinary autosaves do not repeatedly rewrite the PDF. Only meaningful completed
changes are saved; pointer movement, drafts, Ortho mode, zoom, and pan are never persisted.

Exactly one active local session is retained. Opening a replacement PDF requires confirmation and
atomically replaces that session. If browser storage is unavailable, Plan Measure keeps working in
memory and displays a warning that reload recovery is unavailable.

## Testing and CI

Vitest covers geometry, uniform and X/Y calibration, path measurement flows, classifications,
units, CSV escaping and all-page export, V1/V2/V3/V4-to-V5 session migration/IndexedDB round trips,
state-boundary and reducer invariants, keyboard policy, label placement, PDF lifecycle/autosave, and
page/screen transforms across zoom, pan, rotation, fit-to-screen, and device pixel ratios. GitHub
Actions installs from
the lockfile and runs lint, tests, and a production build on pushes to `main` and pull requests.

## Supported browsers

v1 officially supports recent releases of Chrome, Edge, Firefox, and Safari. The workspace adapts to
narrow and low-height viewports while its drawing interactions remain optimized for pointer,
trackpad, and keyboard use.

## Known v1 limitations

- Drawing and vertex editing are not yet optimized for touch-only use.
- Password-protected PDFs are not supported and there is no password-entry flow.
- Physical units are limited to mm, cm, and m; imperial units are not supported.
- No undo/redo history.
- No cloud storage, synchronization, accounts, collaboration, or sharing links.
- Only one browser-local recoverable session is retained; there is no project library.
- No OCR, AI, automatic room detection, angles, coordinates, volume calculations, or advanced
  architectural interpretation.
- No circles, arcs, annotations, freehand drawing, print/image export, PDF modification, or saving
  measurements back into the PDF.
- No thumbnail sidebar; pages use Previous/Next navigation.
