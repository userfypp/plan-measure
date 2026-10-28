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

Expand a scale to rename it or edit its calibration. Choose the **Check scale** icon in a scale row, mark two points, and enter their known distance to see the measured distance and signed absolute and percentage differences; dismiss or press Escape to clear the temporary result without changing scales or measurements. To reuse it on another page, copy it in **Scales**, switch pages, and choose **Apply copied scale**. The copy is independent.

## Measurements and totals

### Drawing tools

| Tool          | Measures            | How to draw                                                         |
| ------------- | ------------------- | ------------------------------------------------------------------- |
| **Line**      | Length              | Click both ends.                                                    |
| **Polyline**  | Length along a path | Click each point, then press `Enter`.                               |
| **Polygon**   | Perimeter and area  | Click each vertex, then close on the first vertex or press `Enter`. |
| **Rectangle** | Perimeter and area  | Click one corner, then the opposite corner.                         |
| **Ellipse**   | Perimeter and area  | Same two clicks; the ellipse is inscribed in that box.              |
| **Cloud**     | Perimeter and area  | Like a Polygon; it is drawn as a revision cloud.                    |
| **Count**     | Number of items     | Click once per item, then choose **Done**. No scale needed.         |

**Rectangle and Ellipse.** Hold `Shift` while placing the second corner for a square or a circle. The toolbar highlights the `Shift` hint while the key is down, the preview shows the exact result, and a box with no size is not created. Both stay aligned to the page: in Select, dragging a corner also moves its two neighbours so the shape stays a rectangle or ellipse. A square or circle is exact on the page; with an X/Y scale it measures as a rectangle or ellipse in real units.

**Cloud.** It is drawn in review red with a thicker stroke and a faint fill, in the app and in the annotated PDF. To pick another color, select it, open **Details** and choose from the short palette; the color is saved with the project and included in the JSON export. Its area and perimeter are those of its control polygon, not of the scalloped outline, and very large outlines are simplified to that polygon to keep drawing responsive.

**Count.** **New count** starts a separate count. To add items later, select the count and choose **Add items** in its toolbar or in **Details**. A count shares one name, note and set of classifications, and you move its markers with Select. In **Details → Items**, **Move to…** transfers an item to another count on the same page and the trash button removes it. Lists over 50 items use **Previous items** and **Next items**. Moving the last item removes the empty source count, and Undo brings both back.

### Editing and selecting

- **Snap** aligns points with visible measurement geometry. **Ortho** keeps segments horizontal or vertical.
- **Select** moves measurements or drags single vertices. **Details** holds the notes and classification assignments. Rename a selected measurement from the context bar.
- `Shift`/`Ctrl`/`Cmd`-click adds or removes measurements from the selection. Bulk classification, visibility and deletion work across pages.
- Moving, duplicating and copying a group need a selection on a single page. Pasting onto another page uses that page's active scale for paths, and all the geometry must fit.
- **Undo/Redo** covers measurements, scales, classifications and page labels. History resets when you open a project or reload; navigation and display settings are not part of it.

### Classifications, lists and Takeoff

In **Classifications**, create dimensions such as Trade with values such as Electrical. Archive entries to keep their assignments; delete them to remove the assignments from the whole project. **Templates** saves a reusable catalog on this device. Applying a template adds the missing entries and reuses matching names without changing any assignment; restore matching archived entries first.

**Measurements** lists the current page, with a search box, a filter menu and a grouping menu (icon buttons; hover for their names) that nests entries by classification. The eye button on a row or group hides or shows it.

**Takeoff** totals all pages, hidden measurements included, with breakdowns by page, type or classification. Lines and Polylines add length, Polygons add perimeter and area, and Count markers add items. Measurements that cannot be calculated are left out with a notice; choose **Inspect** on it to see which ones and why. Open a measurement count to see its sources, then select one to jump to its page and details. Source lists over 50 measurements use **Previous** and **Next**.

## View and settings

Use the controls below the plan for previous/next pages, zoom, **Fit**, active scale, and **View**. Open **Pages**, search a label (Enter opens a single match), or enter a physical number in **Go to page** and press Enter. Thumbnails load only for visible rows and nearby pages; for large or slow-to-render PDFs, the current page still gets its thumbnail, and **Load previews** loads the others at a higher memory cost. Click the label below the plan to rename it; the browser also shows existing custom labels. **View** sets display units and annotation visibility; polygon area can also use acres. In **Settings > View**, **Label classification** adds the measurement's value from a chosen classification to its on-screen label (exports and the annotated PDF are unchanged). Projects saved with this version do not open in earlier versions of the app.

