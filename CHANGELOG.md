# Changelog

Written automatically by [release-please](https://github.com/googleapis/release-please) from the
commit messages. The project uses [Semantic Versioning](https://semver.org/).

## [0.4.0](https://github.com/harendra-singh-negi/formlift/compare/v0.3.0...v0.4.0) (2026-11-12)


### Features

* **editor:** stickyPanels option ([69c653e](https://github.com/harendra-singh-negi/formlift/commit/69c653e10b60acb46aca11f2bb1110f0c007225e))
* **element:** no setup in the app: CSS and pdf.js built in ([62e7d94](https://github.com/harendra-singh-negi/formlift/commit/62e7d94c7f91af84d05391966ce3c6752a4eab70))
* **fields:** nine more field types ([33e0ae0](https://github.com/harendra-singh-negi/formlift/commit/33e0ae0b36aa57a69818f3cf518aaf425c01d96f))
* **forms:** groups of boxes, follow-up dialogs, comments, onFieldChange ([ba2e53c](https://github.com/harendra-singh-negi/formlift/commit/ba2e53c78d4625245d9878ee1080293f63b15863))


### Bug Fixes

* **build:** Next.js "use client", types for every resolution mode ([4336145](https://github.com/harendra-singh-negi/formlift/commit/4336145473615306f6b8b024fcc78bf3d49dc1d4))
* **css:** style the editor's own root, drop [@scope](https://github.com/scope) ([8f044b6](https://github.com/harendra-singh-negi/formlift/commit/8f044b6972370e505b44b674dc51db3a56b369e1))
* **editor:** fill-order list offset, options box after undo ([9daaf89](https://github.com/harendra-singh-negi/formlift/commit/9daaf89a1da62a20ab85a2f2c3163760dff4a7eb))
* **editor:** never taller than its container ([a67a97c](https://github.com/harendra-singh-negi/formlift/commit/a67a97cf18bb95d6ac830fa09539910fbf898509))
* **element:** add the CSS when the app themes formlift on :root ([83cf05d](https://github.com/harendra-singh-negi/formlift/commit/83cf05d42bf301ec28abdc9fd19d4bf5a8dc8d05))
* **fields:** slider minimum, radios shown twice, read-only multi-select ([f3263df](https://github.com/harendra-singh-negi/formlift/commit/f3263df5b311e8af1475c61ca9aaf8a03fd3cf58))
* **filler:** field badges stay inside the page ([a0edb2a](https://github.com/harendra-singh-negi/formlift/commit/a0edb2abca6a8d66272c28522ffffd70734856d9))
* **filler:** re-check errors against the latest state ([fa3d91e](https://github.com/harendra-singh-negi/formlift/commit/fa3d91eebbc87ffb97a3cad7770a741724cd0334))
* **forms:** a closed follow-up's nested questions never count ([a8ae83a](https://github.com/harendra-singh-negi/formlift/commit/a8ae83a562d51048062e6cc301b001a8f7fc0ded))
* **pdf:** load pdf.js's legacy build so older browsers finish documents ([13abb60](https://github.com/harendra-singh-negi/formlift/commit/13abb60a585154cd80e5155ff61eb137cfcdd264))
* **types:** export FieldChangeApi and FieldDialog ([f15a234](https://github.com/harendra-singh-negi/formlift/commit/f15a23497508ffb80f1c45ff47a9729c88b8f4f7))
* **ui:** dialogs have an accessible name ([363c911](https://github.com/harendra-singh-negi/formlift/commit/363c911546ad12ba2b603516ed3ad7b2a57879c8))
* **ui:** dialogs render on document.body, close on Escape ([2b3e00c](https://github.com/harendra-singh-negi/formlift/commit/2b3e00cccde31eb1f0aafc93ec0bc3fd9e38550f))
* **ui:** Escape closes only the newest dialog or dropdown ([2e71adb](https://github.com/harendra-singh-negi/formlift/commit/2e71adbcf300467662b22fa7df1e462b499cb8fc))


### Performance

* **editor:** long documents cost only the pages on screen ([b31e1a5](https://github.com/harendra-singh-negi/formlift/commit/b31e1a53fbbedcc8a4b0143cc47f024804ad0b24))


### Documentation

* **demo:** Basic and Advanced tours of every feature ([d1f08cc](https://github.com/harendra-singh-negi/formlift/commit/d1f08cccd9b997f3cf8f4f967a287f87388be7f9))
* **demo:** header wraps on phones ([25e34a7](https://github.com/harendra-singh-negi/formlift/commit/25e34a7787be79a9e734b52213ed1d6e8a6675b9))
* upgrading guide; dependency changes shown in the changelog ([61dfc26](https://github.com/harendra-singh-negi/formlift/commit/61dfc261f06b6b50129b8b2e36971d72c68e9e79))


### Dependencies and Build

* **deps:** pdfjs-dist is a peer dependency ([d0944fe](https://github.com/harendra-singh-negi/formlift/commit/d0944fe3e0b735b6f5f35fdfacefb50b259ac5cd))

## [0.3.0](https://github.com/harendra-singh-negi/formlift/compare/v0.2.0...v0.3.0) (2026-11-12)


### Features

* answer error messages can be replaced in any language (messages, DEFAULT_ANSWER_MESSAGES) ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))
* every UI text can be replaced in any language (labels prop, DEFAULT_LABELS, useLabels) ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))
* FormFiller onChange hands out the answers as JSON on every change, so onSave is optional ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))
* formlift/element: mountEditor and mountFiller for Angular, Vue and plain JS, with React bundled in ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))
* own validation rules picked per field in the builder, validate() override, per-field required and error messages ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))
* size limits are options (limits prop and argument, DEFAULT_LIMITS) instead of fixed values ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))
* snapStep, undoLimit, zoomSteps and listPageSize options ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))
* stickyToolbar on FormEditor and FormFiller, and toolbars that fit phone screens ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))


### Bug Fixes

* pdf.js is a dependency and the icons are bundled, so apps no longer install pdfjs-dist or lucide-react ([aa1fa57](https://github.com/harendra-singh-negi/formlift/commit/aa1fa574b7b637df692d801fc7f18da4c71fe109))

## [0.2.0](https://github.com/harendra-singh-negi/formlift/compare/v0.1.1...v0.2.0) (2026-11-12)


### ⚠ BREAKING CHANGES

* matches, NO_FILTER and QuestionFilter are removed. Filter with filterQuestions and filter objects instead.

### Features

* customisable UI, headless hooks and a filter registry ([50a2571](https://github.com/harendra-singh-negi/formlift/commit/50a2571964a09d17acbc82fd65d83bac1ab1b70a))

## [0.1.1] - 2026-11-10

### Changed

- Releases are now published from GitHub Actions through npm Trusted Publishing (no tokens) and staged for
  maintainer approval before they go live. No code changes.

## [0.1.0] - 2026-11-10

### Added

- `formlift` core: form model, validation, conditional logic, layout and PDF field auto-detection.
- `formlift/react`: `FormEditor` (builder) and `FormFiller` (fill-in view with list mode, autosave, signatures,
  file uploads).
- `formlift/server`: `completedPdf()` with answers, signatures and embedded attachments.
- `formlift/style.css`: styles scoped to `.fl-root`, themeable with `--fl-*` variables.
