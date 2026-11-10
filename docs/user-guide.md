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

**Find similar symbols.** With a count selected (or none), choose **Find similar** in the Count toolbar and drag a box around one symbol. The app searches the current page on your device, nothing is uploaded, and outlines every similar symbol it finds. Choose a **Similarity** level (Exact, High, Balanced, Loose) to show fewer or more matches, turn **Any orientation** off to ignore rotated and mirrored copies, and click an outline to exclude it or include it again. **Add N items** adds the accepted matches to the selected count, or starts a new one, as a single undo step. Escape or **Cancel** leaves without adding anything.

### Editing and selecting

- **Snap** aligns points with visible measurement geometry. **Ortho** keeps segments horizontal or vertical.
- **Select** moves measurements or drags single vertices. **Details** holds the notes and classification assignments. Rename a selected measurement from the context bar. In **Details**, rename each item of a count; its name appears as a label at the item's point. Drag the label of a selected measurement to move it off the plan text (the annotated PDF keeps the position); **Reset label position** in **Details** puts it back.
- `Escape` steps back one level per press: cancel the drawing or calibration, leave the tool, close **Details**, then clear the selection.
- `Shift`/`Ctrl`/`Cmd`-click adds or removes measurements from the selection. Bulk classification, visibility and deletion work across pages.
- Moving, duplicating and copying a group need a selection on a single page. Pasting onto another page uses that page's active scale for paths, and all the geometry must fit.
- **Undo/Redo** covers measurements, scales, classifications and page labels. The history of the open project also survives a reload, returning shortly after the plan opens and capped for very large plans; opening another project or PDF starts it empty. Navigation and display settings are not part of it.

### Classifications, lists and Takeoff

In **Classifications**, create dimensions such as Trade with values such as Electrical; each dimension starts closed, so open it to see its values, or use **Search classifications** to find one. The **⋯** menu of a dimension or value renames, archives or deletes it: archiving keeps its assignments, deleting removes them from the whole project. **Templates** (**Back to project** returns; the search box filters templates too) saves a reusable catalog on this device. Applying a template adds the missing entries and reuses matching names without changing any assignment; restore matching archived entries first. It also saves and applies each value's quantity and price settings and the currency: if the template's settings differ from existing ones, choose **Keep existing** or **Replace** (or cancel); if its currency differs from the project's, its prices are not applied, and a project with neither currency nor prices adopts the template's. Templates saved earlier still work.

**Quantities and prices.** In **Classifications**, open a dimension and select a value; the dialog title shows the value. A value with a rule shows its summary to the right of its name (for example `Area × 2.70 m · 25.00 EUR/m²`), and hovering the row spells it out. **Save and next** saves and opens the next active value, moving on to the next dimension and skipping archived entries. **Derived quantity** multiplies a value's total by one fixed factor in the project unit; hover an option, or read the sentence under the field, for what it measures: **Area from length** (the lines and polylines assigned to the value × **Height**, such as a wall drawn as a line), **Area from perimeter** (the perimeter of its closed shapes × **Height**, such as the walls around a room) or **Volume from area** (the area of its closed shapes × **Thickness**, such as a slab). Clouds count only when **Measure clouds** is on. **Unit price** is an amount of zero or more, **Applied to** Length, Perimeter, Area, Count (items, such as per door) or the derived area or volume, in a unit you choose (for example m, ft², ac, each or m³). A price needs a currency: choose one in the dialog if the project has none, or in **Settings > View → Currency**. A project uses a single currency, nothing is converted when it changes, and **None** is offered only while no value has a price.

**Measurements** lists all pages by default; set the **Page** filter to **This page** or another page to narrow it. It has a search box, a filter menu and a grouping menu (icon buttons; hover for their names) that nests entries by classification. The eye button on a row or group hides or shows it.

