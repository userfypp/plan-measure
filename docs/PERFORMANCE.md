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
- Annotation layer props (`annotationLayerProps.test.tsx`): drives the real
  `App` through drawing, selection, editing, zoom, pan, menus, panel actions,
  undo and page changes, and fixes which `PdfAnnotationLayer` props each step may
  change. Callbacks and fixed values keep one identity for the whole session.
- Measurement shape renders (`layerRenders.test.tsx`): with 1,000 measurements in
  the real layer, mounting renders each shape once; identical props, pan and tool
  switches render none; a selection change renders only the measurements that
  enter, leave or change group; adding, editing or hiding one measurement renders
  only that one; zoom renders each visible shape once.

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

`perf/size.mjs` reads the JS in `dist/index.html`, walks its static imports
(excluding `import()`) and measures four metrics in decimal bytes, not KiB. CSS
and demo resources are not counted.

- `mainBytes` and `mainGzipBytes`: the main chunk, raw and gzip.
- `startupBytes`: the initial JS set, the main chunk plus its static imports and
  `modulepreload` preloads.
- `viewerBytes`: what opening a plan loads on top of startup, the
  `PdfViewer-*.js` chunk plus its static imports that are not already in the
  initial set (PDF.js, canvas roles). A full Konva import or a heavy dependency
  pulled into the viewer shows up here.

The numbers live in `perf/size-budget.json` and work in three parts:

1. **Growth per pull request** (`sizeGrowthAllowance`): 250 B gzip and 750 B raw
   for the main chunk, 750 B for startup and 500 B for the viewer. On `main`'s
   history every feature grew more (from 541 B gzip) and 20 of 22 fixes grew
   less (at most 91 B gzip). More growth needs the `size: approved` label.
2. **Ceilings** (`sizeLimits`): every build must fit. A ceiling is set to the
   measured size plus four allowances (`ceilingHeadroom.target`), so small
   unapproved growth accumulates until it reaches the ceiling. Raising a ceiling
   is a deliberate decision that needs the label.
3. **Ratchet**: when a build is more than six allowances
   (`ceilingHeadroom.maximum`) below a ceiling, `perf:size` fails until the
   ceiling is lowered to the new size plus four allowances, in the same pull
   request. Savings of two allowances or more are kept; smaller ones need no edit.

Gzip moves by a few bytes when other chunks change their hashed names; the
per-pull-request comparison and the headroom absorb that noise, so no check turns
on a handful of bytes.

On pull requests, CI also builds the base (the first parent of the merge commit it
checks out) in a temporary worktree, measures it with the same code and runs
`npm run perf:size:diff`. The job summary shows base, pull request, difference,
allowance and ceiling for each metric. Without the `size: approved` label it
fails when:

- a metric grows by more than its allowance;
- a ceiling, allowance or headroom value goes up or disappears, or
  `forbiddenStartup` changes;
- the budget code changes: `perf/budgets.mjs`, `perf/size.mjs`,
  `perf/size-diff.mjs` or `.github/workflows/performance.yml`.

Lowering ceilings, allowances or headroom and adding a metric need no label. The
maintainer adds the label after reviewing that the growth is worth it; agents and
contributors never add it themselves. Adding or removing the label re-runs the
check.

The same comparison runs locally against any revision:

```sh
npm run build
npm run perf:size:diff -- --base origin/main
```

It reuses `node_modules` when `package-lock.json` matches the base and otherwise
runs `npm ci` in the worktree. CI is the reference: gzip can differ by a few bytes
between Node versions.

If a check fails, first load the new heavy component lazily (`recoverableLazy`)
or split the code; ask for the label only when the growth is justified.

It also rejects PDF chunks, the PDF worker, pdf-lib/annotatedPdf, and XLSX in that
graph. The `es-*.js` chunk currently corresponds to the ESM entry of pdf-lib and
is explicitly protected. It also includes `modulepreload` preloads declared in
HTML. The third layer watches the real requests before a PDF is opened. Chunk
names are an indicator; if the bundling strategy changes, both detectors must be
reviewed. Dependencies bundled into the main chunk remain subject to the byte
budget.

