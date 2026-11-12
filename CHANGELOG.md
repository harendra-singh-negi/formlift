# Changelog

Written automatically by [release-please](https://github.com/googleapis/release-please) from the
commit messages. The project uses [Semantic Versioning](https://semver.org/).

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
