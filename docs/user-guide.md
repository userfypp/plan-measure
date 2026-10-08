# User guide

[Open Plan Measure](https://userfypp.github.io/plan-measure/) · [Quick start](../README.md#quick-start)

## Scales

Each page supports multiple named scales. In **Scales → Add scale**, choose:

| Mode           | Use                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Uniform        | One known reference distance.                                                                                                    |
| X/Y            | Separate horizontal and vertical reference distances. Keep references aligned with their axes; diagonal references are rejected. |
| Custom ratio   | A known 1:n denominator.                                                                                                         |
| Standard ratio | 1:20, 1:50, or 1:100.                                                                                                            |

Reference input accepts metric units, decimal inches or feet, and feet-and-inches notation. Choose the active scale below the plan before drawing. Existing measurements keep their assigned scale; recalibrating it updates their results.

Expand a scale to rename it or edit its calibration. To reuse it on another page, copy it in **Scales**, switch pages, and choose **Apply copied scale**. The copy is independent.

## Measurements and totals

- **Line**: length between two points. **Polyline**: length along a path. **Polygon**: perimeter and area.
- **Snap** aligns points with visible measurement geometry; **Ortho** constrains segments horizontally or vertically.
- **Select** lets you move measurements or drag individual vertices. **Details** contains names, notes, and classification assignments.
- Shift/Ctrl/Cmd-click adds or removes measurements from the selection. Bulk classification, visibility, and deletion support selections across pages. Moving, duplicating, and copying a group require a single-page selection; pasting onto another page uses its active scale and requires all geometry to fit.
- **Undo/Redo** covers measurement, scale, classification, and page-label edits. History resets on project opening or reload; navigation and display settings are excluded.

In **Classifications**, create dimensions such as Trade with values such as Electrical. Archive entries to keep assignments; delete them to remove assignments throughout the project. **Templates** saves a reusable catalog locally. Applying a template adds missing entries and reuses matching names without changing measurement assignments; restore matching archived entries first.

**Measurements** lists the current page and can group entries by classification dimensions. **Takeoff** totals all pages, including hidden measurements, with breakdowns by page, type, or classification. Lines and Polylines contribute length; Polygons contribute perimeter and area. Uncalculable measurements are excluded with a notice.

## View and settings

Use the controls below the plan for pages, zoom, **Fit**, active scale, and **View**. Click a page label to rename it. **View** sets display units and the visibility of labels, geometry, and calibration references; polygon area can also use acres.

**Settings** contains appearance, displayed decimal places, deletion confirmations, the workspace used when reopening projects, and keyboard authoring. Displayed decimal places do not change CSV precision or feet-and-inches fractions.

## Projects and recovery

**Projects** opens, imports, exports, and deletes local projects. Opening another PDF or importing a project keeps existing projects. Export `.planmeasure` files to back up or transfer the PDF and editable data.

Completed edits autosave in IndexedDB. Drafts, Snap, Ortho, zoom, pan, and undo history are not saved. Browser site-data deletion removes saved projects.

If saving fails:

1. Use **Retry saving** when available.
2. Use **Export project** to preserve your current edits.
3. If another tab changed the project, use **Reload saved projects** after exporting. Reloading discards unsaved edits.

Older data is migrated when possible. If repair is required, autosave stays paused until the reported problems are resolved.

## Exports

| Format         | Contents                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV            | Measurements from all pages, including hidden ones, or classification assignments linked by `measurement_id`.                                   |
| XLSX / ODS     | Both datasets in separate sheets; quantities are numeric cells.                                                                                 |
| JSON           | All pages, geometry, scales, and classifications, including hidden measurements and archived entries. No PDF; see the [schema](export-json.md). |
| Annotated PDF  | Original pages with visible measurements; labels follow the Labels setting. The source PDF is unchanged.                                        |
| `.planmeasure` | PDF and editable project data, via **Projects → Export**.                                                                                       |

CSV measurement and workbook columns are configurable; required columns stay enabled. Successful exports remember the selection. JSON ignores column preferences and display units.

Spreadsheet exports reject unsupported text or values exceeding format limits. Spreadsheet applications can reduce numeric precision; use JSON for the original numeric representation.

Encrypted PDFs cannot be exported as annotated PDFs, even if they open without a password. Save an unencrypted copy in a PDF editor and open that copy to export annotations.

## Keyboard controls

Use `Cmd` on macOS and `Ctrl` on Windows/Linux. Text fields, dialogs, and native control actions retain their own keys.

| Shortcut                          | Action                                              |
| --------------------------------- | --------------------------------------------------- |
| `V` / `H`                         | Select / Hand                                       |
| `L` / `M` / `P`                   | Line / Polyline / Polygon                           |
| `S` / `O`                         | Toggle Snap / Ortho                                 |
| `Enter` / `Escape`                | Finish / cancel drawing; leave an idle drawing tool |
| Hold `Space`                      | Pan                                                 |
| `+` or `=` / `-`                  | Zoom in / out                                       |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / redo                                         |
| `Cmd/Ctrl+C` / `Cmd/Ctrl+V`       | Copy / paste selected measurements                  |
| `Delete` or `Backspace`           | Delete selected measurements                        |

For keyboard authoring, enable **Settings → Keyboard drawing and editing** and focus the PDF viewer:

- Arrows move the cursor; Shift moves faster. Space places a point; Enter finishes a path. In Hand, arrows pan.
- In Select, Space selects at the cursor; Shift+Space adds or removes a selection.
- `E` previews an edit. Choose the whole measurement or a vertex in the help card; `N` / `Shift+N` cycles targets. Arrows adjust, Enter saves, and Escape cancels.
- While editing a scale reference, choose an endpoint with the selector or `N`, adjust with arrows, and press Enter to use the Save workflow.

Navigation, pointer interaction, selection changes, or loss of focus cancel pending keyboard edits.
