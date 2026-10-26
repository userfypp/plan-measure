# Roadmap

Direction, not a promise: no dates, and priorities may change. The [issue tracker](https://github.com/userfypp/plan-measure/issues) is the source of truth; labels `priority: P0`–`P3` set the order.

## Assigned

| Issue                                                       | Title                                        | Assignee                                               | Priority |
| ----------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ | -------- |
| [#303](https://github.com/userfypp/plan-measure/issues/303) | Recovered invalid Lines are exported as zero | [@AnushreeKasturi](https://github.com/AnushreeKasturi) | P2       |

Want an unassigned issue? Comment on it and wait for the assignment before starting.

## Now: open bugs

| Issue                                                       | Bug                                                | Area            | Priority              |
| ----------------------------------------------------------- | -------------------------------------------------- | --------------- | --------------------- |
| [#303](https://github.com/userfypp/plan-measure/issues/303) | Recovered invalid Lines are exported as zero       | Measurements    | P2 · assigned         |
| [#272](https://github.com/userfypp/plan-measure/issues/272) | Right-clicking a measurement changes the selection | Viewer          | P3 · good first issue |
| [#300](https://github.com/userfypp/plan-measure/issues/300) | Lowering maximum zoom does not update the view     | Viewer          | P3 · good first issue |
| [#302](https://github.com/userfypp/plan-measure/issues/302) | Collapsing one imported group collapses another    | Classifications | P3 · good first issue |
| [#295](https://github.com/userfypp/plan-measure/issues/295) | Drag previews drop label prefixes                  | Viewer          | P3                    |
| [#296](https://github.com/userfypp/plan-measure/issues/296) | The page grid disappears when panning large pages  | Viewer          | P3                    |

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

## Open to contributors

| Type                             | Issues                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests (P2)                       | [#277](https://github.com/userfypp/plan-measure/issues/277) numerical conservation (remaining: 16–17-digit and subnormal ratios), [#278](https://github.com/userfypp/plan-measure/issues/278) IME and auxiliary mouse buttons                                                                                                                                                                       |
| Helper tests (good first issue)  | [#252](https://github.com/userfypp/plan-measure/issues/252) Cloud colours, [#253](https://github.com/userfypp/plan-measure/issues/253) classification names, [#254](https://github.com/userfypp/plan-measure/issues/254) measurement names, [#255](https://github.com/userfypp/plan-measure/issues/255) page windows, [#256](https://github.com/userfypp/plan-measure/issues/256) takeoff summaries |
| Documentation (good first issue) | [#246](https://github.com/userfypp/plan-measure/issues/246) Measurements scope, [#247](https://github.com/userfypp/plan-measure/issues/247) PDF size units, [#248](https://github.com/userfypp/plan-measure/issues/248) outdated FPS claim                                                                                                                                                          |
| Bugs (good first issue)          | [#272](https://github.com/userfypp/plan-measure/issues/272), [#300](https://github.com/userfypp/plan-measure/issues/300), [#302](https://github.com/userfypp/plan-measure/issues/302)                                                                                                                                                                                                               |

## Principles

- Plans stay in the browser: no uploads, no accounts.
- Performance budgets and golden tests are contracts; see [PERFORMANCE.md](PERFORMANCE.md).
- Project files stay backward compatible; schema changes ship with a migration.

## Get involved

Pick an issue labeled [`good first issue`](https://github.com/userfypp/plan-measure/labels/good%20first%20issue) or [`help wanted`](https://github.com/userfypp/plan-measure/labels/help%20wanted), and read [CONTRIBUTING.md](../CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Propose new ideas in [Discussions](https://github.com/userfypp/plan-measure/discussions) or open an issue asking for whatever you want, and I will answer as fast as I can. Contributors can be listed in [CREDITS.md](../CREDITS.md).