`perf:selftest` tests the verifiers against violated budgets: +1 byte over a
ceiling, a ceiling one byte too high for the ratchet, growth one byte over an
allowance, every way of loosening the budget, a static pdf-lib import, +31%
pauses/long tasks, incomplete samples, and FPS below the minimum (normal warning
and strict failure). It also checks that the workflow reads the same label and
compares with the merge base. It runs with Node, outside Vitest, and does not need
Playwright.

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
- Props that only a selected shape uses are passed to selected shapes only:
  `groupMeasurements` is a new array on every multi-selection change and would
  render every measurement again.
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

## Adding features without losing performance

The counts above only protect what they cover. Before merging a feature that
touches startup, the viewer, the canvas or the panels, check each point:

1. **Startup stays small.** Every pull request has a small growth allowance and
   the ceilings only leave a few allowances of headroom (see section 2). A new
   panel, dialog, workspace or dependency goes behind
   `retryableImport` + `recoverableLazy` and is preloaded on intent (hover or
   focus of its trigger) or with `preloadWhenIdle`, so it opens without a
   Suspense fallback. UI that only renders once the viewer is up ships in the
   viewer chunk (the dock is re-exported from `PdfViewer` and preloaded with it
   through `viewerModule.ts`). If a size check fails, split the code; raising a
   ceiling or going over an allowance needs the maintainer's `size: approved`
   label.
2. **Props of `PdfAnnotationLayer` keep their identity.** It is `memo` and
   compares thousands of shapes when any prop changes. Callbacks use
   `useCallback` with ref-backed getters for changing state; arrays and objects
   are memoized by their inputs; reducer cases return the existing value when
   nothing changed (an empty selection keeps its array). A new prop or
   interaction adds a step to `annotationLayerProps.test.tsx` listing exactly
   the props it may change; a step that should not touch the layer lists none.
3. **Each `MeasurementShape` receives only what changes with it.** Pass
   per-measurement values (its calibration, its label placement), not page-wide
   ones. A prop that only matters while selected goes to selected shapes only,
   or is added to the comparator's unselected list with the reason. A new
   interaction adds a case to `layerRenders.test.tsx`; the expected list is the
   measurements whose output really changes.
4. **Derived data is cached by identity.** Per-measurement derivations live in
   a `WeakMap` keyed by the immutable measurement; session edits keep unchanged
   objects (measurements, calibrations, label data) so caches, the label planner
   and the shape comparator can reuse them. Never mutate a measurement.
5. **Konva stays minimal.** Import nodes from `konva/lib/...`; a new node type is
   registered in `konvaRuntime.ts` before use. Request draws with `batchDraw`;
   when a layer must be painted now (raster swaps), use `flushBatchDraw` so the
   pending frame does not draw it again. The dev server serves react-konva
   unbundled (`optimizeDeps` in `vite.config.ts`) so it shares the app's Konva
   and runtime patches, which apply once per Konva; still measure canvas changes
   on a build, and check parity screenshots after upgrading Konva.
6. **Lists stay virtual.** Panels mount at most the visible rows plus overscan,
   and cache formatted values by measurement and display settings.
7. **Motion only hides waits, never adds them.** Animate opacity only (never
   transform: it slows the e2e timings and makes automation wait for movement).
   One-time entrances use WAAPI through `src/utils/reveal.ts`; menus and
   popovers use the CSS `overlayEnter` fade. Loading overlays wait
   `--loading-reveal-delay` before appearing, so fast loads show nothing. Both
   reduced-motion paths (system preference and `data-motion="reduce"`) must
   disable the animation.
8. **Verify on a heavy session.** Run lint, tests and build. For interaction
   changes, profile a 1,000-measurement session at CPU×4 against the base
   commit, and run `npm run perf:e2e` when the change is large. A failing
   contract test (`src/performance/`, label goldens, CSV hash,
   `konvaRuntime.layer.test.ts`) means the change regressed or the contract must
   be discussed: find the cause before touching the expectation.

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

The `performance.yml` workflow runs the size checks and selftests on PRs and main
(the comparison with the base only on PRs); e2e in normal mode via
`workflow_dispatch` and a weekly cron. Strict mode is optional, to enforce
the absolute target once it is reached. Shared runners are noisy, and normalization
does not turn them into a lab. A failure there requires confirmation before
accepting new references. It never updates the baseline automatically. The
scenarios are synthetic; CPU 4x does not identify a physical device. Playwright's
WebKit is not equivalent to Safari; this automated layer uses Chromium.
