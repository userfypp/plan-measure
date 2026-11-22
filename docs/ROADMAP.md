# Roadmap

Direction, not a promise: no dates, and priorities may change. The [issue tracker](https://github.com/userfypp/plan-measure/issues) is the source of truth; labels `priority: P0`–`P3` set the order.

## How to read this

Every issue has a type, an area and, once planned, a priority; [CONTRIBUTING.md](../CONTRIBUTING.md#labels) explains them. This page lists the work by priority. For any other slice, filter the [issue tracker](https://github.com/userfypp/plan-measure/issues) by label.

## Assigned

Taken by a contributor; leave these to them. Want another issue? Comment on it and wait for the assignment before starting.

| Issue                                                       | Work                                                         | Assignee                                              | Priority |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- | -------- |
| [#382](https://github.com/userfypp/plan-measure/issues/382) | Cover rejection paths and no-op identity in session commands | [AnushreeKasturi](https://github.com/AnushreeKasturi) | P2       |
| [#397](https://github.com/userfypp/plan-measure/issues/397) | Cover small viewer components, hooks and runtime helpers     | [AnushreeKasturi](https://github.com/AnushreeKasturi) | P3       |

## Bugs

The P2 bugs come first. All of them are in the [open bugs](https://github.com/userfypp/plan-measure/issues?q=is%3Aissue+is%3Aopen+label%3Abug), with the P3 ones.

| Issue                                                       | Bug                                                  | Area         |
| ----------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| [#502](https://github.com/userfypp/plan-measure/issues/502) | Wheel zoom is nearly unusable with line-based wheels | Viewer       |
| [#511](https://github.com/userfypp/plan-measure/issues/511) | The smoke job does not gate Pages or releases        | CI           |
| [#514](https://github.com/userfypp/plan-measure/issues/514) | Count item names are missing from exports            | Measurements |
| [#530](https://github.com/userfypp/plan-measure/issues/530) | Undo and Redo shortcuts run behind open dialogs      | UI           |

## Next (P2)

| Order | Issue                                                       | Work                                               | Notes                                                      |
| ----- | ----------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| 1     | [#235](https://github.com/userfypp/plan-measure/issues/235) | Text, callout and arrow markups                    |                                                            |
| 2     | [#236](https://github.com/userfypp/plan-measure/issues/236) | Highlight and stamp markups                        | After #235; schema migration                               |
| –     | [#234](https://github.com/userfypp/plan-measure/issues/234) | Small-screen and touch layout                      | Layout only; touch drawing later; part done (phone layout) |
| –     | [#503](https://github.com/userfypp/plan-measure/issues/503) | Snap and constrain to Ortho when dragging vertices |                                                            |
| –     | [#504](https://github.com/userfypp/plan-measure/issues/504) | Pan and pinch-zoom on touch and Safari trackpads   |                                                            |
| –     | [#251](https://github.com/userfypp/plan-measure/issues/251) | Pages exceeds pause and memory budgets             | Cause still unknown                                        |

## Later (P3)

| Issue                                                       | Work                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| [#231](https://github.com/userfypp/plan-measure/issues/231) | UI translations, Spanish first                              |
| [#216](https://github.com/userfypp/plan-measure/issues/216) | Visual walkthrough page                                     |
| [#497](https://github.com/userfypp/plan-measure/issues/497) | Warn when Compare pages differ in size                      |
| [#506](https://github.com/userfypp/plan-measure/issues/506) | Shortcuts on non-Latin keyboard layouts                     |
| [#507](https://github.com/userfypp/plan-measure/issues/507) | Keep high zoom sharp on large plans                         |
| [#508](https://github.com/userfypp/plan-measure/issues/508) | Import a `.planmeasure` file by dropping it                 |
| [#509](https://github.com/userfypp/plan-measure/issues/509) | Offer a reload when a new version is ready                  |
| [#510](https://github.com/userfypp/plan-measure/issues/510) | Warn about conflicting tabs before editing                  |
| [#513](https://github.com/userfypp/plan-measure/issues/513) | Document which versions `perf` and `revert` commits produce |
| [#515](https://github.com/userfypp/plan-measure/issues/515) | CSV export errors name the invalid measurement              |
| [#524](https://github.com/userfypp/plan-measure/issues/524) | Hover-style background on the focused page in Pages         |

## Test coverage

Test work is tracked in [#487](https://github.com/userfypp/plan-measure/issues/487), with one sub-issue per area. Each is a checklist that several pull requests can share. Filter them with the [`test`](https://github.com/userfypp/plan-measure/labels/test) label. Also in #487: [#277](https://github.com/userfypp/plan-measure/issues/277) numerical conservation (remaining: 16–17-digit and subnormal ratios) and [#278](https://github.com/userfypp/plan-measure/issues/278) IME and auxiliary mouse buttons.

| Priority | Issue                                                       | Work                                                                   | Notes                                                        |
| -------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| P1       | [#375](https://github.com/userfypp/plan-measure/issues/375) | Cover Undo and Redo semantics for every session command                | Part done (#413)                                             |
| P1       | [#376](https://github.com/userfypp/plan-measure/issues/376) | Cover project open, close, discard and recovery failures               | Part done (#416)                                             |
| P1       | [#377](https://github.com/userfypp/plan-measure/issues/377) | Pin geometry, coordinate, unit and format math with independent values | Part done (#410–#412)                                        |
| P2       | [#381](https://github.com/userfypp/plan-measure/issues/381) | Set up test infrastructure, coverage and CI gates                      | Do first; part done (#422–#426, #439, #441, #442, #445–#447) |
| P2       | [#382](https://github.com/userfypp/plan-measure/issues/382) | Cover rejection paths and no-op identity in session commands           | Assigned; part done (#460)                                   |
| P2       | [#383](https://github.com/userfypp/plan-measure/issues/383) | Cover workspace, clipboard, overlay and theme state                    | Good first issue                                             |
| P2       | [#384](https://github.com/userfypp/plan-measure/issues/384) | Make autosave and close-prompt tests deterministic and complete        |                                                              |
| P2       | [#385](https://github.com/userfypp/plan-measure/issues/385) | Cover app hooks, preferences and startup modules                       | Part done (#415, #417–#419)                                  |
| P2       | [#386](https://github.com/userfypp/plan-measure/issues/386) | Cover app-level flows, dialogs and settings                            |                                                              |
| P2       | [#387](https://github.com/userfypp/plan-measure/issues/387) | Test shape selection, mouse buttons and drag previews with real Konva  | Part done (#429); see #278, #295                             |
| P2       | [#388](https://github.com/userfypp/plan-measure/issues/388) | Cover PdfViewer zoom, pan, keyboard and page-change behaviour          | Part done (#428, #440)                                       |
| P2       | [#389](https://github.com/userfypp/plan-measure/issues/389) | Cover snapping, dragging and keyboard geometry edge cases              |                                                              |
| P2       | [#390](https://github.com/userfypp/plan-measure/issues/390) | Cover annotated PDF placement, labels and download                     | See #373                                                     |
| P2       | [#391](https://github.com/userfypp/plan-measure/issues/391) | Cover the Measurements list, filters, grouping and details             | Part done (#427)                                             |
| P2       | [#392](https://github.com/userfypp/plan-measure/issues/392) | Cover scale dialogs, ratios, scale check and the page browser          | Part done (#435)                                             |
| P2       | [#393](https://github.com/userfypp/plan-measure/issues/393) | Cover classification manager, templates and name rules                 | Part done (#434)                                             |
| P2       | [#394](https://github.com/userfypp/plan-measure/issues/394) | Cover Dialog, Popover, Tooltip, menus and keyboard policy              |                                                              |
| P2       | [#395](https://github.com/userfypp/plan-measure/issues/395) | Cover UI controls and theme contrast gates                             | Good first issue                                             |
| P2       | [#516](https://github.com/userfypp/plan-measure/issues/516) | Cover Find similar overlay and session                                 |                                                              |
| P2       | [#517](https://github.com/userfypp/plan-measure/issues/517) | Cover Compare overlay and diff session                                 |                                                              |
| P2       | [#519](https://github.com/userfypp/plan-measure/issues/519) | Cover the viewer dock container, Count item toolbar and overlay host   |                                                              |
| P3       | [#396](https://github.com/userfypp/plan-measure/issues/396) | Tighten tests for toolbars, status and workspace shells                |                                                              |
| P3       | [#397](https://github.com/userfypp/plan-measure/issues/397) | Cover small viewer components, hooks and runtime helpers               | Assigned; part done (#459)                                   |
| P3       | [#398](https://github.com/userfypp/plan-measure/issues/398) | Cover label layout, quick shapes and cloud outlines                    |                                                              |
| P3       | [#400](https://github.com/userfypp/plan-measure/issues/400) | Test performance budgets and release automation scripts                |                                                              |
| P3       | [#518](https://github.com/userfypp/plan-measure/issues/518) | Cover page raster and worker clients                                   |                                                              |
| P3       | [#520](https://github.com/userfypp/plan-measure/issues/520) | Cover persistence codec validation branches                            |                                                              |

## Open to contributors

Start with the [`good first issue`](https://github.com/userfypp/plan-measure/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) ones. The rest of the [`help wanted`](https://github.com/userfypp/plan-measure/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) issues are mostly the test checklists below; the ones in the Assigned table are taken.

## Principles

- Plans stay in the browser: no uploads, no accounts.
- Performance budgets and golden tests are contracts; see [PERFORMANCE.md](PERFORMANCE.md).
- Project files stay backward compatible; schema changes ship with a migration.

## Get involved

Pick an issue labeled [`good first issue`](https://github.com/userfypp/plan-measure/labels/good%20first%20issue) or [`help wanted`](https://github.com/userfypp/plan-measure/labels/help%20wanted), and read [CONTRIBUTING.md](../CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Propose new ideas in [Discussions](https://github.com/userfypp/plan-measure/discussions) or open an issue asking for whatever you want, and I will answer as fast as I can. Contributors can be listed in [CREDITS.md](../CREDITS.md).
