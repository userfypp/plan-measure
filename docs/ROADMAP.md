# Roadmap

Direction, not a promise: no dates, and priorities may change. The source of truth is the [issue tracker](https://github.com/userfypp/plan-measure/issues); labels `priority: P0`–`P3` set the order.

## Now: reliability and correctness

Open findings from the code audits, grouped by area. Most are open to contributors.

- **Interaction:** [#264](https://github.com/userfypp/plan-measure/issues/264) Cloud snapping, [#272](https://github.com/userfypp/plan-measure/issues/272) right-click selection, [#294](https://github.com/userfypp/plan-measure/issues/294) Finish on double-click, [#297](https://github.com/userfypp/plan-measure/issues/297) handle size and hit area, [#305](https://github.com/userfypp/plan-measure/issues/305) selection cleared when a pan leaves the viewer.
- **View:** [#295](https://github.com/userfypp/plan-measure/issues/295) drag previews without label prefixes, [#296](https://github.com/userfypp/plan-measure/issues/296) page grid while panning, [#300](https://github.com/userfypp/plan-measure/issues/300) maximum zoom changes.
- **Data and settings:** [#299](https://github.com/userfypp/plan-measure/issues/299) Undo history depth, [#302](https://github.com/userfypp/plan-measure/issues/302) imported group collapse, [#303](https://github.com/userfypp/plan-measure/issues/303) recovered invalid Lines exported as zero.
- **Resources and loading:** [#250](https://github.com/userfypp/plan-measure/issues/250) cached module failures, [#251](https://github.com/userfypp/plan-measure/issues/251) Pages pause and memory budgets.

## Contributor work

- **Documentation and cleanup:** [#246](https://github.com/userfypp/plan-measure/issues/246) Measurements scope, [#247](https://github.com/userfypp/plan-measure/issues/247) PDF size units, [#248](https://github.com/userfypp/plan-measure/issues/248) outdated FPS claim, [#249](https://github.com/userfypp/plan-measure/issues/249) unused code and duplicate helpers.
- **Integration tests:** [#275](https://github.com/userfypp/plan-measure/issues/275) storage failures, [#276](https://github.com/userfypp/plan-measure/issues/276) panel history, [#277](https://github.com/userfypp/plan-measure/issues/277) numerical conservation, [#278](https://github.com/userfypp/plan-measure/issues/278) browser input, [#279](https://github.com/userfypp/plan-measure/issues/279) PDF loading failures, [#280](https://github.com/userfypp/plan-measure/issues/280) malformed projects, [#281](https://github.com/userfypp/plan-measure/issues/281) real PDF viewports.
- **Helper tests:** [#252](https://github.com/userfypp/plan-measure/issues/252) Cloud colours, [#253](https://github.com/userfypp/plan-measure/issues/253) classification names, [#254](https://github.com/userfypp/plan-measure/issues/254) measurement names, [#255](https://github.com/userfypp/plan-measure/issues/255) page windows, [#256](https://github.com/userfypp/plan-measure/issues/256) takeoff summaries.

## Next (P2)

- [#235](https://github.com/userfypp/plan-measure/issues/235) Text, callout and arrow markups, then [#236](https://github.com/userfypp/plan-measure/issues/236) highlights and stamps (builds on #235; needs a schema migration)
- Takeoff: [#320](https://github.com/userfypp/plan-measure/issues/320) derived quantities per classification, then [#321](https://github.com/userfypp/plan-measure/issues/321) unit prices and costs (both need a schema migration), and [#322](https://github.com/userfypp/plan-measure/issues/322) counting symbols in one pass
- [#229](https://github.com/userfypp/plan-measure/issues/229) Persistent undo history
- [#230](https://github.com/userfypp/plan-measure/issues/230) Customizable keyboard shortcuts
- [#234](https://github.com/userfypp/plan-measure/issues/234) Small-screen and touch layout (layout only; full touch drawing comes later)

## Later (P3)

- [#231](https://github.com/userfypp/plan-measure/issues/231) UI translations, Spanish first
- [#289](https://github.com/userfypp/plan-measure/issues/289) Movable measurement labels
- [#323](https://github.com/userfypp/plan-measure/issues/323) Compare two versions of a plan
- [#216](https://github.com/userfypp/plan-measure/issues/216) Visual walkthrough page
- [#257](https://github.com/userfypp/plan-measure/issues/257) Installable PWA, tested on Windows in CI

## Principles

- Plans stay in the browser: no uploads, no accounts.
- Performance budgets and golden tests are contracts; see [PERFORMANCE.md](PERFORMANCE.md).
- Project files stay backward compatible; schema changes ship with a migration.

## Get involved

Pick an issue labeled [`good first issue`](https://github.com/userfypp/plan-measure/labels/good%20first%20issue) or [`help wanted`](https://github.com/userfypp/plan-measure/labels/help%20wanted), and read [CONTRIBUTING.md](../CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Propose new ideas in [Discussions](https://github.com/userfypp/plan-measure/discussions) or open a issue asking for whatever you want and I will answer the fast I can.
