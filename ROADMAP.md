# Roadmap

Direction, not a promise: no dates, and priorities may change. The source of truth is the [issue tracker](https://github.com/userfypp/plan-measure/issues); labels `priority: P0`–`P3` set the order.

## Now: audit follow-ups

Small fixes and cleanups from the last audit. Most are open to contributors.

- [#246](https://github.com/userfypp/plan-measure/issues/246) Measurements scope wording · [#247](https://github.com/userfypp/plan-measure/issues/247) MiB in the PDF limit · [#248](https://github.com/userfypp/plan-measure/issues/248) outdated FPS diagnosis
- [#249](https://github.com/userfypp/plan-measure/issues/249) dead and duplicated code
- [#250](https://github.com/userfypp/plan-measure/issues/250) recovery from failed module loads (P2)
- [#251](https://github.com/userfypp/plan-measure/issues/251) Pages pause and memory deviations (P2)

## Next (P2)

- [#235](https://github.com/userfypp/plan-measure/issues/235) Text, callout and arrow markups, then [#236](https://github.com/userfypp/plan-measure/issues/236) highlights and stamps (builds on #235; needs a schema migration)
- [#229](https://github.com/userfypp/plan-measure/issues/229) Persistent undo history
- [#230](https://github.com/userfypp/plan-measure/issues/230) Customizable keyboard shortcuts
- [#234](https://github.com/userfypp/plan-measure/issues/234) Small-screen and touch layout (layout only; full touch drawing comes later)

## Later (P3)

- [#231](https://github.com/userfypp/plan-measure/issues/231) UI translations, Spanish first
- [#216](https://github.com/userfypp/plan-measure/issues/216) Visual walkthrough page
- [#257](https://github.com/userfypp/plan-measure/issues/257) Installable PWA, tested on Windows in CI

## Principles

- Plans stay in the browser: no uploads, no accounts.
- Performance budgets and golden tests are contracts; see [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- Project files stay backward compatible; schema changes ship with a migration.

## Get involved

Pick an issue labeled [`good first issue`](https://github.com/userfypp/plan-measure/labels/good%20first%20issue) or [`help wanted`](https://github.com/userfypp/plan-measure/labels/help%20wanted), and read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Propose new ideas in [Discussions](https://github.com/userfypp/plan-measure/discussions) or open a issue asking for whatever you want and I will answer the fast I can.
