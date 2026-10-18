# Changelog

All notable changes to Plan Measure are documented in this file.

This changelog starts with v2.3.0. Earlier releases are documented in GitHub Releases.

## [2.11.1](https://github.com/userfypp/plan-measure/compare/v2.11.0...v2.11.1) (2026-10-18)


### Fixed

* accept a polygon area whose doubled value overflows ([#328](https://github.com/userfypp/plan-measure/issues/328)) ([4215e04](https://github.com/userfypp/plan-measure/commit/4215e04fd0b1377f23744ae9db3b5208a840e4ae)), closes [#268](https://github.com/userfypp/plan-measure/issues/268)
* avoid a label layout stall at extreme coordinates ([#340](https://github.com/userfypp/plan-measure/issues/340)) ([3cedb0d](https://github.com/userfypp/plan-measure/commit/3cedb0d31459081f721deb47a8f66c2a0bab5614)), closes [#271](https://github.com/userfypp/plan-measure/issues/271)
* cap the width of long scale names in menus and on the plan ([#319](https://github.com/userfypp/plan-measure/issues/319)) ([8a22341](https://github.com/userfypp/plan-measure/commit/8a22341e5c9ceafd63ab26342a014b6bc917fb54))
* copy a scale with an extreme factor to another page ([#330](https://github.com/userfypp/plan-measure/issues/330)) ([97b80de](https://github.com/userfypp/plan-measure/commit/97b80de6fa445ebaeee4a42b48d4e63821b22449)), closes [#273](https://github.com/userfypp/plan-measure/issues/273)
* flag a measurement that converts to zero in the display or export unit ([#329](https://github.com/userfypp/plan-measure/issues/329)) ([ca335d1](https://github.com/userfypp/plan-measure/commit/ca335d1c40b3c0cc8caf243995f05de78f5bb99d)), closes [#269](https://github.com/userfypp/plan-measure/issues/269)
* include appearance, keyboard authoring and confirmations in the settings file ([#342](https://github.com/userfypp/plan-measure/issues/342)) ([65ec680](https://github.com/userfypp/plan-measure/commit/65ec680ffc97660a8e73f9536026af04fc82f259)), closes [#301](https://github.com/userfypp/plan-measure/issues/301)
* keep a polygon area that opposing X/Y scales would underflow ([#331](https://github.com/userfypp/plan-measure/issues/331)) ([decc806](https://github.com/userfypp/plan-measure/commit/decc806efdd5cac32b5b2529d298cd71af861a9c)), closes [#307](https://github.com/userfypp/plan-measure/issues/307)
* keep Cloud scallops outward at large coordinates ([#334](https://github.com/userfypp/plan-measure/issues/334)) ([e599538](https://github.com/userfypp/plan-measure/commit/e599538a7736e640f6e45f78b37b62a0ac52e324)), closes [#274](https://github.com/userfypp/plan-measure/issues/274)
* keep device preferences when a settings file has an invalid preferences list ([#337](https://github.com/userfypp/plan-measure/issues/337)) ([6a56c38](https://github.com/userfypp/plan-measure/commit/6a56c382958aa5a174d88716ed1c23c8683c306e)), closes [#298](https://github.com/userfypp/plan-measure/issues/298)
* keep PDF rasters within the pixel budget ([#336](https://github.com/userfypp/plan-measure/issues/336)) ([db959b5](https://github.com/userfypp/plan-measure/commit/db959b5f7a01357e5551896d29b9e0d26ec9c85e)), closes [#306](https://github.com/userfypp/plan-measure/issues/306) [#270](https://github.com/userfypp/plan-measure/issues/270)
* keep Redo when a scale, dimension or value is saved with its same name ([#325](https://github.com/userfypp/plan-measure/issues/325)) ([c318123](https://github.com/userfypp/plan-measure/commit/c318123ced468451ae3f9f1babd52af67a6e4fa3)), closes [#262](https://github.com/userfypp/plan-measure/issues/262)
* keep text editors open while Enter confirms an IME composition ([#339](https://github.com/userfypp/plan-measure/issues/339)) ([8a6abac](https://github.com/userfypp/plan-measure/commit/8a6abac5a857a90052078158bf1bdacc1bcad268)), closes [#265](https://github.com/userfypp/plan-measure/issues/265)
* keep the area of an ellipse when its radius times a scale underflows ([#327](https://github.com/userfypp/plan-measure/issues/327)) ([e850b7f](https://github.com/userfypp/plan-measure/commit/e850b7fb9a51e7145a6c82e8f011ead9b3e2f515)), closes [#267](https://github.com/userfypp/plan-measure/issues/267)
* keep the digits of very small scale ratios when saving a scale unchanged ([#326](https://github.com/userfypp/plan-measure/issues/326)) ([f62b483](https://github.com/userfypp/plan-measure/commit/f62b48368e4fbf3d0a6936d7c4d8f7a37b620712)), closes [#266](https://github.com/userfypp/plan-measure/issues/266)
* refresh canvas labels when the number separators change ([#338](https://github.com/userfypp/plan-measure/issues/338)) ([73a6200](https://github.com/userfypp/plan-measure/commit/73a6200bbe9fda35987f6dee59668ed93df5e3ac)), closes [#293](https://github.com/userfypp/plan-measure/issues/293)
* show Repair required in a box preview whose side overflows ([#332](https://github.com/userfypp/plan-measure/issues/332)) ([06f135f](https://github.com/userfypp/plan-measure/commit/06f135fdd5c9c6ff38e637dc43d9bd2974de068e)), closes [#304](https://github.com/userfypp/plan-measure/issues/304)
* stop option names from activating their dropdown or switch ([#316](https://github.com/userfypp/plan-measure/issues/316)) ([1715f62](https://github.com/userfypp/plan-measure/commit/1715f62ca3b109cf892c75ee6d4ddce84208fdf7))
* stop Undo and Redo from leaving a missing label dimension in the… ([#324](https://github.com/userfypp/plan-measure/issues/324)) ([23f5726](https://github.com/userfypp/plan-measure/commit/23f5726a67eed32811df873117fa845870c9d5c1)), closes [#292](https://github.com/userfypp/plan-measure/issues/292)
* undo a group visibility change across pages in one step ([#341](https://github.com/userfypp/plan-measure/issues/341)) ([1cfe85f](https://github.com/userfypp/plan-measure/commit/1cfe85f838d973569bf61d06bba737a42f14f4b7)), closes [#263](https://github.com/userfypp/plan-measure/issues/263)


### Documentation

* refresh the roadmap with the open bugs and the planned Takeoff work ([#343](https://github.com/userfypp/plan-measure/issues/343)) ([886a922](https://github.com/userfypp/plan-measure/commit/886a922e91ce754d1c26308684915a89601f95f8))
* tighten the README, merge the release docs and enlarge the logo ([#318](https://github.com/userfypp/plan-measure/issues/318)) ([7c78913](https://github.com/userfypp/plan-measure/commit/7c789137e4b746bac245c96bb906eb7b07063c1b))

## [2.11.0](https://github.com/userfypp/plan-measure/compare/v2.10.0...v2.11.0) (2026-10-17)


### Added

* close the current project from the app bar to return to the start screen; a project that could not be saved asks before it is discarded ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* collapse a measurement group by clicking anywhere on its header ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* delete scales from the Scales panel ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* draw revision clouds without a scale and measure them only on request ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* edit one side of a rectangle or ellipse at a time ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* fade plans, menus, popovers, tooltips and the Pages panel in instead of flashing placeholders ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* filter measurements by this page, page, type, the active scale of the page on screen, classification (including unclassified), visibility and selection, with a count for each value ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* pick the color of measurement labels, which now stay readable over the plan ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* redesign the start screen ([#314](https://github.com/userfypp/plan-measure/issues/314)) ([a65f8c6](https://github.com/userfypp/plan-measure/commit/a65f8c6ce00e65879398bab0e29dc7a4b92185fb))
* replace the sample project with the Orchard House drawing set ([#312](https://github.com/userfypp/plan-measure/issues/312)) ([35def3e](https://github.com/userfypp/plan-measure/commit/35def3ee46cf2c7d41f1230544ce17e8adbe3321))


### Fixed

* ask for both X and Y distances before naming a new scale ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* calibrate the sample project's scales to their exact ratios ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* confirm before opening a saved project over a memory-only one ([#308](https://github.com/userfypp/plan-measure/issues/308)) ([0a78a81](https://github.com/userfypp/plan-measure/commit/0a78a816dcf33090f2710433ac9214d83828c473)), closes [#260](https://github.com/userfypp/plan-measure/issues/260)
* freeze the clock in the scale check export boundary test ([#313](https://github.com/userfypp/plan-measure/issues/313)) ([ea87c4e](https://github.com/userfypp/plan-measure/commit/ea87c4ec1a9cf72ee5c98f7c28d18f223fe41619))
* keep measurement drags from being cancelled before they end ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* keep neighbouring labels in place when a measurement is selected or confirmed ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* keep the keyboard cursor across tool changes and focus the plan after creating a scale ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* keep viewer dialogs above the keyboard help card and portrait page previews whole in the Pages panel ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* lock rectangle, ellipse and cloud in the tool rail until the page has a scale ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* open a PDF in memory after continuing without recovery ([#309](https://github.com/userfypp/plan-measure/issues/309)) ([46cfa73](https://github.com/userfypp/plan-measure/commit/46cfa73058977faed8bb154bf5259f27029c0ec6)), closes [#261](https://github.com/userfypp/plan-measure/issues/261)
* preview measurement labels with every number setting ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* select a measurement when clicking the empty space beside its eye ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* stack the start screen panels and tighten the Scales panel and measurement list alignment ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))


### Improved

* download less on startup by replacing SheetJS with a built-in XLSX writer and bundling only the canvas code the viewer uses ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* draw, select, drag and pan faster with large measurement sets by skipping unchanged measurements, labels and layer redraws ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* open plans without a loading state by preloading the viewer and PDF.js from the start screen ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* open the project library, settings, the Pages panel and other panels without placeholders ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))


### Documentation

* add a logo header to the README ([#311](https://github.com/userfypp/plan-measure/issues/311)) ([0ae0f7c](https://github.com/userfypp/plan-measure/commit/0ae0f7c6fdad55bf368d3d4c3dc856beefab8df3))
* document the canvas and panel performance rules and a checklist for new features ([8a7163f](https://github.com/userfypp/plan-measure/commit/8a7163f18cf67edf3fa949d5f46d97f9dbb9c5e0))
* refresh the README screenshot and remove unused screenshots ([#290](https://github.com/userfypp/plan-measure/issues/290)) ([194f2f5](https://github.com/userfypp/plan-measure/commit/194f2f51a6c0f862128703bb7a4b979e4d506395))

## [2.10.0](https://github.com/userfypp/plan-measure/compare/v2.9.1...v2.10.0) (2026-10-12)


### Added

* add rectangle, ellipse and revision cloud measurements ([#239](https://github.com/userfypp/plan-measure/issues/239)) ([820e495](https://github.com/userfypp/plan-measure/commit/820e495ab975f69f3f798274ebd73b7d27febfc4)), closes [#228](https://github.com/userfypp/plan-measure/issues/228)
* polish the UI with a design system, settings dialog and nested measurement groups ([#286](https://github.com/userfypp/plan-measure/issues/286)) ([5e998e7](https://github.com/userfypp/plan-measure/commit/5e998e70fd74d2f27d3c9f0945fa49433903f2dc))


### Fixed

* align the release baseline with the published v2.9.1 ([#288](https://github.com/userfypp/plan-measure/issues/288)) ([1fc8cbd](https://github.com/userfypp/plan-measure/commit/1fc8cbda9dd8697f3daa9b0f9665ef7753e9cdcd))
* bound cloud outlines and preserve scaled area precision ([#241](https://github.com/userfypp/plan-measure/issues/241)) ([5206a22](https://github.com/userfypp/plan-measure/commit/5206a222cd941a130c045321a4e37b40e50e1cbb))
* preserve unsaved data across project transitions ([#242](https://github.com/userfypp/plan-measure/issues/242)) ([f5b21bc](https://github.com/userfypp/plan-measure/commit/f5b21bcc8e81260605d91f21bc6dd99c7ef39492))
* recover module loading failures and keep tooltips visible ([#244](https://github.com/userfypp/plan-measure/issues/244)) ([ba0d583](https://github.com/userfypp/plan-measure/commit/ba0d583597efb13e9f82e5355908f67e5c9580a6))
* synchronize measurement editing with undo and redo ([#243](https://github.com/userfypp/plan-measure/issues/243)) ([fe3a6ff](https://github.com/userfypp/plan-measure/commit/fe3a6ffe4e8d1b1c502a1043bc2cfa6b8f180c65))


### Improved

* bound takeoff source and count item lists ([#245](https://github.com/userfypp/plan-measure/issues/245)) ([d66694e](https://github.com/userfypp/plan-measure/commit/d66694ee14c2268221493ed97d5e7077e749fa68))


### Documentation

* open the sample project from a ?sample=1 link and add contributor docs ([#258](https://github.com/userfypp/plan-measure/issues/258)) ([2d4becb](https://github.com/userfypp/plan-measure/commit/2d4becb348f24ab430a415a689e0b883c19c80fe))
* show README links as buttons ([#259](https://github.com/userfypp/plan-measure/issues/259)) ([ebfb62c](https://github.com/userfypp/plan-measure/commit/ebfb62c1a160ab2ef7bfd78a50e8012e093af766))
* update audit follow-ups ([#282](https://github.com/userfypp/plan-measure/issues/282)) ([e57c953](https://github.com/userfypp/plan-measure/commit/e57c953a99e0fadc1b58b82a9e936f9282bd98b7))

## [2.9.1](https://github.com/userfypp/plan-measure/compare/v2.9.0...v2.9.1) (2026-10-11)


### Added

* check scales against another known distance ([#225](https://github.com/userfypp/plan-measure/issues/225)) ([e137990](https://github.com/userfypp/plan-measure/commit/e137990b22599323ec40f12b9d2cd6dff562e6e4))
* **pages:** add a searchable page browser with thumbnails ([#226](https://github.com/userfypp/plan-measure/issues/226)) ([61aa0e0](https://github.com/userfypp/plan-measure/commit/61aa0e0ecc964e6ab5941dd71f18cccf4ab2c69c))
* show save status and quick backup access ([#223](https://github.com/userfypp/plan-measure/issues/223)) ([b9a5a68](https://github.com/userfypp/plan-measure/commit/b9a5a681c496a4ec29a369d48fdc67c8d5462483))


### Improved

* keep annotations static during wheel zoom and speed up annotated PDF export ([#227](https://github.com/userfypp/plan-measure/issues/227)) ([d0b2c2a](https://github.com/userfypp/plan-measure/commit/d0b2c2a90b8f5c41fdfca2fff54f8c2a6ae46f55))

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
