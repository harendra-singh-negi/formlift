# Changelog

Written automatically by [release-please](https://github.com/googleapis/release-please) from the
commit messages. The project uses [Semantic Versioning](https://semver.org/).

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