**Takeoff** totals all pages, hidden measurements included, in collapsible sections. **Project totals** is open by default; **Derived & cost** appears when a value has a quantity or price and shows its first figure while closed. Choose a **Breakdown** by page, type or classification to compare totals: each group starts closed with its main figure on the row. Lines and Polylines add length, Polygons add perimeter and area, and Count markers add items. Derived area, derived volume and cost are calculated once per value from all its measurements; if values in several dimensions have them, a note says they are added together. Measurements that cannot be calculated are left out with a notice, and a derived quantity or cost that cannot be calculated shows **Not calculable**; choose **Inspect** on it to see which ones and why. Open a group and use its **N measurements** row to see its sources, then select one to jump to its page and details. Source lists over 50 measurements use **Previous** and **Next**.

## View and settings

Use the controls below the plan for previous/next pages, zoom, **Fit**, active scale, and **View**. Open **Pages**, search a label (Enter opens a single match), or enter a physical number in **Go to page** and press Enter. Thumbnails load only for visible rows and nearby pages; for large or slow-to-render PDFs, the current page still gets its thumbnail, and **Load previews** loads the others at a higher memory cost. Click the label below the plan to rename it; the browser also shows existing custom labels. **View** sets display units and annotation visibility; polygon area can also use acres. In **Settings > View**, **Label classification** adds the measurement's value from a chosen classification to its on-screen label (exports and the annotated PDF are unchanged). Projects saved with this version do not open in earlier versions of the app.

**Settings** opens on its first tab: **View** with a project open, **Interface** without one. **View** is the only tab that belongs to the project: its settings, including **Currency**, are saved with the plan and unavailable until one is open. The other tabs (Interface, Accessibility, Measurements, Drawing, Filters, Canvas, Confirmations, Shortcuts, Performance) are saved per device. The footer holds **Export settings**, **Import settings** and **Reset…**, which restores every device setting; projects are not changed. Displayed decimal places do not change CSV precision or feet-and-inches fractions. In **Filters**, choose the filters the Measurements list starts with. With a project open, the **Project** box at the end of the tab offers **Default filters > Custom**, which gives that project its own, saved with the plan. **Clear filters** still shows everything.

**What's new** on the start screen lists the latest releases: version, date, the main additions and fixes, and a link to the release on GitHub. A **New** badge stays on the button until you open it for the current version. The notes are bundled with the app, so they also work offline.

## Projects and recovery

**Projects** opens, imports, exports, and deletes local projects. Opening another PDF or importing a project keeps existing saved projects. Editing is temporarily blocked while a project loads. If the current project exists only in memory, cancel and export it first, or confirm **Discard and open** to open another PDF. Click the save status in the application bar → **Export backup (.planmeasure)**, or use **Projects → Export**, to download a file with the PDF and editable data. A project marked **PDF unavailable** lost its copy of the PDF and can only be discarded.

The save status shows **Saving…**, **Saved on this device** after confirmation, or **Couldn't save**; repair, another-tab, and storage problems have their own labels. Completed edits autosave in IndexedDB only in this browser. Drafts, Snap, Ortho, zoom and pan are not saved. The undo history of the open project is kept separately and best-effort, so reloading right after an edit can lose it. The app requests persistent storage after a confirmed save when supported; the browser may deny it or ask for permission. Clearing site data still removes saved projects, so keep downloaded backups.

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

**Takeoff summaries:** select project totals, page/type breakdowns, or classification dimensions in Export. Use **Data → Takeoff summary** for a standalone CSV/XLSX/ODS; otherwise add them to the dataset. CSV bundles separate files in a ZIP; workbooks add sheets. Summaries include hidden measurements, excluded counts and quantity statuses. JSON uses mm/mm²/mm³; other formats use display units (decimal feet for ft-in). Derived area follows the area unit, derived volume uses cubic linear units (`volume_unit`), and cost is in the project `currency`; their columns (`derived_area`, `derived_volume`, `cost` and their statuses) come last and are blank when not applicable.

The `count` column appears when Count markers are present; each count exports its number of points as a numeric quantity, with scale and physical quantities left blank. CSV measurement and workbook columns are configurable; required columns stay enabled. Successful exports remember the selection. JSON ignores column preferences and display units.