**Settings** opens a dialog with sections for Interface, Accessibility, Measurements, Drawing, View, Canvas, Confirmations, Shortcuts (read-only reference), Performance, and Advanced. They cover appearance, wider sidebar, displayed decimal places, tooltips and their delay, deletion confirmations, the workspace used when reopening projects, and keyboard authoring; most are saved per device, and **Reset…** restores them. Displayed decimal places do not change CSV precision or feet-and-inches fractions.

## Projects and recovery

**Projects** opens, imports, exports, and deletes local projects. Opening another PDF or importing a project keeps existing saved projects. Editing is temporarily blocked while a project loads. If the current project exists only in memory, cancel and export it first, or confirm **Discard and open** to open another PDF. Click the save status in the application bar → **Export backup (.planmeasure)**, or use **Projects → Export**, to download a file with the PDF and editable data.

The save status shows **Saving…**, **Saved on this device** after confirmation, or **Couldn't save**; repair, another-tab, and storage problems have their own labels. Completed edits autosave in IndexedDB only in this browser. Drafts, Snap, Ortho, zoom, pan, and undo history are not saved. The app requests persistent storage after a confirmed save when supported; the browser may deny it or ask for permission. Clearing site data still removes saved projects, so keep downloaded backups.

If saving fails:

1. Use **Retry saving** when available.
2. Use **Export backup (.planmeasure)** in the save status, or **Export project** in the warning, to preserve your current edits.
3. If another tab changed the project, use **Reload saved projects** after exporting. Reloading discards unsaved edits.

Older data is migrated when possible. If repair is required, autosave stays paused until the reported problems are resolved. Repair the project before opening another one if it has unsaved changes.

## Exports

| Format         | Contents                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV            | Measurements from all pages, including hidden ones, or classification assignments linked by `measurement_id`.                                   |
| XLSX / ODS     | Both datasets in separate sheets; quantities are numeric cells.                                                                                 |
| JSON           | All pages, geometry, scales, and classifications, including hidden measurements and archived entries. No PDF; see the [schema](export-json.md). |
| Annotated PDF  | Original pages with visible measurements; labels follow the Labels setting. The source PDF is unchanged.                                        |
| `.planmeasure` | PDF and editable project data, via **Projects → Export**.                                                                                       |

**Takeoff summaries:** select project totals, page/type breakdowns, or classification dimensions in Export. Use **Data → Takeoff summary** for a standalone CSV/XLSX/ODS; otherwise add them to the dataset. CSV bundles separate files in a ZIP; workbooks add sheets. Summaries include hidden measurements, full precision, excluded counts and quantity statuses. JSON uses mm/mm²; other formats use display units (decimal feet for ft-in).

The `count` column appears when Count markers are present; each count exports its number of points as a numeric quantity, with scale and physical quantities left blank. CSV measurement and workbook columns are configurable; required columns stay enabled. Successful exports remember the selection. JSON ignores column preferences and display units.

Spreadsheet exports reject unsupported text or values exceeding format limits. Spreadsheet applications can reduce numeric precision; use JSON for the original numeric representation.

Encrypted PDFs cannot be exported as annotated PDFs, even if they open without a password. Save an unencrypted copy in a PDF editor and open that copy to export annotations.

## Keyboard controls

Use `Cmd` on macOS and `Ctrl` on Windows/Linux. Text fields, dialogs, and native control actions retain their own keys.

| Shortcut                           | Action                                              |
| ---------------------------------- | --------------------------------------------------- |
| `V` / `H`                          | Select / Hand                                       |
| `L` / `M` / `P`                    | Line / Polyline / Polygon                           |
| `R` / `I` / `K`                    | Rectangle / Ellipse / Cloud                         |
| `C`                                | Count                                               |
| `S` / `O`                          | Toggle Snap / Ortho                                 |
| `Enter` / `Escape`                 | Finish / cancel drawing; leave an idle drawing tool |
| Hold `Space`                       | Pan                                                 |
| Hold `Shift` (Rectangle / Ellipse) | Square / circle at the second corner                |
| `+` or `=` / `-`                   | Zoom in / out                                       |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`  | Undo / redo                                         |
| `Cmd/Ctrl+C` / `Cmd/Ctrl+V`        | Copy / paste selected measurements                  |
| `Delete` or `Backspace`            | Delete selected measurements                        |

For keyboard authoring, enable **Settings → Keyboard drawing and editing** and focus the PDF viewer:

- Arrows move the cursor; Shift moves faster. Space places a point; Enter finishes a path. In Hand, arrows pan.
- In Select, Space selects at the cursor; Shift+Space adds or removes a selection.
- `E` previews an edit. Choose the whole measurement or a vertex in the help card; `N` / `Shift+N` cycles targets. Arrows adjust, Enter saves, and Escape cancels.
- While editing a scale reference, choose an endpoint with the selector or `N`, adjust with arrows, and press Enter to use the Save workflow.

Navigation, pointer interaction, selection changes, or loss of focus cancel pending keyboard edits.
