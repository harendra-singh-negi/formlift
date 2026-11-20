# Changelog

Written automatically by [release-please](https://github.com/googleapis/release-please) from the
commit messages. The project uses [Semantic Versioning](https://semver.org/).

## [0.7.1](https://github.com/harendra-singh-negi/formlift/compare/v0.7.0...v0.7.1) (2026-11-20)


### Features

* **editor:** field keys can be typed, unique across the form, with an error when taken ([f1b01cc](https://github.com/harendra-singh-negi/formlift/commit/f1b01cc6c8792d9f93464ebddf8345ed2e5d3303))
* **editor:** search the field and layout tools ([6cb7e96](https://github.com/harendra-singh-negi/formlift/commit/6cb7e966ee2e389185fa50aff42aaea8ae9c5e22))
* **fill:** + Add row and a remove ✕ for table rows in the list view too ([05929e4](https://github.com/harendra-singh-negi/formlift/commit/05929e41604124bb5254b9792f0ae74beb50bcbf))
* **fill:** a photo drawn in the completed PDF at a chosen ratio, and file names on one line or wrapped in the list view ([7f0ac94](https://github.com/harendra-singh-negi/formlift/commit/7f0ac9419fe9c83dee7228da55fabc1baedd4f91))
* **fill:** file fields on a phone offer the camera beside choosing a file ([e7e08bc](https://github.com/harendra-singh-negi/formlift/commit/e7e08bcd633cffbded9a520ab142dc07063fc7bf))
* **fill:** file fields take one file or several, chosen in the builder ([4cfce64](https://github.com/harendra-singh-negi/formlift/commit/4cfce6449184d70f2d7e0439c324c5ccd5d02d31))
* **fill:** photos first and other files after them, and the person sets how big the photos show ([7f754b7](https://github.com/harendra-singh-negi/formlift/commit/7f754b78b1719da62be915fcbf91b332168edb30))
* **fill:** photos preview in their box at the PDF's ratio, and several files grow the box like a long answer ([452be83](https://github.com/harendra-singh-negi/formlift/commit/452be83ba3efb3cdf98e5adfdc96bf62538d5ec3))
* **fill:** photos shown in a grid of 1-6 a row instead of a ratio, each with a remove button ([7f53540](https://github.com/harendra-singh-negi/formlift/commit/7f53540fac163e02a04d1ca509762afe39115a74))
* **filters:** photos / attachments filter, attached or not attached ([ef83bac](https://github.com/harendra-singh-negi/formlift/commit/ef83bacdc3c49a246612608a951b7b654cd37b73))
* **pdf:** fileUrl makes a file's cell a one-click link; attachments lose their empty popup ([d6abf81](https://github.com/harendra-singh-negi/formlift/commit/d6abf815efe2712f414df05c62c7ed758fee4df4))


### Bug Fixes

* **editor:** a typed key follows the same rule validateFields checks; keyProblem exported ([8f28cc9](https://github.com/harendra-singh-negi/formlift/commit/8f28cc99f620aaacebe6daa9314d2db60899c3ab))
* **fill:** a growing box cuts the page on a line with no text, so the text beside it moves down whole ([8c0b58c](https://github.com/harendra-singh-negi/formlift/commit/8c0b58c65d0eecd90e98e4b78615b8be45707f98))
* **fill:** a page break never comes between a box and the label beside it ([62840e3](https://github.com/harendra-singh-negi/formlift/commit/62840e374bfed2ac2d788e552c3db7d57412ce73))
* **fill:** a photo's remove button sits on its corner whatever its shape, and the size buttons stay in view at the top ([40e5b04](https://github.com/harendra-singh-negi/formlift/commit/40e5b041f387b03d62ad716468cfc2c97b7b2a18))
* **fill:** a photo's remove button sits on the photo's corner ([911c3fc](https://github.com/harendra-singh-negi/formlift/commit/911c3fc209e4b914633b6113cf42b325303afe48))
* **fill:** added table rows show as rows of the table in the list view, and with crisp rules on the page ([4dd3d4c](https://github.com/harendra-singh-negi/formlift/commit/4dd3d4cdbac55512aa3fcec9fc4b1c833c2f440a))
* **fill:** attached files show as a list of their full names, not boxes, on screen and in the PDF ([85ae11b](https://github.com/harendra-singh-negi/formlift/commit/85ae11bc4208cc9649b77d4de1d8ff3adcdf6867))
* **fill:** files that are not photos take a grid cell as a name tile, and the PDF ends with an Attached files page ([e9c5e8e](https://github.com/harendra-singh-negi/formlift/commit/e9c5e8e1eb0043747fe2722afa7b77f9ff4e84b0))
* **fill:** no duplicate React keys in the list when table rows are added ([d302e25](https://github.com/harendra-singh-negi/formlift/commit/d302e25b3dd6cb2432a5871bd15439360c13b847))
* **fill:** on a phone a line of the form with answer boxes is a card: its name on top, each box on its own line with its column's name ([05e9bf4](https://github.com/harendra-singh-negi/formlift/commit/05e9bf40e6ceb348abc2d34428c8040136f400ff))
* **fill:** on a phone a text answer shows on the page as on a computer and in the PDF: same size, face and wrapping ([7eae177](https://github.com/harendra-singh-negi/formlift/commit/7eae1777a0926cadc7967f4a324b0ef92fc68e5f))
* **fill:** on a phone an added table row in the list has a bar naming it, with a Remove row button that works ([6c51ce8](https://github.com/harendra-singh-negi/formlift/commit/6c51ce81e6c4d6be39b94570e2162b8a0bf7ea56))
* **fill:** the photo's ✕ stays red on hover ([f75d933](https://github.com/harendra-singh-negi/formlift/commit/f75d933dc58681a196fa89b0938fe080c0fbd703))
* **fill:** the remove ✕ of attached files is red ([cc9c91a](https://github.com/harendra-singh-negi/formlift/commit/cc9c91ad393ffc517ab9106c9e3ac2acb6554c7d))
* **ui:** every button shows the hand pointer; the page's remove-row ✕ is red ([88b73dd](https://github.com/harendra-singh-negi/formlift/commit/88b73dd796f79fd253bdb7b9cf0bfed4425c3ecb))


### Documentation

* adding table rows in the list view ([66e81dc](https://github.com/harendra-singh-negi/formlift/commit/66e81dc835f29819baecb36da8ee3d256e58de41))
* builder and filler screenshots of the current UI ([0d85875](https://github.com/harendra-singh-negi/formlift/commit/0d85875915f716db5e186323c8b23dc6b08514cf))
* builder screenshot in the README beside the filler's ([a3c7c91](https://github.com/harendra-singh-negi/formlift/commit/a3c7c9137379040f0a6920542db0d9b6a3d6f334))
* field keys, photos and attachments in the README and the demo ([fa7de12](https://github.com/harendra-singh-negi/formlift/commit/fa7de1266efcfa2f23a9b65eb5ba70941402a775))
* file tiles in the photo grid and the Attached files page ([f36fe91](https://github.com/harendra-singh-negi/formlift/commit/f36fe912b884fefd25e602eeb70179b442d920b5))
* files listed by their full names ([b7265a7](https://github.com/harendra-singh-negi/formlift/commit/b7265a77968b4866d572b556dff6d7f4dff86fb5))
* growing boxes cut on a line with no text; textLines for the completed PDF ([e35fa3b](https://github.com/harendra-singh-negi/formlift/commit/e35fa3b5bde0012e423a06d92bf8f3af3bc6dacd))
* one-click file links in the completed PDF ([679b5ff](https://github.com/harendra-singh-negi/formlift/commit/679b5ff643a7981cf6ac98ad4d7851d4371e3b2d))
* photo preview and growing file boxes ([b1b942c](https://github.com/harendra-singh-negi/formlift/commit/b1b942caeb318ad00f3dd37b2f3ddb58c747c7e8))
* photos before files, and the photo size buttons ([2e468c3](https://github.com/harendra-singh-negi/formlift/commit/2e468c33a65886f9f8908b55a31dbfb5defd0040))
* photos in a row, and the demo's tour field shows three ([5494009](https://github.com/harendra-singh-negi/formlift/commit/5494009ff1cc2034694866c37fc433b4caa91871))
* security policy, and the 0.7 upgrade notes named after their release ([08052a4](https://github.com/harendra-singh-negi/formlift/commit/08052a41a34f7b978e868d575329bd4de4bf8390))
* several files per field in the README and the demo ([ef01046](https://github.com/harendra-singh-negi/formlift/commit/ef01046592e0731662929b01f7e6b79b33ceea58))
* today's features under 0.7 → next, in the feature table and in the demo's hints ([b0b5c15](https://github.com/harendra-singh-negi/formlift/commit/b0b5c157b6ce9001c4e4389308eea6e3018832d7))

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
