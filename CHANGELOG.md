# Changelog

All notable changes to Plan Measure are documented in this file.

This changelog starts with v2.3.0. Earlier releases are documented in GitHub Releases.

## [2.4.0](https://github.com/userfypp/plan-measure/compare/v2.3.0...v2.4.0) (2026-09-21)


### Added

* add classification assignments CSV export ([#116](https://github.com/userfypp/plan-measure/issues/116)) ([f64a346](https://github.com/userfypp/plan-measure/commit/f64a346b8db3ccd28cabd3f7680aaa7469e5110c))

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
