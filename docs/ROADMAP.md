# Roadmap

Direction, not a promise: no dates, and priorities may change. The [issue tracker](https://github.com/userfypp/plan-measure/issues) is the source of truth; labels `priority: P0`–`P3` set the order.

## Assigned

No issue is assigned right now. Want one? Comment on it and wait for the assignment before starting.

## Now: open bugs

| Issue                                                       | Bug                                                        | Area            | Priority              |
| ----------------------------------------------------------- | ---------------------------------------------------------- | --------------- | --------------------- |
| [#373](https://github.com/userfypp/plan-measure/issues/373) | Annotated PDF export fails for cloud names outside Latin-1 | Viewer          | P2                    |
| [#374](https://github.com/userfypp/plan-measure/issues/374) | Undo records a step for commands that change nothing       | Measurements    | P2                    |
| [#272](https://github.com/userfypp/plan-measure/issues/272) | Right-clicking a measurement changes the selection         | Viewer          | P3 · good first issue |
| [#300](https://github.com/userfypp/plan-measure/issues/300) | Lowering maximum zoom does not update the view             | Viewer          | P3 · good first issue |
| [#302](https://github.com/userfypp/plan-measure/issues/302) | Collapsing one imported group collapses another            | Classifications | P3 · good first issue |
| [#295](https://github.com/userfypp/plan-measure/issues/295) | Drag previews drop label prefixes                          | Viewer          | P3                    |
| [#296](https://github.com/userfypp/plan-measure/issues/296) | The page grid disappears when panning large pages          | Viewer          | P3                    |

## Next (P2)

| Order | Issue                                                       | Work                                   | Notes                            |
| ----- | ----------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| 1     | [#320](https://github.com/userfypp/plan-measure/issues/320) | Derived quantities per classification  | Schema migration                 |
| 2     | [#321](https://github.com/userfypp/plan-measure/issues/321) | Unit prices and costs in Takeoff       | After #320; schema migration     |
| 3     | [#322](https://github.com/userfypp/plan-measure/issues/322) | Count symbols in one pass              |                                  |
| 4     | [#235](https://github.com/userfypp/plan-measure/issues/235) | Text, callout and arrow markups        |                                  |
| 5     | [#236](https://github.com/userfypp/plan-measure/issues/236) | Highlight and stamp markups            | After #235; schema migration     |
| –     | [#229](https://github.com/userfypp/plan-measure/issues/229) | Persistent undo history                |                                  |
| –     | [#230](https://github.com/userfypp/plan-measure/issues/230) | Customizable keyboard shortcuts        |                                  |
| –     | [#234](https://github.com/userfypp/plan-measure/issues/234) | Small-screen and touch layout          | Layout only; touch drawing later |
| –     | [#251](https://github.com/userfypp/plan-measure/issues/251) | Pages exceeds pause and memory budgets | Cause still unknown              |

## Later (P3)

| Issue                                                       | Work                                     |
| ----------------------------------------------------------- | ---------------------------------------- |
| [#231](https://github.com/userfypp/plan-measure/issues/231) | UI translations, Spanish first           |
| [#289](https://github.com/userfypp/plan-measure/issues/289) | Movable measurement labels               |
| [#323](https://github.com/userfypp/plan-measure/issues/323) | Compare two versions of a plan           |
| [#216](https://github.com/userfypp/plan-measure/issues/216) | Visual walkthrough page                  |
| [#257](https://github.com/userfypp/plan-measure/issues/257) | Installable PWA, tested on Windows in CI |

## Test coverage

A review of the whole test suite (October 2026) is grouped into the issues below, each a checklist that several pull requests can share. Filter them with the [`test`](https://github.com/userfypp/plan-measure/labels/test) label. Other open test issues: [#277](https://github.com/userfypp/plan-measure/issues/277) numerical conservation (remaining: 16–17-digit and subnormal ratios) and [#278](https://github.com/userfypp/plan-measure/issues/278) IME and auxiliary mouse buttons.

| Priority | Issue                                                       | Work                                                                   | Notes                                  |
| -------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| P1       | [#375](https://github.com/userfypp/plan-measure/issues/375) | Cover Undo and Redo semantics for every session command                |                                        |
| P1       | [#376](https://github.com/userfypp/plan-measure/issues/376) | Cover project open, close, discard and recovery failures               |                                        |
| P1       | [#377](https://github.com/userfypp/plan-measure/issues/377) | Pin geometry, coordinate, unit and format math with independent values |                                        |
| P1       | [#378](https://github.com/userfypp/plan-measure/issues/378) | Cover persistence failures and schema migrations with real older data  |                                        |
| P1       | [#379](https://github.com/userfypp/plan-measure/issues/379) | Cover CSV, spreadsheet, JSON and export dialog correctness             |                                        |
| P1       | [#380](https://github.com/userfypp/plan-measure/issues/380) | Assert Takeoff totals and groups in the model and the UI               | Includes #256                          |
| P2       | [#381](https://github.com/userfypp/plan-measure/issues/381) | Set up test infrastructure, coverage and CI gates                      | Do first: makes the rest cheaper       |
| P2       | [#382](https://github.com/userfypp/plan-measure/issues/382) | Cover rejection paths and no-op identity in session commands           |                                        |
| P2       | [#383](https://github.com/userfypp/plan-measure/issues/383) | Cover workspace, clipboard, overlay and theme state                    |                                        |
| P2       | [#384](https://github.com/userfypp/plan-measure/issues/384) | Make autosave and close-prompt tests deterministic and complete        |                                        |
| P2       | [#385](https://github.com/userfypp/plan-measure/issues/385) | Cover app hooks, preferences and startup modules                       |                                        |
| P2       | [#386](https://github.com/userfypp/plan-measure/issues/386) | Cover app-level flows, dialogs and settings                            |                                        |
| P2       | [#387](https://github.com/userfypp/plan-measure/issues/387) | Test shape selection, mouse buttons and drag previews with real Konva  | See #272, #278, #295                   |
| P2       | [#388](https://github.com/userfypp/plan-measure/issues/388) | Cover PdfViewer zoom, pan, keyboard and page-change behaviour          | See #296, #300                         |
| P2       | [#389](https://github.com/userfypp/plan-measure/issues/389) | Cover snapping, dragging and keyboard geometry edge cases              |                                        |
| P2       | [#390](https://github.com/userfypp/plan-measure/issues/390) | Cover annotated PDF placement, labels and download                     | See #373                               |
| P2       | [#391](https://github.com/userfypp/plan-measure/issues/391) | Cover the Measurements list, filters, grouping and details             | See #302                               |
| P2       | [#392](https://github.com/userfypp/plan-measure/issues/392) | Cover scale dialogs, ratios, scale check and the page browser          | Includes #255                          |
| P2       | [#393](https://github.com/userfypp/plan-measure/issues/393) | Cover classification manager, templates and name rules                 |                                        |
| P2       | [#394](https://github.com/userfypp/plan-measure/issues/394) | Cover Dialog, Popover, Tooltip, menus and keyboard policy              |                                        |
| P2       | [#395](https://github.com/userfypp/plan-measure/issues/395) | Cover UI controls and theme contrast gates                             |                                        |
| P3       | [#396](https://github.com/userfypp/plan-measure/issues/396) | Tighten tests for toolbars, status and workspace shells                |                                        |
| P3       | [#397](https://github.com/userfypp/plan-measure/issues/397) | Cover small viewer components, hooks and runtime helpers               |                                        |
| P3       | [#398](https://github.com/userfypp/plan-measure/issues/398) | Cover label layout, quick shapes and cloud outlines                    |                                        |
| P3       | [#399](https://github.com/userfypp/plan-measure/issues/399) | Add tests for small utility helpers                                    | Good first issue; see #252, #253, #254 |
| P3       | [#400](https://github.com/userfypp/plan-measure/issues/400) | Test performance budgets and release automation scripts                |                                        |

## Open to contributors

| Type                             | Issues                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Helper tests (good first issue)  | [#252](https://github.com/userfypp/plan-measure/issues/252) Cloud colours, [#253](https://github.com/userfypp/plan-measure/issues/253) classification names, [#254](https://github.com/userfypp/plan-measure/issues/254) measurement names, [#255](https://github.com/userfypp/plan-measure/issues/255) page windows, [#256](https://github.com/userfypp/plan-measure/issues/256) takeoff summaries, [#399](https://github.com/userfypp/plan-measure/issues/399) other small helpers |
| Documentation (good first issue) | [#246](https://github.com/userfypp/plan-measure/issues/246) Measurements scope, [#247](https://github.com/userfypp/plan-measure/issues/247) PDF size units, [#248](https://github.com/userfypp/plan-measure/issues/248) outdated FPS claim                                                                                                                                                                                                                                           |
| Bugs (good first issue)          | [#272](https://github.com/userfypp/plan-measure/issues/272), [#300](https://github.com/userfypp/plan-measure/issues/300), [#302](https://github.com/userfypp/plan-measure/issues/302)                                                                                                                                                                                                                                                                                                |

## Principles

- Plans stay in the browser: no uploads, no accounts.
- Performance budgets and golden tests are contracts; see [PERFORMANCE.md](PERFORMANCE.md).
- Project files stay backward compatible; schema changes ship with a migration.

## Get involved

Pick an issue labeled [`good first issue`](https://github.com/userfypp/plan-measure/labels/good%20first%20issue) or [`help wanted`](https://github.com/userfypp/plan-measure/labels/help%20wanted), and read [CONTRIBUTING.md](../CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Propose new ideas in [Discussions](https://github.com/userfypp/plan-measure/discussions) or open an issue asking for whatever you want, and I will answer as fast as I can. Contributors can be listed in [CREDITS.md](../CREDITS.md).
