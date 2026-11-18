# Changelog

Written automatically by [release-please](https://github.com/googleapis/release-please) from the
commit messages. The project uses [Semantic Versioning](https://semver.org/).

## [0.7.0](https://github.com/harendra-singh-negi/formlift/compare/v0.6.0...v0.7.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* **fill:** a text field is now a <textarea> that looks like one line (Enter does nothing) and wraps once the answer is longer. Tests, scripts or CSS that select its <input> should select textarea instead.

### Features

* **editor:** copy a field and paste it where it is named after the PDF's text ([dfaf059](https://github.com/harendra-singh-negi/formlift/commit/dfaf059c0ec153292eff3b023e63542fcc749ea3))
* **fill:** long answers grow their box and break onto the next page ([774a845](https://github.com/harendra-singh-negi/formlift/commit/774a8455e15abaad637ff17745b9a7a0e0a8d3b3))
* **fill:** repeatable table rows people add with "+ Add row" ([8b0b73e](https://github.com/harendra-singh-negi/formlift/commit/8b0b73e8e7407a5bf3b6078b2b5c6eba92da45dc))


### Documentation

* long answers guide, and the demo's hints name the new features ([eac5441](https://github.com/harendra-singh-negi/formlift/commit/eac54412e85738bb9d3a71d68831e662006b0885))

## [0.6.0](https://github.com/harendra-singh-negi/formlift/compare/v0.5.0...v0.6.0) (2026-11-17)


### Features

* **detect:** a page set up before still gets what auto-detect finds now ([cb4948d](https://github.com/harendra-singh-negi/formlift/commit/cb4948d3633a94c35b7cb6573dcaa60f14db8ca3))
* **detect:** auto-detect learns from the admin's corrections ([6b2b822](https://github.com/harendra-singh-negi/formlift/commit/6b2b8225288b463ea1269b1c6d63e41abf39f509))
* **detect:** fields drawn where nothing was proposed carry over, and corrections per save ([6c02cb9](https://github.com/harendra-singh-negi/formlift/commit/6c02cb9b645b3c453058626b38ee2236de69211d))
* **detect:** learn more from corrections, in smaller lessons ([6e72dcb](https://github.com/harendra-singh-negi/formlift/commit/6e72dcbfe5555db0342da122d8d87c7a24458478))
* **detect:** learnt patterns carry over to forms never seen ([6dac683](https://github.com/harendra-singh-negi/formlift/commit/6dac6835d2156c327909971bde4b79596e417fad))
* **detect:** long forms learn from the pages set up first ([ee5acf9](https://github.com/harendra-singh-negi/formlift/commit/ee5acf96197fb570640242ceb78d942248d7435b))
* **detect:** one-line boxes, and long forms detected in a third of the time ([0deb6a4](https://github.com/harendra-singh-negi/formlift/commit/0deb6a48883b3353005488abd1f0cb1f70d11ee5))
* **detect:** take a fillable PDF's own fields as they are ([b235226](https://github.com/harendra-singh-negi/formlift/commit/b235226f288c7d7e58459a63d9ce555dfdb00a7f))
* **editor:** see what auto-detect learnt, and forget it ([d62dff9](https://github.com/harendra-singh-negi/formlift/commit/d62dff92551011a4913b552ec516bff017e4c69f))
* **server:** print and remove a fillable original's own fields ([2001d3e](https://github.com/harendra-singh-negi/formlift/commit/2001d3ed6039720d502640ab6594b5ab134309c5))


### Bug Fixes

* **detect:** tables with hairline borders, as Word draws them ([d766342](https://github.com/harendra-singh-negi/formlift/commit/d7663425886f8402d3ea53d2a79e2ad817df8ace))


### Documentation

* **demo:** show auto-detect learning with Start over ([48ea701](https://github.com/harendra-singh-negi/formlift/commit/48ea701addcce6a7726950f3989a341da602e2a4))
* llms.txt for AI search ([d43a498](https://github.com/harendra-singh-negi/formlift/commit/d43a4985aabe8e5d7c698598e213fb36358c353f))
* **readme:** demo GIF re-recorded for the current UI ([576221b](https://github.com/harendra-singh-negi/formlift/commit/576221b21bca9af64048b26f99ee52d0546e625b))
* **readme:** framework line, install, comparison table and demo GIF in the hero ([cb2d984](https://github.com/harendra-singh-negi/formlift/commit/cb2d984a726da9d93502c7e87c85f387d4689640))
* **readme:** long forms, fields drawn twice, limits for big forms ([5b2389c](https://github.com/harendra-singh-negi/formlift/commit/5b2389ce179b38961c0b55c3c01ed26b2a692a0a))
* **readme:** upgrade notes 0.4 → 0.5 ([8d63ece](https://github.com/harendra-singh-negi/formlift/commit/8d63ecebb3553c1cb90a8740ec7b47214ded3f1d))
* **readme:** what auto-detect learns now, and how to forget it ([1278c81](https://github.com/harendra-singh-negi/formlift/commit/1278c81c7aea8d243bb5a986633d16c30ffa5bae))

## [0.5.0](https://github.com/harendra-singh-negi/formlift/compare/v0.4.0...v0.5.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* **list:** <QuestionList> needs `segments` and `pdf` from useFormFiller; FormFiller passes them for you (README → Upgrading).

### Features

* **list:** load more as you scroll with listLoadMore="scroll" ([ab35acc](https://github.com/harendra-singh-negi/formlift/commit/ab35acc65eb2b90559cd92299c58cb522d5517c6))
* **list:** the list fills the width; style it with listPaperClassName ([94a91dc](https://github.com/harendra-singh-negi/formlift/commit/94a91dccfd78259f24dd5eb555b86e2652514528))
* **list:** the list view shows the whole PDF, answers in place ([6ff43a8](https://github.com/harendra-singh-negi/formlift/commit/6ff43a886eed4a775ef2306129c9b592397f92dd))
* **list:** your own loader while the PDF is read (renderListReading) ([b06f1ed](https://github.com/harendra-singh-negi/formlift/commit/b06f1ed01230cf9d94902d972c565f8cacf5008f))


### Bug Fixes

* **demo:** ship the table-form sample PDF ([b74fa2a](https://github.com/harendra-singh-negi/formlift/commit/b74fa2aed1821b1064ddec2262f1776f64824337))
* **deps:** upgrade pdf.js to patch CVE-2026-16633 ([#6](https://github.com/harendra-singh-negi/formlift/issues/6)) ([7aff719](https://github.com/harendra-singh-negi/formlift/commit/7aff71998f0ab53a0e7f07000514d9abbe7df6f6))
* **detect:** "Comments" and other note boxes take text, not dates ([a2ef701](https://github.com/harendra-singh-negi/formlift/commit/a2ef70104acb026b1953943827c9ae9bbc09afbf))
* **detect:** a label written on a dotted line gets its box after it ([1534a40](https://github.com/harendra-singh-negi/formlift/commit/1534a40f45ce1829e42dbecec180e87a782d6bb9))
* **detect:** no answer boxes in grey bars or under list headings ([512be47](https://github.com/harendra-singh-negi/formlift/commit/512be471c17328292c760810dc4fdda76185be5d))
* **detect:** words either side of a table's column line stay apart ([e09486d](https://github.com/harendra-singh-negi/formlift/commit/e09486dc14c8d78e0af0c59a4128f2df1a2d79fa))
* **filler:** narrow date and time boxes show their whole format ([3ca5ebb](https://github.com/harendra-singh-negi/formlift/commit/3ca5ebb4d9a35260107011f481b03b36e5e862c4))
* **filler:** on phones, type list and dialog answers in place ([7dd463d](https://github.com/harendra-singh-negi/formlift/commit/7dd463d51ef64ae4dd5f309d47213272814598d7))
* **filler:** show "Signed" when a signature's picture can't be shown ([897f151](https://github.com/harendra-singh-negi/formlift/commit/897f1510750e27583a0d4cbd47304a6fab616532))


### Documentation

* **contributing:** CHANGELOG is written by release-please; rebase-merge multi-commit branches ([af3b96d](https://github.com/harendra-singh-negi/formlift/commit/af3b96da7618105d9f53a50608fa268071484a41))

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
