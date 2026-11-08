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
- **Panels and dialogs**: `app/` and `features/<area>/`.
- **Keyboard shortcuts**: actions, bindings and the single key dispatcher live in `utils/shortcuts/` (stable action ids are the storage contract); the Settings panel, catalog, presets and conflict rules are lazy in `features/shortcuts/`. Components read labels through `useShortcutLabel`; new actions register a handler with `useShortcutHandlers`.

## Lazy loading

Heavy, on-demand UI loads with `import()` through `app/recoverableLazy` + `app/retryableImport`: the viewer, Takeoff, classifications, scale check, export, page browser, and the Settings, project library and scale dialogs (`SettingsButton` is the eager trigger of `SettingsDialog`) and the start screen's "What's new" button, which renders once its chunk is preloaded on idle (`app/WhatsNew.tsx`). Keep new dialogs and workspaces out of the static startup graph; `npm run perf:size` enforces the budget (see `docs/PERFORMANCE.md`).

## Build output

- **pdf.js resources**: pdf.js decodes CCITT, JBIG2 and JPEG 2000 images (WASM), predefined CMaps, the standard fonts and ICC profiles from files it requests at run time; without them, scanned plans lose their images. `vite.config.ts` copies them to `dist/pdfjs/<pdfjs-version>/` (same origin, version in the path) and `services/pdfResources.ts` points `getDocument` at them; in dev they come from `node_modules/pdfjs-dist/`. They load on demand and are not part of the JS budget.
- **Content-Security-Policy**: the production build adds a `<meta>` policy (`scripts/contentSecurityPolicy.ts`), because GitHub Pages cannot send headers. Inline scripts are allowed by hash; `'wasm-unsafe-eval'` is for the pdf.js WASM decoders, never `'unsafe-eval'`. Anything that loads from another origin, or starts an inline script, needs the policy updated; `npm run test:smoke` fails on a violation.
- **Keyboard navigation**: Tab and Shift+Tab are driven by the app, not the browser (`src/components/ui/tabNavigation.ts`, installed by `AppShell`): the same sequence in every browser, each toolbar a single stop, popovers right after their trigger, dialogs trapping focus. Safari's own Tab skips buttons and links, and a mouse press does not focus them, so `src/utils/clickFocus.ts` (installed in `main.tsx`) focuses a pressed control when the browser did not, which keeps Tab and focus return working after a click. `npm run test:keyboard` drives the production build in Chromium and WebKit and fails when the Tab sequence differs between them, leaves the app to the browser, or breaks the dialog trap. Real Safari cannot run in CI: when changing focus handling, also try Tab in Safari by hand.

- **Release notes**: `scripts/releaseNotes.ts` parses `CHANGELOG.md` into the `virtual:release-notes` module (the newest releases, a few entries each) during the Vite build and in Vitest. The data ships only inside the lazy "What's new" chunk: no request at run time, and nothing in the startup graph.

## Coordinate model

See `utils/coordinates.ts` and `types/domain.ts`.

## Checks

Run the checks listed in [CONTRIBUTING.md](../CONTRIBUTING.md#development) before opening a pull request.
