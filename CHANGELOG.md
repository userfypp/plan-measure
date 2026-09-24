# Changelog

All notable changes to Plan Measure are documented in this file.

This changelog starts with v2.3.0. Earlier releases are documented in GitHub Releases.

## [2.5.0](https://github.com/userfypp/plan-measure/compare/v2.4.0...v2.5.0) (2026-09-24)


### Added

* add measurement search and filters ([#139](https://github.com/userfypp/plan-measure/issues/139)) ([70007ce](https://github.com/userfypp/plan-measure/commit/70007ce83aee9d79af6d738110c74e53a5936313))
* add measurement totals and takeoff summaries ([#132](https://github.com/userfypp/plan-measure/issues/132)) ([01aaf58](https://github.com/userfypp/plan-measure/commit/01aaf587da421e96b8bff221d0afbc05e1ed8a3b))
* add notes to measurements ([#135](https://github.com/userfypp/plan-measure/issues/135)) ([6b2cb0e](https://github.com/userfypp/plan-measure/commit/6b2cb0e0faada7b8d461cb96b47844650f55c2ad))
* compact filtering and grouping controls ([#140](https://github.com/userfypp/plan-measure/issues/140)) ([650c708](https://github.com/userfypp/plan-measure/commit/650c70898db6a53a7663cfb1104cb4253f97c222))
* copy scales across PDF pages ([#134](https://github.com/userfypp/plan-measure/issues/134)) ([627b459](https://github.com/userfypp/plan-measure/commit/627b4599e0b3222d9bf6f469840122caed0b27fe))
* group measurements by multiple dimensions ([#137](https://github.com/userfypp/plan-measure/issues/137)) ([49dbfd0](https://github.com/userfypp/plan-measure/commit/49dbfd0281bc49768b20b3a4829d40eef8960a93))


### Fixed

* center settings icon and align app bar spacing ([#141](https://github.com/userfypp/plan-measure/issues/141)) ([7e57952](https://github.com/userfypp/plan-measure/commit/7e57952a4445f841ad6e2502eb070f466bcc6d4c))
* improve the visual hierarchy of classifications and grouped measurements ([#142](https://github.com/userfypp/plan-measure/issues/142)) ([59eb595](https://github.com/userfypp/plan-measure/commit/59eb5952cdc096b2a6be6d1ae31693967885bd68))
* polish measurement details, grouped visibility, and classifications ([#136](https://github.com/userfypp/plan-measure/issues/136)) ([065aacf](https://github.com/userfypp/plan-measure/commit/065aacfe018618f6f0e1d7278603399739b4a09a))


### Improved

* improve drawing, navigation, and measurement responsiveness ([#138](https://github.com/userfypp/plan-measure/issues/138)) ([61a3dc7](https://github.com/userfypp/plan-measure/commit/61a3dc726754f43a9dfaa900e17a9a8fdf0a743a))

## [2.4.0](https://github.com/userfypp/plan-measure/compare/v2.3.0...v2.4.0) (2026-09-21)


### Added

* add classification assignments CSV export ([#116](https://github.com/userfypp/plan-measure/issues/116)) ([f64a346](https://github.com/userfypp/plan-measure/commit/f64a346b8db3ccd28cabd3f7680aaa7469e5110c))
* add custom page labels ([#123](https://github.com/userfypp/plan-measure/issues/123)) ([d7670c5](https://github.com/userfypp/plan-measure/commit/d7670c5d04aa224fa2a9232cbc2cd699154ca4c7))

## [2.3.0] - 2026-09-19

### Added

- Decimal inches (`in`) as a measurement and display unit.
- Decimal feet (`ft`) as a measurement and display unit.
- Structured feet-and-inches input for calibration distances.
- Acres (`ac`) for polygon area display.
- Custom Uniform scale ratios using `1:n`.
- Custom X/Y scale ratios.
- `Set ratio` for existing scales.

### Improved

- Calibration workflow for metric and imperial input.
- Scales workspace and scale details.
- Scale ratio display and precision.
- Standard scale presets now use the same ratio-calibration path as custom ratios.

### Fixed

- `Set ratio` now asks for confirmation before recalculating measurements when the scale is already in use.
