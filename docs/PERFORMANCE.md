# Plan Measure Performance

Protection is split into three layers. Deterministic counts and size are checked
in CI. The browser benchmark runs separately: it takes several minutes and its
results depend on the machine, temperature, browser, and background load. A
failure must be investigated; it is not a reason to widen budgets or to
automatically regenerate the baseline.

## 1. Vitest counts

`npm test` includes `src/performance/` and the golden label fixtures. It uses no
millisecond limits. The synthetic sessions have a fixed seed and 5,000
measurements. It protects:

- Ungrouped and grouped panel: at most 40 rows and 1,000 mounted DOM nodes.
- ID→measurement index and grouping: ID reads bounded to 6×N; the cost between
  1,000 and 5,000 rows does not grow by more than 5.1×.
- Culling: a fixed 300×300 viewport mounts at most 50 shapes out of 5,000,
  keeping a selected measurement outside the viewport.
- Session commands: 5,000 consumers receive no notifications for preference,
  edit, or undo changes; the current state and semantics are preserved.
- Autosave: exactly one JSON serialization to prepare and write the snapshot;
  also verifies the persisted session.
- CSV: each batch contains at most 200 rows, 25 yields for 5,000 rows,
  byte-for-byte equality with the canonical generator, and a fixed SHA-256.
- Labels: deterministic golden output to prevent changes in positions,
  priorities, and visibility. With 5,000 measurements it requires one layout run
  per new zoom and none additional per pan; it does not presuppose a global cache
  or a transient transform that would alter those outputs.

These tests do not represent the cost of painting on a real GPU. The Konva mount
test uses a simulated renderer to count shapes; the third layer observes mounting
in the real application. A hash/golden failure requires reviewing the contract,
not accepting a new snapshot without explanation.

## 2. JavaScript size

```sh
npm run build
npm run perf:size
npm run perf:selftest
```

`perf/size.mjs` reads the JS in `dist/index.html` and walks its static imports,
excluding `import()`. The main chunk must weigh ≤480,000 bytes and ≤140,000 bytes
gzip. The initial JS set must weigh ≤511,660 bytes: the original reference is
487,295 bytes (main + runtime + format) with a 5% margin. These are decimal bytes,
not KiB. The limit does not include CSS or demo resources.

If the check fails, load the new heavy component lazily (`recoverableLazy`) instead of raising the limits.

It also rejects PDF chunks, the PDF worker, pdf-lib/annotatedPdf, and XLSX in that
graph. The `es-*.js` chunk currently corresponds to the ESM entry of pdf-lib and
is explicitly protected. It also includes `modulepreload` preloads declared in
HTML. The third layer watches the real requests before a PDF is opened. Chunk
names are an indicator; if the bundling strategy changes, both detectors must be
reviewed. Dependencies bundled into the main chunk remain subject to the byte
budget.

`perf:selftest` tests the verifiers against violated budgets: +1 byte, a static
pdf-lib import, +31% pauses/long tasks, incomplete samples, and FPS below the
minimum (normal warning and strict failure). It runs with Node, outside Vitest,
and does not need Playwright.

## 3. Separate e2e benchmark

```sh
npm ci --prefix perf
./perf/node_modules/.bin/playwright install chromium
npm run build
npm run perf:e2e
```

The only additional dependencies are in `perf/package.json` and its lockfile; no
production dependencies are added to the project package. Requires Node 24. By
default it starts its own preview on port 4183 and shuts it down when it
finishes. `PLAN_MEASURE_REPO` allows measuring another already-built checkout;
`PERF_PORT` changes the port. `PERF_URL` allows an existing preview, whose update
is the responsibility of whoever runs the test.

The benchmark generates PDFs F and C in `perf/.tmp/`, which is ignored by Git. C
contains a gray A0 raster of 9,933×14,043 pixels, 16 levels of deterministic
noise, and ASCII85/Flate, approximately 95 MiB. It uses no artificial padding and
does not copy fixtures from the external harness. Sessions use the deterministic
geometry of the previous harness: lines, polylines, and 24-vertex polygons. The
seed 20261009 is kept. The annotations phase reopens the IndexedDB session; if the
engine cannot persist Blobs, it explicitly declares the seed in memory. That
fallback allows measuring painting, but does not demonstrate recovery or CAS.

Each of the five samples uses a new context, Chromium at 1440×900, DPR 2, CPU 1x
and 4x. For M1000 and M5000 it measures wheel zoom, middle-button pan, vertex
drag, the first CSV export after the drag, closing the CSV dialog, and opening the
panel. CSV includes the initial download of the dialog chunk. It also opens C at
both CPU rates and measures heap after loading. It checks that pan and drag change
the visual session and that zoom has observed transformations; page errors make
the run fail.

It records DOM nodes, IDs of mounted shapes, number of long tasks, maximum pause,
heap, duration, and rAF FPS. The shape count walks both React roots (DOM and
Konva) and the `measurement` prop IDs; a structural change must update the probe.
Long tasks and maximum pause include 350 ms of post-gesture consolidation; FPS and
duration end when the action completes. Pan also stores the raw acquisition
(`mouse.down`) and end (`mouse.up`) times, including CDP roundtrips; these are
diagnostics and add no time budgets. It does not measure RSS, peak memory, or
frames actually presented by the GPU.

Before each context, it runs seven samples of a whole-operation microbenchmark and
uses their median. Durations are normalized by the ratio between reference and
current calibration; FPS by its inverse. Counts and heap are not normalized. This
correction reduces CPU differences; it does not eliminate differences in GPU,
network, GC, OS, or automation overhead, and it should be treated as a secondary
signal.

Compares the medians of five samples with `perf/baseline.json`. Fails on a
regression

