# Contributing to formlift

Thanks for helping! Bug reports, fixes, new detection cases, docs and ideas are all welcome.

## Ways to contribute

- **Report a bug**: [open an issue](https://github.com/harendra-singh-negi/formlift/issues/new/choose) with the
  steps to reproduce. If it is about auto-detect, attach the PDF (or a page of it) if you can share it.
- **Suggest a feature**: open a feature request and describe the problem it solves.
- **Send a fix or feature**: open a pull request (see below). For anything large, open an issue first so we can
  agree on the approach before you spend time on it.

## Development setup

Requirements: Node 18+ and npm.

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/formlift.git
cd formlift
npm install            # also builds dist/

# 2. Work on a branch
git checkout -b fix/short-description

# 3. Run the live demo while you work (http://localhost:5173)
npm run dev
```

## Project layout

```
src/core/             framework-free logic: field and layout editing (fields.ts, layout.ts, coords.ts), filters
src/core/form-logic/  the form model and its checks: fields, conditions, groups, answers, comments, layout. No
                      imports from outside it, so the same checks run in the browser and on your server
src/core/questions/   the form as questions for the list view: grouping, titles, sections, scales
src/core/flow/        the document reflowed for the list view: reading a page, paragraphs, tables, segments
src/core/detect/      auto-detect: what a page draws (shapes, tables), the rules that suggest fields (rules.ts), a
                      PDF's own fields (acroform.ts), boxes only learning suggests (candidates.ts); index.ts runs it
                      all
src/core/learn/       learning from the admin's saves: one module per kind of learning (pages, labels, drawn,
                      patterns), the lesson format and its check (lesson.ts), cues of a box (cues.ts), the small
                      models (model.ts); index.ts makes a lesson and applies them all
src/core/fixtures/    PDFs and the synthetic form maker (forms.ts) for tests
src/react/            FormEditor, FormFiller and their components; ui/ = small internal UI kit; editor/ = the
                      FormEditor's parts (toolbar, tools, document, side panel) and the state they share
src/server/           completedPdf (pdf-lib)
src/style.css         Tailwind source, compiled and scoped to .fl-root by scripts/build-css.mjs
example/              the live demo (deployed to GitHub Pages)
```

Each module starts with a few lines on what it does and how it fits in. Read them before you change one.

### How auto-detect and learning fit together

1. `detect/page.ts` reads a page: its drawing (`shapes.ts`) and text. `detect/rules.ts` turns that into suggestions,
   each with the rule that made it (its `kind`) and that rule's confidence.
2. `learn/` is given every lesson. Each kind of learning has two halves: `…Of(session)` writes its part of a lesson
   when the admin saves, and `…For(lessons)` applies what all lessons know at the next detection.
3. Pattern learning (`learn/patterns.ts`) does not look at words alone: every box gets its cues (`learn/cues.ts`),
   measured against the page's own text, so what is learnt in one form carries over to others. `detect/candidates.ts`
   proposes boxes the rules never suggest; they appear only once admins kept boxes like them.
4. Without lessons, detection is exactly the rules' output. Keep it so: learning only ever acts on lessons.

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run build
```

All three must pass, and CI runs them again on your PR.

- **Add a test** for every fix or feature. Logic tests go next to the file (`*.test.ts`), and UI tests use
  vitest + jsdom.
- **Auto-detect changes must stay generic.** Measure rules relative to the text height or box size, never
  absolute positions or the wording of one document. Add a small synthetic PDF to `src/core/fixtures/`
  (generated with pdf-lib) and a case in `detect.fixtures.test.ts` for the layout you fixed.
- **Measure learning changes.** `npm run eval` prints how many corrections forms auto-detect has never seen still
  need, without and with lessons, and what learning made worse. `src/core/learn/patterns.test.ts` fails when
  learning stops carrying over or makes a right field wrong.
- **Keep the core dependency-free.** `src/core` must not import React, pdf.js or pdf-lib at runtime.
- **Do not change the JSON shape** of `FieldDef`, `Layout` or `Answers` in a breaking way without an issue
  first, because stored forms depend on it.
- Keep pull requests focused: one fix or feature per PR.
- Update `README.md` when behaviour or API changes, and add a row to its "Upgrading" table when users must do
  something. Don't edit `CHANGELOG.md`: release-please writes it from the commit messages.

## Commit messages

formlift uses [Conventional Commits](https://www.conventionalcommits.org/). The version number and the changelog
are generated from them, so the prefix matters:

| Prefix | Meaning | Release |
| --- | --- | --- |
| `feat: ...` | a new feature | minor (0.1.x → 0.2.0) |
| `fix: ...` | a bug fix | patch (0.1.1 → 0.1.2) |
| `perf: ...` | a performance improvement | patch |
| `docs: ...` | documentation only | shown in the changelog, no release on its own |
| `refactor:`, `test:`, `build:`, `ci:`, `chore:` | internal changes | not in the changelog |
| `feat!: ...` or a `BREAKING CHANGE:` footer | breaking change | minor while below 1.0, then major |

Examples: `feat: detect checkboxes drawn as curves`, `fix: autosave after a failed save`,
`docs: add a Next.js recipe`. A one-change pull request is squash-merged, so the **PR title** is the commit message
and must follow the same format. A branch with several commits, each its own changelog entry, is merged with
"Rebase and merge" instead: a squash would turn them into one entry.

## Releasing (maintainer)

Releases are automatic ([release-please](https://github.com/googleapis/release-please)):

1. Every merge to `main` updates an open **"chore(main): release X.Y.Z"** pull request. It bumps
   `package.json` and writes `CHANGELOG.md` from the commit messages.
2. When you want to release, merge that pull request. The tag, the GitHub release and the staged npm
   version are created for you.
3. Approve the staged version on npmjs.com (Staged Packages). Only then does it go live.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
