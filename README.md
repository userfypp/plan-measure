# Plan Measure

Plan Measure is a desktop web application for measuring real-world distances, perimeters, and areas
on architectural PDF plans. Open a PDF, add one or more named scales to a page, then draw and edit
Line, open Polyline, and closed Polygon measurements directly over the plan.

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
- Continuous drawing with **Enter** to finish Polyline or Polygon, and **Escape** to cancel a draft
  or leave the active drawing tool.
- Tool shortcuts: **V** Select, **H** Hand, **L** Line, **M** Polyline, **P** Polygon, **O** Ortho,
  and **S** Snap. With the viewer focused, **Space** temporarily pans; **+** and **-** zoom.
- Optional Ortho mode constrains new segments horizontally or vertically. Optional Snap mode snaps
  new measurement points to visible measurement geometry.
- Editable measurement names, draggable vertices, and whole-measurement dragging in Select mode.
- Copy and paste the selected measurement with **Cmd/Ctrl+C** and **Cmd/Ctrl+V**, or use
  **Duplicate** for a same-page copy.
- Reusable classification dimensions and values that can be assigned to individual measurements.
- Group measurements by one classification dimension and show or hide a whole group.
- Pan, pointer-centred zoom, keyboard zoom, and fit-to-screen controls.
- Global visibility controls for labels, measurements, and calibration references, plus
  per-measurement visibility preferences.
- Browser-local autosave with Continue or Discard recovery after a reload.
- CSV export across every page with selectable measurement, value, scale, and classification
  columns. Measurement values use the current display unit, and column choices are saved locally.

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
4. Use **Select** to choose a measurement. Drag its geometry to move the whole measurement, or drag
   its vertex handles to edit it. Use **Duplicate** or **Cmd/Ctrl+C** and **Cmd/Ctrl+V** to copy it.
5. Edit names and visibility in the **Measurements** tab. Assign classification values from the
   dock at the bottom of the panel; manage reusable dimensions and values in **Classifications**.
6. Use **O** to toggle Ortho and **S** to toggle Snap while drawing. Snap targets visible
   measurement geometry.
7. Choose **Export CSV** and select the columns to export from every page.

Line, Polyline, and Polygon are unavailable until the current page has a valid active scale. A page
can have multiple named scales; the selected active scale is used only for new measurements, while
every existing measurement retains its own scale. Recalibrating a scale preserves its ID and
geometry, and recomputes only the measurements linked to that scale. X/Y correction uses separate
horizontal and vertical scales; it does not correct skew, perspective, local distortion, or
non-linear warping.

## Architecture

The application uses Vite 8, React 19.2, strict TypeScript, CSS Modules, PDF.js, Konva, and
react-konva. Persistent plan data and temporary interaction state are kept separate. Measurement and
calibration geometry is stored in page coordinates, so zooming and panning do not change saved
geometry.

### Local persistence

The active PDF and versioned session metadata are stored in separate IndexedDB records. Only
completed changes are autosaved; drafts, Ortho, Snap, zoom, and pan are not persisted.

Exactly one active local session is retained. Opening a replacement PDF requires confirmation and
replaces that saved session. If browser storage is unavailable, Plan Measure keeps working in memory
and displays a warning that reload recovery is unavailable.

The current session schema is V8. Recovery supports saved V1 through V8 sessions and migrates older
versions to V8. The V7→V8 migration adds saved CSV export column preferences.

## Testing and CI

Vitest covers geometry, calibration, drawing and editing, classifications, measurement copy/paste,
CSV export, legacy-to-V8 session migration and IndexedDB recovery, keyboard behavior, PDF lifecycle,
and viewer transforms. GitHub Actions uses Node.js 24, installs from the lockfile, and runs lint,
tests, and a production build on pushes to `main` and pull requests.

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
