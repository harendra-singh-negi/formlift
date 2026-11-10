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
src/core/      framework-free logic: form model, validation, conditions, auto-detect (detect.ts), questions
src/react/     FormEditor, FormFiller and their components; ui/ = small internal UI kit
src/server/    completedPdf (pdf-lib)
src/style.css  Tailwind source, compiled and scoped to .fl-root by scripts/build-css.mjs
example/       the live demo (deployed to GitHub Pages)
```

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
- **Keep the core dependency-free.** `src/core` must not import React, pdf.js or pdf-lib at runtime.
- **Do not change the JSON shape** of `FieldDef`, `Layout` or `Answers` in a breaking way without an issue
  first, because stored forms depend on it.
- Keep pull requests focused: one fix or feature per PR.
- Update `README.md` and `CHANGELOG.md` (under "Unreleased") when behaviour or API changes.

## Commit messages

Short and in the imperative mood, for example: `Detect checkboxes drawn as curves`,
`Fix autosave after a failed save`.

## Releasing (maintainer)

1. Update `version` in `package.json` and move the "Unreleased" notes in `CHANGELOG.md` to the new version.
2. Commit, then create a GitHub release with the tag `vX.Y.Z`. The Release workflow stages it on npm through
   Trusted Publishing (no token).
3. Approve the staged version on npmjs.com (Staged Packages) or with `npm stage approve <id>`. Only then does it go
   live.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
