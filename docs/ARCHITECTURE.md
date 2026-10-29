# Architecture

A short map to get oriented. Stack: React 19 + TypeScript + Vite, Konva (canvas), pdfjs-dist (PDF), idb (IndexedDB). Everything runs in the browser; there is no server.

## Modules (`src/`)

| Path | Contents |
|---|---|
| `app/` | Shell, bars, panels, session/workspace state (`sessionState.tsx`, `workspaceState.tsx`), autosave and PDF lifecycle. |
| `components/` | Generic UI components (`Modal`, `ui/`). |
| `features/viewer/` | Konva canvas: PDF rendering, tools, snapping, geometry and dragging. |
| `features/calibration/` | Scales (uniform, X/Y, ratio) and scale check. |
| `features/measurements/` | List, details, grouping, totals and Takeoff. |
| `features/classification/` | Classifications and templates. |
| `features/pages/` | Page browser and thumbnails. |
| `features/export/` | Export dialog and annotated PDF. |
| `services/` | Persistence (IndexedDB), `.planmeasure` project file, CSV/XLSX/ODS/JSON exports, PDF validation. |
| `utils/` | Pure functions: coordinates, calibration, units, geometry, formatting. |
| `types/domain.ts` | Shared domain types. |
| `performance/` | Performance tests (contracts: do not raise budgets). |
| `styles/` | Global styles; components use CSS modules. |

Tests live next to the code (`*.test.ts(x)`).

## Where to change what

- **New drawing tool**: `features/viewer/toolRegistry.ts`, `geometry.ts`, `draftPreview.ts`.
- **Length/area/scale math**: `utils/calibration.ts`, `utils/geometry.ts`, `utils/units.ts`.
- **New export format**: `services/` (`takeoffExport.ts`, `spreadsheetExport.ts`) and `features/export/ExportDialog.tsx`; if the JSON changes, update `docs/export-json.md`.
- **Saving/recovering projects**: `services/persistence*.ts`, `services/projectFile.ts`, `app/autosave.ts`.
- **State and undo/redo**: `app/sessionState.tsx`, `app/state.tsx`.
- **Panels and dialogs**: `app/` and `features/<area>/`.

## Lazy loading

Heavy, on-demand UI loads with `import()` through `app/recoverableLazy` + `app/retryableImport`: the viewer, Takeoff, classifications, scale check, export, page browser, and the Settings, project library and scale dialogs (`SettingsButton` is the eager trigger of `SettingsDialog`). Keep new dialogs and workspaces out of the static startup graph; `npm run perf:size` enforces the budget (see `docs/PERFORMANCE.md`).

## Coordinate model

See `utils/coordinates.ts` and `types/domain.ts`.

## Checks

Run the checks listed in [CONTRIBUTING.md](../CONTRIBUTING.md#development) before opening a pull request.
