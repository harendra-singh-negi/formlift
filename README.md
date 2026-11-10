<div align="center">

# formlift

**Turn any PDF into a fillable web form, with no AI and no server-side conversion.**

Auto-detect fields · Drag-and-drop builder · Conditional logic · Validation · Fill-in UI · Completed PDF

[![npm version](https://img.shields.io/npm/v/formlift?color=0f766e&label=npm)](https://www.npmjs.com/package/formlift)
[![npm downloads](https://img.shields.io/npm/dm/formlift?color=0f766e)](https://www.npmjs.com/package/formlift)
[![types](https://img.shields.io/npm/types/formlift?color=0f766e)](https://www.npmjs.com/package/formlift)
[![license](https://img.shields.io/npm/l/formlift?color=0f766e)](./LICENSE)
[![CI](https://github.com/harendra-singh-negi/formlift/actions/workflows/ci.yml/badge.svg)](https://github.com/harendra-singh-negi/formlift/actions/workflows/ci.yml)

**[▶ Live demo](https://harendra-singh-negi.github.io/formlift/)** · [Quick start](#quick-start) · [API](#api-reference) · [Server](#server-side) · [Theming](#theming) · [FAQ](#faq)

<img src="./docs/builder.png" alt="formlift builder: suggested fields over a PDF page" width="860" />

</div>

---

## Why formlift?

Most organisations already have their forms as PDFs: inspection checklists, onboarding sheets, permits, audit
reports. Rebuilding each one in a form tool takes days and loses the original layout.

**formlift keeps the PDF as it is** and puts real form fields on top of it:

1. **Upload** a PDF. formlift reads the page drawing and **suggests fields** for dotted lines, underlines,
   checkboxes, `____` blanks and empty table cells.
2. **Adjust** them in the builder: rename, retype, move, add rules and conditions.
3. **Publish.** People fill the form on the original page, on desktop or phone.
4. **Export** a completed PDF with the answers, signatures and attachments.

The original file is never modified. The whole form is plain JSON that you store wherever you like.

## Live demo

**[Try it in your browser →](https://harendra-singh-negi.github.io/formlift/)**

The demo runs the same components you install from npm:

1. **Build**: open a sample PDF or upload your own, review the suggested fields and edit them.
2. **Fill**: answer the form on the page or in the list view, then download the completed PDF.
3. **Code**: see the exact JSON your app receives from `onSave` and the code that wires it up.

Nothing is uploaded. Your PDF and answers stay in your browser. To run the demo locally, use `npm run dev`.

## Features

| | |
| --- | --- |
| 🔍 **Auto-detect** | Answer lines, checkboxes, typed blanks and table cells come from the PDF's own vector drawing. Sizes are measured relative to the text, so it works at any font size, scale or orientation. |
| 🧱 **Builder** | 11 field types, drag/resize/snap-to-grid, undo/redo, keyboard shortcuts, fill order, page reorder/insert/delete |
| ✏️ **Layout editing** | Add text, boxes and lines, or click any line of the original text to replace it, all without touching the file |
| 🔀 **Conditional logic** | `visibleWhen` / `requiredWhen` / `readOnlyWhen` with nested AND/OR groups and 10 operators. Circular rules are rejected. |
| ✅ **Validation** | Required, length, min/max, regex, email, phone, date and options. The **same code** runs in the browser and on your server. |
| 📱 **Filler** | Fields stay pinned to the page at every zoom, plus a list view with search and filters for phones. Includes autosave, signatures and file uploads. |
| 📄 **Completed PDF** | Answers, signature images and embedded attachments in a new PDF. Runs in Node, Bun, Deno, workers or the browser. |
| 🎨 **Isolated styling** | All CSS is scoped to `.fl-root` with no global reset, so it never clashes with your app (Tailwind included). Theme it with CSS variables. |
| 🧩 **Headless core** | Zero-dependency core you can use with any framework, or with none |
| 🟦 **TypeScript** | Written in TypeScript. Ships ESM, CommonJS and full type definitions. |

<div align="center">
<img src="./docs/filler.png" alt="formlift filler: answering fields on the original page" width="860" />
</div>

## Packages

One install, four entry points. Import only what you use:

| Entry | Contents | Needs |
| --- | --- | --- |
| `formlift` | Types, validation, conditions, auto-detect, helpers | – |
| `formlift/react` | `<FormEditor>`, `<FormFiller>`, `<PdfPages>`, `setPdfWorker` | `react`, `react-dom`, `pdfjs-dist`, `lucide-react` |
| `formlift/server` | `completedPdf()` | `pdf-lib` |
| `formlift/style.css` | Styles for the React components | – |

## Installation

```bash
npm install formlift
# or
pnpm add formlift
# or
yarn add formlift
```

Or install straight from GitHub (it builds on install), from a release tag or from a branch:

```bash
npm install github:harendra-singh-negi/formlift#v0.1.0
npm install github:harendra-singh-negi/formlift          # latest main
```

Then add the peer dependencies for the parts you use:

```bash
npm install react react-dom pdfjs-dist lucide-react   # React UI
npm install pdf-lib                                   # completed PDF
```

**Requirements:** React 18 or 19 · pdfjs-dist 4+ · Node 18+ · browsers with CSS `@scope` support (Chrome/Edge 118+,
Safari 17.4+, Firefox 128+).

## Quick start

### 1. Configure pdf.js (once, at app start)

```ts
import { setPdfWorker } from 'formlift/react'
import 'formlift/style.css'

// Vite
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
setPdfWorker(workerUrl)

// webpack 5 / Next.js
// setPdfWorker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString())
```

> If you skip this step, the worker is loaded from unpkg.com for the installed pdfjs-dist version. That works,
> but it needs internet access and is blocked by a strict CSP.

### 2. Build a form (admin)

```tsx
import { FormEditor, type FormDoc } from 'formlift/react'

export function FormBuilder({ pdfUrl, saved }: { pdfUrl: string; saved?: FormDoc }) {
  return (
    <div style={{ height: '100vh' }}>
      <FormEditor
        pdf={pdfUrl}
        initialValue={saved}
        title="Crew onboarding"
        onSave={(doc) =>
          fetch('/api/forms/42', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(doc),
          })
        }
      />
    </div>
  )
}
```

### 3. Fill it (users)

```tsx
import { FormFiller, type FormDoc } from 'formlift/react'

export function FillForm({ pdfUrl, form }: { pdfUrl: string; form: FormDoc }) {
  return (
    <div style={{ height: '100vh' }}>
      <FormFiller
        pdf={pdfUrl}
        fields={form.fields}
        layout={form.layout}
        onSave={async (answers, { submit }) => {
          const res = await fetch('/api/forms/42/answers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, submit }),
          })
          // Throw { errors: { fieldKey: message } } and the messages appear at the fields
          if (!res.ok) throw await res.json()
        }}
        onSubmitted={() => alert('Thank you!')}
      />
    </div>
  )
}
```

That's it. Both components fill the height of their container.

## Server side

**Never trust the browser.** Run the same checks on your server with the core package:

```ts
import express from 'express'
import { cleanAnswers, validateAnswers, validateFields, validateLayout } from 'formlift'
import { completedPdf } from 'formlift/server'

const app = express().use(express.json({ limit: '5mb' }))

// Save a form definition
app.put('/api/forms/:id', async (req, res) => {
  const { fields, layout } = req.body
  const pageCount = await pagesOfUploadedPdf(req.params.id)
  const problems = [...validateFields(fields, pageCount), ...(layout ? validateLayout(layout, pageCount) : [])]
  if (problems.length) return res.status(400).json({ problems })
  await db.forms.update(req.params.id, { fields, layout })
  res.sendStatus(204)
})

// Save or submit answers
app.post('/api/forms/:id/answers', async (req, res) => {
  const form = await db.forms.get(req.params.id)
  const answers = cleanAnswers(form.fields, req.body.answers) // drops unknown keys, coerces types
  if (req.body.submit) {
    const errors = validateAnswers(form.fields, answers) // {} = valid; hidden fields are skipped
    if (Object.keys(errors).length) return res.status(422).json({ errors })
  }
  await db.submissions.save(req.params.id, answers, req.body.submit)
  res.sendStatus(204)
})

// Download the completed PDF
app.get('/api/submissions/:id/pdf', async (req, res) => {
  const { form, answers, files } = await db.submissions.full(req.params.id)
  const pdf = await completedPdf(form.originalPdf, form.fields, answers, files, form.layout)
  res.type('application/pdf').send(Buffer.from(pdf))
})
```

`files` maps a file answer's id to `{ fileName, fileType, bytes }`. Signatures are drawn as images and
uploads are embedded as PDF attachments.

## API reference

### `<FormEditor>`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `pdf` | `PdfSource` | **required** | The PDF: a URL, `Blob`/`File`, `ArrayBuffer`, `Uint8Array`, or an (async) function that returns one |
| `onSave` | `(doc: FormDoc) => unknown` | **required** | Called on Save. Throw or reject to keep the changes marked unsaved. |
| `initialValue` | `FormDoc` | empty | The saved form. To load a different one, remount with a new `key`. |
| `onChange` | `(doc: FormDoc) => void` | – | Called on every change, including undo and redo |
| `autoDetect` | `boolean` | new forms only | Runs field detection when the PDF opens |
| `title` | `ReactNode` | – | Toolbar title |
| `onBack` | `() => void` | – | Shows a Back button |
| `toolbar` | `ReactNode` | – | Your buttons at the end of the toolbar, such as a workflow status or Publish |
| `banner` | `ReactNode` | – | A strip under the toolbar |
| `tabs` | `{ id, label, content }[]` | `[]` | Extra tabs in the side panel, such as History |
| `notify` | `(msg: string) => void` | no-op | Success messages: connect your toast system here |
| `onError` | `(err: unknown) => void` | `console.error` | Error messages |
| `className` | `string` | `'h-full'` | Classes on the root element |
| `ref` | `Ref<FormEditorHandle>` | – | `{ save(), dirty, value }`, for example to save before a workflow step |

**Keyboard:** <kbd>Del</kbd> delete · <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo/redo ·
<kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · arrow keys nudge (hold <kbd>Shift</kbd> for larger steps) ·
<kbd>Esc</kbd> deselect

### `<FormFiller>`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `pdf` | `PdfSource` | **required** | The PDF |
| `fields` | `FieldDef[]` | **required** | The form's fields |
| `layout` | `Layout \| null` | `null` | The form's layout (`null` = the original pages) |
| `initialAnswers` | `Answers` | field defaults | A draft to continue |
| `onSave` | `(answers, { submit }) => unknown` | – | Called for drafts and autosave (`submit: false`) and for submit (`true`). Throw `{ errors }` to show field errors. |
| `onSubmitted` | `(answers) => void` | – | Called after a successful submit |
| `autosave` | `number \| false` | `2500` | Delay in ms after the last change |
| `onUpload` | `(field, file) => Promise<AnswerFileInfo>` | – | Stores an uploaded file or a signature PNG and returns its `id`. Without it, file fields are read-only and signatures are kept as data URLs. |
| `loadFile` | `(id) => Promise<Blob>` | – | Loads stored signatures and opens attachments |
| `files` | `AnswerFileInfo[]` | `[]` | Files already attached to the draft |
| `readOnly` | `boolean` | `false` | View a submitted form |
| `title`, `onBack`, `toolbar`, `notify`, `onError`, `className` | | | Same as `FormEditor` |

### Core functions (`formlift`)

| Function | Returns | Description |
| --- | --- | --- |
| `validateFields(fields, pageCount)` | `string[]` | Problems in a form definition: shapes, unique keys, positions, options, regexes, condition references and cycles |
| `validateLayout(layout, pageCount)` | `string[]` | Problems in a layout |
| `validateAnswers(fields, answers)` | `Record<key, message>` | Problems in the answers, with conditions applied |
| `cleanAnswers(fields, input)` | `Answers` | Keeps only known keys with the right value types |
| `checkAnswer(field, value, required)` | `string \| null` | Checks a single answer |
| `fieldStates(fields, answers)` | `Record<key, { visible, required, readOnly }>` | Applies the conditions |
| `evaluate(condition, answers)` | `boolean` | Evaluates one condition |
| `defaultAnswers(fields)` | `Answers` | The answers a new submission starts with |
| `defaultLayout(pageSizes)` | `Layout` | The layout of an untouched document |
| `detectDocument(pdf, OPS, pages, existing, onProgress?, signal?)` | `Promise<FieldDef[]>` | Suggests fields for a whole document |
| `toQuestions(fields, textOf?)` | `Question[]` | Fields grouped as questions, used by the list view |

### Server (`formlift/server`)

```ts
completedPdf(
  original: Uint8Array | ArrayBuffer,
  fields: FieldDef[],
  answers: Answers,
  files?: Record<string, { fileName: string; fileType: string; bytes: Uint8Array }>,
  layout?: Layout | null,
): Promise<Uint8Array>
```

### Data model

A form is plain, serialisable JSON:

```ts
type FormDoc = { fields: FieldDef[]; layout: Layout | null }

interface FieldDef {
  id: string
  key: string // answer key: starts with a letter; letters, digits and _
  type: 'text' | 'textarea' | 'number' | 'date' | 'email' | 'phone'
      | 'dropdown' | 'radio' | 'checkbox' | 'file' | 'signature'
  label: string
  source: 'manual' | 'ai' // 'ai' = suggested by auto-detect
  confidence?: number
  position: { page: number; x: number; y: number; width: number; height: number } // 0..1 of the page, origin top-left
  placeholder?: string
  helpText?: string
  defaultValue?: string
  required?: boolean
  readOnly?: boolean
  hidden?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  options?: string[] // dropdown, radio
  visibleWhen?: Condition
  requiredWhen?: Condition
  readOnlyWhen?: Condition
}

interface Condition {
  logic: 'and' | 'or'
  rules: (Rule | Condition)[]
}

interface Rule {
  fieldKey: string
  op: 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'endsWith'
    | 'greaterThan' | 'lessThan' | 'between' | 'isEmpty' | 'isNotEmpty'
  value?: string
  value2?: string // upper bound for 'between'
}

type Answers = Record<string, string | boolean | null>
// checkbox → boolean · file / signature → your file id · everything else → string
```

Positions are stored as page fractions, so a field never moves when the zoom or screen size changes.

## Recipes

<details>
<summary><b>Next.js (App Router)</b></summary>

The components use browser APIs, so render them on the client:

```tsx
'use client'
import dynamic from 'next/dynamic'
import 'formlift/style.css'

const FormEditor = dynamic(() => import('formlift/react').then((m) => m.FormEditor), { ssr: false })
```

</details>

<details>
<summary><b>Loading a PDF that needs authentication</b></summary>

```tsx
<FormFiller
  pdf={() => fetch(`/api/forms/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.blob())}
  fields={form.fields}
/>
```

</details>

<details>
<summary><b>Approval workflow (draft → review → publish)</b></summary>

formlift has no opinion about workflows. Add your own buttons and save first through the ref:

```tsx
const editor = useRef<FormEditorHandle>(null)

<FormEditor
  ref={editor}
  pdf={pdf}
  onSave={save}
  banner={status === 'published' && <p className="notice">This version is live.</p>}
  toolbar={
    <button onClick={async () => (await editor.current!.save()) && sendForReview()}>
      Send for review
    </button>
  }
  tabs={[{ id: 'history', label: 'History', content: <History formId={id} /> }]}
/>
```

</details>

<details>
<summary><b>Auto-detect without React (Node or any framework)</b></summary>

```ts
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { detectDocument, type Ops } from 'formlift'

const pdf = await getDocument({ data }).promise
const pages = []
for (let i = 1; i <= pdf.numPages; i++) {
  const [x0, y0, x1, y1] = (await pdf.getPage(i)).view
  pages.push({ source: i, width: x1 - x0, height: y1 - y0 })
}
const fields = await detectDocument(pdf, OPS as unknown as Ops, pages, [])
```

</details>

## Theming

The styles live inside `.fl-root` and have no global reset. Override any variable to match your brand:

```css
.fl-root {
  --fl-primary: #7c3aed;
  --fl-primary-hover: #6d28d9;
  --fl-primary-soft: #f5f3ff;
  --fl-primary-tint: #ede9fe;
  --fl-heading: #8b5cf6;   /* panel headings */
  --fl-accent: #f59e0b;    /* suggested fields */
  --fl-font: 'Inter', sans-serif;
}
```

The full list of variables is in [`src/style.css`](./src/style.css).

## Security

- Run `validateFields` / `validateLayout` when a form is saved, and `cleanAnswers` + `validateAnswers` when
  answers are submitted. Browser-side checks are for user experience only.
- pdf.js runs with `isEvalSupported: false`, so code embedded in a document is never compiled.
- Patterns in fields (`pattern`) are compiled safely. An invalid regex is rejected, never thrown.
- formlift never uploads anything on its own. All network traffic goes through your callbacks.

## Limitations

- **Text-based PDFs.** Scanned (image-only) PDFs have no vector drawing to detect, and there is no OCR. Fields
  can still be placed by hand.
- **Latin fonts in the completed PDF.** It uses the standard PDF fonts (WinAnsi), so other scripts print as `?`.
- **Rotated pages** (`/Rotate`) are not handled in the completed PDF.
- **PDF only.** Export Word or Excel files to PDF first.

## FAQ

**Does it use AI or send my documents anywhere?**
No. Detection is geometric and runs locally in the browser (or in Node). Nothing leaves your app unless your
own callbacks send it.

**Can I use it without React?**
Yes. `formlift` and `formlift/server` have no UI. The React package is one way to render the form, and
`FieldDef` positions make it straightforward to render with any framework.

**Where are forms stored?**
Wherever you want. A form is `{ fields, layout }` JSON and answers are a flat `{ key: value }` object.

**Will the styles conflict with Tailwind or my design system?**
No. Every rule and CSS variable is scoped to `.fl-root`.

## Contributing

Contributions are welcome: bug reports, fixes, new auto-detect cases and docs. Read
[CONTRIBUTING.md](./CONTRIBUTING.md) for the setup and guidelines. In short:

```bash
git clone https://github.com/<your-username>/formlift.git && cd formlift
npm install        # installs and builds
npm run dev        # live demo at http://localhost:5173
npm test           # must pass before a pull request
```

## License

[MIT](./LICENSE) © Harendra Singh Negi