> 30% of metrics (for small counts, 2 long tasks, 10 shapes, or 20 additional nodes
> are tolerated). FPS fails with a drop >30%. In normal mode, the absolute targets
> M1000/4x ≥30 FPS and M5000/1x ≥30 FPS on the real unnormalized median
> (`rawMedianFps`) produce visible warnings in the console and in the GitHub Actions
> summary, without blocking the run. The initial baseline is still below both. Only
> strict mode additionally requires those minimums:

```sh
npm run perf:e2e:strict
# Equivalent: npm run perf:e2e -- --strict
```

Both modes fail on relative regressions, incomplete samples, or interaction,
startup, and PDF errors. Calibration cannot turn an unmet real minimum into a
reached target. Updating the baseline does not change the minimums.
`perf/results/latest.json` stores the raw samples and medians; it is not versioned.
The versioned baseline includes the browser, fixtures, calibration, source commit,
pending diff, Node/OS, and SHA-256 hashes of index.html and the initial chunks, to
identify the build and interpret differences. If `sourceDirty` is true, the commit
alone does not describe the source; the hashes identify the measured artifact.
This data is informational: switching commits, having a source diff, or merging
to main does not invalidate the comparison or require regenerating the baseline.
The comparator validates the schema, samples, scenarios, and metrics, not this
metadata.

For a quick diagnostic, without comparing or updating the baseline:

```sh
PERF_SAMPLES=1 PERF_COUNT=1000 PERF_CPU=1 PERF_SKIP_PDF=1 npm run perf:e2e
```

`PERF_*` filters produce a partial run and are announced as such. They cannot
create a baseline. `PERF_BROWSER_CHANNEL=chrome` allows investigating an installed
Chromium; recording a different browser requires declaring that difference.

## Canvas rendering rules

react-konva compares props by identity and redraws the whole layer on any
attribute change; with thousands of measurements one redraw costs a visible frame.

- Do not pass new arrays or objects (`points`, `dash`, styles) to Konva nodes on
  every render of `PdfAnnotationLayer`; memoize them by their inputs.
- `MeasurementShape` is memoized with a custom comparator: pass it values that
  only change when that measurement changes (its calibration, not the page;
  getters through refs for flags such as `isSelectable`). Label placements are
  compared by value, except the occupied rect of selected shapes, which drags
  ignore by identity in the current plan.
- Per-measurement derivations (label data, snap targets) are cached in a
  `WeakMap` keyed by the immutable measurement; measurements are never mutated.
  The measurement panel caches formatted values the same way and checks the
  scale, display settings and number separators before reusing one. Polygon
  ring validation is cached per points array and recomputed if its coordinates
  differ.
- Labels are planned in page order, and `createLabelLayoutPlanner` reuses the
  previous plan up to the first measurement whose object or label data object
  changed. Keep label data objects stable: a new one places that label and every
  later label again.
- Unselected `MeasurementShape`s ignore `transform` (pan) and editing-permission
  changes: only handles and gestures of selected shapes read them, and
  deselection cancels gestures. Zoom still re-renders them through `zoom`.
- `konvaRuntime.ts` (aliased as `konva`) patches Konva: the Text baseline sample
  is measured once per font, and a Text inside `setAttrs` defers its layout and
  its Label/Tag sync until the call returns, so a zoom lays out each label once.
  Both are pure functions of the final attrs; check parity screenshots after
  upgrading Konva. A synchronous `Layer.draw` also satisfies the batched draw
  already queued for that layer, so its frame no longer draws the layer again;
  use `flushBatchDraw` to draw a layer now only when a batched draw is pending.
- `itsFineRuntime.ts` (aliased as `its-fine`) makes the context accessors that
  react-konva's bridge redefines configurable, so Stage renders do not throw and
  catch an exception per context.
- Drag release cleanup must run after Konva's own window release listener, which
  is added when a Stage mounts; the cleanup re-adds its listeners on every press
  so it stays behind. Cancelling first loses the dragend and the edit.

## Panel rules

- A closed Pages panel parks its thumbnail queue (`thumbnailRetention.ts`)
  instead of disposing it: work stops, but the LRU cache stays for the open
  document, so reopening paints every cached preview in its first render. Only
  one document's thumbnails are retained; the viewer shell releases them when
  the document changes.
- Hovering or focusing the Pages trigger prefetches the rows the panel shows
  first (`initialPageWindow`), and `setWindow` copies the main page's rendered
  background synchronously, so the panel opens without a placeholder cascade.
  Heavy documents keep their deferred previews.

## How to interpret and update a baseline

First check that `dist` matches the commit, that all five cases per scenario were
run, and that no other tests are competing for resources. Compare the counts
before attributing a failure to FPS noise. An increase in DOM/shapes usually
indicates a loss of virtualization/culling; an increase in long tasks with stable
counts points to additional synchronous work. Review calibration, browser, and raw
samples, and repeat on the same machine, without editing the baseline.

```sh
npm run perf:update-baseline
```

This is the only command that writes the baseline and requires the full matrix
with five samples. It is legitimate after a verified improvement or an intentional
change of the documented method/environment, with comparisons and diff review. It
is not legitimate to use it to hide a regression. Warnings for unmet targets are
kept. The update command only records evidence: afterwards, run `npm run perf:e2e`
to verify the budgets.

The `performance.yml` workflow runs size/selftests on PRs and main; e2e in normal
mode via `workflow_dispatch` and a weekly cron. Strict mode is optional, to enforce
the absolute target once it is reached. Shared runners are noisy, and normalization
does not turn them into a lab. A failure there requires confirmation before
accepting new references. It never updates the baseline automatically. The
scenarios are synthetic; CPU 4x does not identify a physical device. Playwright's
WebKit is not equivalent to Safari; this automated layer uses Chromium.
