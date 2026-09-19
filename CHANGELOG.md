# Changelog

All notable changes to Plan Measure are documented in this file.

This changelog starts with v2.3.0. Earlier releases are documented in GitHub Releases.

## [2.3.0] - Unreleased

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
