# Architecture

A short map to get oriented. Stack: React 19 + TypeScript + Vite, Konva (canvas), pdfjs-dist (PDF), idb (IndexedDB). Everything runs in the browser; there is no server.

## Modules (`src/`)

| Path                       | Contents                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `app/`                     | Shell, bars, panels, session/workspace state (`sessionState.tsx`, `workspaceState.tsx`), autosave and PDF lifecycle. |
| `components/`              | Generic UI components (`Modal`, `ui/`).                                                                              |
| `features/viewer/`         | Konva canvas: PDF rendering, tools, snapping, geometry and dragging.                                                 |
| `features/calibration/`    | Scales (uniform, X/Y, ratio) and scale check.                                                                        |
| `features/measurements/`   | List, details, grouping, totals and Takeoff.                                                                         |
| `features/classification/` | Classifications and templates.                                                                                       |
| `features/pages/`          | Page browser and thumbnails.                                                                                         |
| `features/export/`         | Export dialog and annotated PDF.                                                                                     |
| `services/`                | Persistence (IndexedDB), `.planmeasure` project file, CSV/XLSX/ODS/JSON exports, PDF validation.                     |
| `utils/`                   | Pure functions: coordinates, calibration, units, geometry, formatting.                                               |
| `types/domain.ts`          | Shared domain types.                                                                                                 |
| `performance/`             | Performance tests (contracts: do not raise budgets).                                                                 |
| `styles/`                  | Global styles; components use CSS modules.                                                                           |

Tests live next to the code (`*.test.ts(x)`).

## Where to change what

- **New drawing tool**: `features/viewer/toolRegistry.ts`, `geometry.ts`, `draftPreview.ts`.
- **Length/area/scale math**: `utils/calibration.ts`, `utils/geometry.ts`, `utils/units.ts`.
- **New export format**: `services/` (`takeoffExport.ts`, `spreadsheetExport.ts`) and `features/export/ExportDialog.tsx`; if the JSON changes, update `docs/export-json.md`.
- **Saving/recovering projects**: `services/persistence*.ts`, `services/projectFile.ts`, `app/autosave.ts`.
- **Derived quantities and prices**: rules and validation in `utils/classificationRates.ts`, currencies in `utils/currencies.ts`, totals in `features/measurements/measurementTotals.ts` and `services/takeoffSummary.ts`, editor in `features/classification/ClassificationValueRatesDialog.tsx`. Saved fields need a migration in `services/persistenceCodec.ts`.
- **State and undo/redo**: `app/sessionState.tsx`, `app/state.tsx`. Persisting the history across reloads is lazy: `app/undoHistoryPersistence.ts` (idle writer, size cap) and `services/undoHistoryStorage.ts` (two records in the `sessions` store, tied to the saved revision and deleted wherever the active session is replaced).
- **Find similar symbols (Count)**: `features/symbolCount/`. Only `symbolCountStore.ts` is in the startup graph; the bar, overlay and session load on demand (`symbolCountLazy.ts`), and the template matching in `templateMatch.ts` runs in `symbolMatch.worker.ts` on a grayscale raster of the page (`pageRaster.ts`). Accepting matches is one `updateMeasurement` or `completePath` call, so it is one undo step.
- **Compare two versions of a plan**: `features/planCompare/`. Only `planCompareStore.ts` is in the startup graph (and `PdfViewer` only renders its registered overlay, under the measurements); the bar, overlay and session load on demand (`planCompareLazy.ts`). The other PDF lives in memory only. Both pages are rendered as grayscale rasters (reusing `symbolCount/pageRaster.ts`) and `planDiff.ts` compares them in `planDiff.worker.ts`; changing the alignment re-runs only the worker.
- **Panels and dialogs**: `app/` and `features/<area>/`.
- **Keyboard shortcuts**: actions, bindings and the single key dispatcher live in `utils/shortcuts/` (stable action ids are the storage contract); the Settings panel, catalog, presets and conflict rules are lazy in `features/shortcuts/`. Components read labels through `useShortcutLabel`; new actions register a handler with `useShortcutHandlers`.

## Lazy loading

Heavy, on-demand UI loads with `import()` through `app/recoverableLazy` + `app/retryableImport`: the viewer, Takeoff, classifications, scale check, export, page browser, and the Settings, project library and scale dialogs (`SettingsButton` is the eager trigger of `SettingsDialog`) and the start screen's "What's new" button, which renders once its chunk is preloaded on idle (`app/WhatsNew.tsx`). Keep new dialogs and workspaces out of the static startup graph; `npm run perf:size` enforces the budget (see `docs/PERFORMANCE.md`).

## Build output

- **pdf.js resources**: pdf.js decodes CCITT, JBIG2 and JPEG 2000 images (WASM), predefined CMaps, the standard fonts and ICC profiles from files it requests at run time; without them, scanned plans lose their images. `vite.config.ts` copies them to `dist/pdfjs/<pdfjs-version>/` (same origin, version in the path) and `services/pdfResources.ts` points `getDocument` at them; in dev they come from `node_modules/pdfjs-dist/`. They load on demand and are not part of the JS budget.
- **Content-Security-Policy**: the production build adds a `<meta>` policy (`scripts/contentSecurityPolicy.ts`), because GitHub Pages cannot send headers. Inline scripts are allowed by hash; `'wasm-unsafe-eval'` is for the pdf.js WASM decoders, never `'unsafe-eval'`. Anything that loads from another origin, or starts an inline script, needs the policy updated; `npm run test:smoke` fails on a violation.
- **Service worker**: `scripts/service-worker.js` is a hand-written worker that `vite.config.ts` fills in and emits as `dist/sw.js` (`scripts/serviceWorker.ts`): it precaches `index.html`, the hashed JS/CSS chunks, the pdf.js worker, the icons and the manifest under a version that hashes that list, and caches the versioned `pdfjs/<version>/` resources on first use. Navigations go network first (3 s timeout) and fall back to the precached `index.html` of the same version, which is never overwritten with network HTML; assets are cache first. It does not call `skipWaiting()` or `clients.claim()`: a new version takes over once no page uses the old one, and then deletes the old caches, so online users get the newest build and offline users the last complete one. `main.tsx` registers it in production only, on idle, from the lazy `app/serviceWorkerRegistration` chunk, and `perf/` scripts block workers so measurements are unaffected. `npm run test:pwa` loads the build, goes offline and reloads.
- **Keyboard navigation**: Tab and Shift+Tab are driven by the app, not the browser (`src/components/ui/tabNavigation.ts`, installed by `AppShell`): the same sequence in every browser, each toolbar a single stop, popovers right after their trigger, dialogs trapping focus. Safari's own Tab skips buttons and links, and a mouse press does not focus them, so `src/utils/clickFocus.ts` (installed in `main.tsx`) focuses a pressed control when the browser did not, which keeps Tab and focus return working after a click. `npm run test:keyboard` drives the production build in Chromium and WebKit and fails when the Tab sequence differs between them, leaves the app to the browser, or breaks the dialog trap. Real Safari cannot run in CI: when changing focus handling, also try Tab in Safari by hand.

- **Release notes**: `scripts/releaseNotes.ts` parses `CHANGELOG.md` into the `virtual:release-notes` module (the newest releases, a few entries each) during the Vite build and in Vitest. The data ships only inside the lazy "What's new" chunk: no request at run time, and nothing in the startup graph.

## Coordinate model

See `utils/coordinates.ts` and `types/domain.ts`.

## Checks

Run the checks listed in [CONTRIBUTING.md](../CONTRIBUTING.md#development) before opening a pull request.
