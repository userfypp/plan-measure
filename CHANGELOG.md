# Changelog

All notable changes to Plan Measure are documented in this file.

This changelog starts with v2.3.0. Earlier releases are documented in GitHub Releases.

## [2.9.0](https://github.com/userfypp/plan-measure/compare/v2.8.0...v2.9.0) (2026-10-10)


### Added

* add configurable takeoff summaries to data exports ([#218](https://github.com/userfypp/plan-measure/issues/218)) ([687bb93](https://github.com/userfypp/plan-measure/commit/687bb9347f01d4b55e7bdfdd66e759327cef42ba))
* add native item counting ([#222](https://github.com/userfypp/plan-measure/issues/222)) ([1a9c8a7](https://github.com/userfypp/plan-measure/commit/1a9c8a73f97ee116e62d6d441f7f944c19244103))
* **app:** add an editable sample project ([#217](https://github.com/userfypp/plan-measure/issues/217)) ([7749f99](https://github.com/userfypp/plan-measure/commit/7749f9981ee76dab0f6f22ce468f2b14ea6ec94b))
* open source measurements from takeoff totals ([#221](https://github.com/userfypp/plan-measure/issues/221)) ([7afa5f0](https://github.com/userfypp/plan-measure/commit/7afa5f057cfec26c330ef52be3e868123829526b))


### Fixed

* **takeoff:** improve visual hierarchy and compact layout ([#200](https://github.com/userfypp/plan-measure/issues/200)) ([c85cdb9](https://github.com/userfypp/plan-measure/commit/c85cdb90b2f4881caf0e732910d88f0c328f7f4d))


### Improved

* optimize annotation rendering and CSV export with performance regression tests ([#220](https://github.com/userfypp/plan-measure/issues/220)) ([a9d3c0c](https://github.com/userfypp/plan-measure/commit/a9d3c0c136845e4e05ce26aa070f4c59b714ab30))
* optimize measurement rendering, autosave, CSV export and startup loading ([#219](https://github.com/userfypp/plan-measure/issues/219)) ([c7eb89c](https://github.com/userfypp/plan-measure/commit/c7eb89cb7ad5f69210e06c25ec0be94f05a23c33))


### Documentation

* simplify and update repository documentation ([#198](https://github.com/userfypp/plan-measure/issues/198)) ([1e8bebe](https://github.com/userfypp/plan-measure/commit/1e8bebe7cf7c7abbe47c3017a45cfb2327b83b65))

## [2.8.0](https://github.com/userfypp/plan-measure/compare/v2.7.1...v2.8.0) (2026-10-08)


### Added

* add optional keyboard geometry creation and editing ([#187](https://github.com/userfypp/plan-measure/issues/187)) ([7e1d716](https://github.com/userfypp/plan-measure/commit/7e1d7161b0d9bf007bd49fe88b3ef96376583f8b))


### Fixed

* cancel measurement drags with Escape ([#191](https://github.com/userfypp/plan-measure/issues/191)) ([1845186](https://github.com/userfypp/plan-measure/commit/18451867b0b83db51b0766740a7e48391f46bc42))
* explain encrypted PDF annotation export failures ([#192](https://github.com/userfypp/plan-measure/issues/192)) ([147c1eb](https://github.com/userfypp/plan-measure/commit/147c1eb2dcbd800f7cff2bd6bdd07d5229f689c4))
* identify unsupported text in spreadsheet exports ([#195](https://github.com/userfypp/plan-measure/issues/195)) ([7de8db4](https://github.com/userfypp/plan-measure/commit/7de8db482d69cf23b099b50c62d5561f7d9ee7c2))
* improve input placeholder contrast in both themes ([#193](https://github.com/userfypp/plan-measure/issues/193)) ([294ec89](https://github.com/userfypp/plan-measure/commit/294ec89123f30a391d2ae000d0aa1df075f90fc6))
* normalize CSV download filenames ([#194](https://github.com/userfypp/plan-measure/issues/194)) ([9330117](https://github.com/userfypp/plan-measure/commit/93301171f2c5505b27a5b1d01fa81702f97190e3))
* preserve measurement history for unchanged edits ([#189](https://github.com/userfypp/plan-measure/issues/189)) ([4560dda](https://github.com/userfypp/plan-measure/commit/4560ddaf14d0706a5aabfdf62ba852af1e5cbbec))
* prevent repeated vertices in polygon drafts ([#190](https://github.com/userfypp/plan-measure/issues/190)) ([f8c1e23](https://github.com/userfypp/plan-measure/commit/f8c1e23387539d9bebec13d4aa06a721019c3152))

## [2.7.1](https://github.com/userfypp/plan-measure/compare/v2.7.0...v2.7.1) (2026-10-04)


### Fixed

* **calibration:** reject diagonal X/Y reference authoring ([#177](https://github.com/userfypp/plan-measure/issues/177)) ([e67187a](https://github.com/userfypp/plan-measure/commit/e67187a89c63249cba6d44a5751b08ef01f953a0))
* reopen terminated IndexedDB connections ([#181](https://github.com/userfypp/plan-measure/issues/181)) ([185f735](https://github.com/userfypp/plan-measure/commit/185f7351a9e78b18d9e2e4870da03dd7efff9dd5))
* restore autosave recovery and improve error notifications ([#182](https://github.com/userfypp/plan-measure/issues/182)) ([9f8450d](https://github.com/userfypp/plan-measure/commit/9f8450df290b83507e231989c0167a4870b746a9))
* resume autosave after redoing historical repairs ([#180](https://github.com/userfypp/plan-measure/issues/180)) ([5580822](https://github.com/userfypp/plan-measure/commit/5580822ba65c557c57e791eddfb1fdc4d36992a3))


### Improved

* accelerate large polygon validation ([#178](https://github.com/userfypp/plan-measure/issues/178)) ([f4f324e](https://github.com/userfypp/plan-measure/commit/f4f324e419875786d9fcb29d66edc84d7c20bdec))

## [2.7.0](https://github.com/userfypp/plan-measure/compare/v2.6.0...v2.7.0) (2026-10-03)


### Added

* add feedback, feature request, and bug report menu ([#169](https://github.com/userfypp/plan-measure/issues/169)) ([b286263](https://github.com/userfypp/plan-measure/commit/b286263e750993d7ffe7c3550f29dbe2342a8531))
* add reusable classification templates ([#172](https://github.com/userfypp/plan-measure/issues/172)) ([cf461c2](https://github.com/userfypp/plan-measure/commit/cf461c2d389559960153411497fb3dedd39441fd))
* add XLSX, ODS, and JSON exports ([#170](https://github.com/userfypp/plan-measure/issues/170)) ([80ed46f](https://github.com/userfypp/plan-measure/commit/80ed46f8e4a9184b499c0f74665db453c7e4e71d))
* allow deleting classification dimensions and values ([#174](https://github.com/userfypp/plan-measure/issues/174)) ([9e66652](https://github.com/userfypp/plan-measure/commit/9e6665278b30370a5a92bdf11cb84d21e08d4aae))
* **measurements:** add multi-selection and group editing ([#175](https://github.com/userfypp/plan-measure/issues/175)) ([e3ddf84](https://github.com/userfypp/plan-measure/commit/e3ddf84742b6fa96a6da731970d55276820344a6))


### Fixed

* enable application shortcuts outside viewer focus ([#163](https://github.com/userfypp/plan-measure/issues/163)) ([da307a2](https://github.com/userfypp/plan-measure/commit/da307a28dcc0717ae6703990aec86b66741b6000))
* keep Safari viewer cursors visible during shortcuts and panning ([#161](https://github.com/userfypp/plan-measure/issues/161)) ([b1d3c94](https://github.com/userfypp/plan-measure/commit/b1d3c94b2ef6c4f68b49d8505427e42b9788ee25))


### Documentation

* improve documentation and update README screenchot ([#168](https://github.com/userfypp/plan-measure/issues/168)) ([6d2ae6c](https://github.com/userfypp/plan-measure/commit/6d2ae6cad9943758e8beb31ff9b4968207822550))

## [2.6.0](https://github.com/userfypp/plan-measure/compare/v2.5.1...v2.6.0) (2026-09-27)


### Added

* add project import and export ([#154](https://github.com/userfypp/plan-measure/issues/154)) ([98dd07e](https://github.com/userfypp/plan-measure/commit/98dd07ee1d8e3d93ed1b3184af765954156525a4))
* add undo and redo history ([#151](https://github.com/userfypp/plan-measure/issues/151)) ([f237291](https://github.com/userfypp/plan-measure/commit/f237291296c74c9b936b98782c75e4c2c15da6c8))
* export measurements as annotated PDF ([#156](https://github.com/userfypp/plan-measure/issues/156)) ([2ee6981](https://github.com/userfypp/plan-measure/commit/2ee69812c12e675e5ff6dbe71f94f9437fd59219))
* support multiple saved projects ([#153](https://github.com/userfypp/plan-measure/issues/153)) ([c78b722](https://github.com/userfypp/plan-measure/commit/c78b722fe07be2275d00224cd788aa49fa12e33a))


### Fixed

* synchronize project refresh after activation ([#155](https://github.com/userfypp/plan-measure/issues/155)) ([7fee295](https://github.com/userfypp/plan-measure/commit/7fee2955a97ef0b164588e14e653d3cb7b019848))

## [2.5.1](https://github.com/userfypp/plan-measure/compare/v2.5.0...v2.5.1) (2026-09-26)


### Fixed

* align calibration previews and fit references to page bounds ([#149](https://github.com/userfypp/plan-measure/issues/149)) ([85c5e34](https://github.com/userfypp/plan-measure/commit/85c5e341395181670e16f18a39f49b1b147c1e9c))
* hide stale PDF page after load failure ([#146](https://github.com/userfypp/plan-measure/issues/146)) ([6a119d2](https://github.com/userfypp/plan-measure/commit/6a119d2c6a301d5700432a0cd5ca9d402d022799))
* preserve measurement workflows across page changes and touch ([#148](https://github.com/userfypp/plan-measure/issues/148)) ([863e591](https://github.com/userfypp/plan-measure/commit/863e59145ebfb087bc0d4e49302c274b598a0a8d))
* prevent mobile layout overflow ([#145](https://github.com/userfypp/plan-measure/issues/145)) ([3a3d115](https://github.com/userfypp/plan-measure/commit/3a3d1158e0bf1e082a92bdddcaf83b49bd75b305))
* unify keyboard focus navigation across browsers ([#143](https://github.com/userfypp/plan-measure/issues/143)) ([4edf61a](https://github.com/userfypp/plan-measure/commit/4edf61a7da9496fada8b8bcd0096fa3f1057fcd5))


### Improved

* reuse oversized PDF rasters ([#147](https://github.com/userfypp/plan-measure/issues/147)) ([8e5c6a9](https://github.com/userfypp/plan-measure/commit/8e5c6a9b7ef089a8f13079eec8a106d6308ea60c))

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