Spreadsheet exports reject unsupported text or values exceeding format limits. CSV, XLSX and ODS write numbers with 15 significant digits, the precision spreadsheet applications keep, whatever the displayed decimal places; JSON keeps every digit.

Encrypted PDFs cannot be exported as annotated PDFs, even if they open without a password. Save an unencrypted copy in a PDF editor and open that copy to export annotations.

## Keyboard controls

Use `Cmd` on macOS and `Ctrl` on Windows/Linux. Text fields, dialogs, and native control actions retain their own keys. Tooltips, the toolbar, and menus always show the keys currently in use.

| Default shortcut                                  | Action                                              |
| ------------------------------------------------- | --------------------------------------------------- |
| `V` / `H`                                         | Select / Hand                                       |
| `L` / `M` / `P`                                   | Line / Polyline / Polygon                           |
| `R` / `I` / `K`                                   | Rectangle / Ellipse / Cloud                         |
| `C`                                               | Count                                               |
| `S` / `O`                                         | Toggle Snap / Ortho                                 |
| `Enter` / `Escape`                                | Finish / cancel drawing; leave an idle drawing tool |
| Hold `Space`                                      | Pan                                                 |
| Hold `Shift` (Rectangle / Ellipse)                | Square / circle at the second corner                |
| `+` or `=` / `-`                                  | Zoom in / out                                       |
| `F` / `W` / `0`                                   | Fit page / fit width / actual size                  |
| `PageUp` / `PageDown` / `Home` / `End`            | Previous / next / first / last page                 |
| `T`                                               | Open or close Pages                                 |
| `1` / `2` / `3` / `4`                             | Measurements / Takeoff / Classifications / Scales   |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` | Undo / redo                                         |
| `Cmd/Ctrl+C` / `Cmd/Ctrl+V`                       | Copy / paste selected measurements                  |
| `Cmd/Ctrl+D` / `F2`                               | Duplicate / rename the selected measurement         |
| `Delete` or `Backspace`                           | Delete selected measurements                        |
| `Cmd/Ctrl+O` / `Cmd/Ctrl+E` / `Cmd/Ctrl+,`        | Projects / Export / Settings                        |

**Settings → Shortcuts** lets you change any of these, and also bind actions that have no key by default (Calibrate, Details, Show or hide, workspace and theme switching). Click a key, press the new combination, and the app reflects it everywhere. Each action can have up to two keys.

- If a combination is already used, you can reassign it from the other action. Keys the app or browser reserves (such as `Space`, `Enter`, `Escape`, arrows, `Cmd/Ctrl+W`, `Cmd/Ctrl+T`) cannot be used, and combinations that may also trigger a browser shortcut are flagged.
- Each row's restore button returns it to its preset (disabled while unchanged); the restore button beside the search (**Reset all shortcuts**) discards every change. The **Preset** menu switches the whole set at once: **Default**, **Legacy** (the keys from before shortcuts were customizable), **Keyboard first** (a key for every action), **Left hand** and **Right hand** (tool keys on one side of the keyboard), and **Essentials** (no single-letter keys). Switching presets while you have custom keys asks before discarding them.
- Shortcuts are saved per device. After updating from an earlier version, the new defaults apply automatically and a one-time notification at the top right offers **Review** to open this list; choose the **Legacy** preset to go back to the previous keys.

For keyboard authoring, enable **Settings → Keyboard drawing and editing** and focus the PDF viewer:

- Arrows move the cursor; Shift moves faster. Space places a point; Enter finishes a path. In Hand, arrows pan.
- In Select, Space selects at the cursor; Shift+Space adds or removes a selection.
- `E` previews an edit. Choose the whole measurement or a vertex in the help card; `N` / `Shift+N` cycles targets. Arrows adjust, Enter saves, and Escape cancels.
- While editing a scale reference, choose an endpoint with the selector or `N`, adjust with arrows, and press Enter to use the Save workflow.

Navigation, pointer interaction, selection changes, or loss of focus cancel pending keyboard edits.
