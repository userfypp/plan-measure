# JSON data export

**Export → Format → JSON data** downloads `<PDF name>-data.json` as UTF-8 JSON. This is a public data contract for analysis and integrations, with its own `schemaVersion: 1`. Recoverable `.planmeasure` project files use a separate format; this JSON does not embed the PDF or restore the application workspace.

All pages, calibrations, measurements (including hidden measurements), and classification dimensions and values (including archived entries) are included. CSV column preferences and display units do not affect JSON. Numbers retain JavaScript's full numeric precision without display rounding. Strings, including notes, Unicode and formula-like text, are preserved exactly.

## Schema version 1

| Field                   | Contents                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`         | Integer `1`; independent of the saved session schema.                                                                                                                        |
| `pdf`                   | `{name: string, size: number, lastModified: number}`: source PDF name, byte size and modification time in milliseconds since the Unix epoch. No PDF blob.                    |
| `pageCount`             | Positive integer number of PDF pages.                                                                                                                                        |
| `coordinateSystem`      | `{space: "pdf-page", rotation: "intrinsic", logicalScale: 1, units: "page-unit", xAxis: "right", yAxis: "down"}`. Applies to every calibration point and measurement vertex. |
| `pages`                 | Array of every page in ascending order, with one-based `pageNumber`, `pageLabel`, `calibrations` and `measurements`. Uninitialized pages have empty arrays.                  |
| `classificationCatalog` | `{dimensions: [...]}` with every dimension and value, in catalog order.                                                                                                      |

`pageLabel` is a string resolved from the custom page label first, then the PDF's page label, then `""` when neither exists.

Points are `{x: number, y: number}` in the stable PDF page coordinate system produced using the page's intrinsic rotation at logical scale 1. X increases rightward and Y downward. These page units are neither screen pixels nor physical millimetres. Zoom, pan, device pixel ratio and temporary viewer rotation are excluded.

Each calibration has `id`, `name`, `mode`, `mmPerPageUnitX` and `mmPerPageUnitY`. In `uniform` mode it also has `start`, `end` and `referenceDistanceMm`, and both scale factors are equal. In `xy` mode it instead has `xReference` and `yReference`, each containing `start`, `end` and `referenceDistanceMm`. X/Y correction applies independently to the two axes; it does not model skew or perspective. Calibration IDs are unique within their page.

Each measurement has:

- `id`, `name`, `type` (`"line"`, `"polyline"` or `"polygon"`), and `visible` (boolean).
- `note` (string, or `null` when absent), `calibrationId` (the calibration used for this measurement on its page), `points` (ordered vertices) and `classificationValueIds` (assigned catalog value IDs).
- `lengthMm`, `perimeterMm` and `areaMm2`. Lines and polylines have a numeric length and `null` perimeter and area. Polygons have `null` length and numeric perimeter and area. Applicable zero results remain numeric zero. Results use the measurement's own calibration and canonical millimetres or square millimetres.

Measurement IDs are unique across all pages. A polygon's ring closes implicitly; its last vertex does not repeat its first vertex. Each classification dimension has `id`, `name`, `archived` and `values`; each value has `id`, `name` and `archived`. Dimension and value IDs are unique across the catalog. Assigned value IDs resolve to their containing dimensions, with at most one assigned value per dimension. Archived dimensions and values retain their IDs and assignments.

For example, one exported line within `pages[0].measurements` can be:

```json
{
  "id": "measurement-1",
  "name": "Wall",
  "note": null,
  "type": "line",
  "visible": false,
  "calibrationId": "scale-1",
  "points": [
    { "x": 0, "y": 0 },
    { "x": 3, "y": 4 }
  ],
  "classificationValueIds": ["value-1"],
  "lengthMm": 10,
  "perimeterMm": null,
  "areaMm2": null
}
```

Export fails when geometry or calibration is invalid, required references are missing or ambiguous, page numbering is inconsistent, or any exported number or derived quantity is nonfinite (`NaN` or infinity). Invalid numeric values are never silently converted to JSON `null`. Empty measurement collections are valid; JSON can export a document's calibrations and classification catalog without any measurements.
