// formlift live demo. It imports 'formlift/...' exactly like an app that installed the package (see vite.config.ts).
// Step 1 builds a form on a PDF, step 2 fills it, step 3 shows the JSON and code your app would deal with.
// Everything stays in this browser (localStorage); a real app saves through onSave on its own server.
import { StrictMode, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { validateAnswers, type Answers } from 'formlift'
import { FormEditor, FormFiller, setPdfWorker, type FormDoc } from 'formlift/react'
import { completedPdf } from 'formlift/server'
import 'formlift/style.css'
import './demo.css'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

setPdfWorker(workerUrl)

const SAMPLES = [
  { file: 'sample.pdf', label: 'Inspection form' },
  { file: 'table-form.pdf', label: 'Form with a table' },
]
type Step = 'build' | 'fill' | 'code'

const store = {
  get<T>(k: string): T | undefined {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null') ?? undefined
    } catch {
      return undefined
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* private mode: the demo still works, it just forgets on reload */
    }
  },
}

const HINTS: Record<Step, ReactNode> = {
  build: (
    <>
      <b>Step 1 · Build.</b> Fields were suggested automatically (dashed). Click one to edit it, drag new fields
      from the left, try <b>Edit text</b> or <b>Preview</b>, then go to <b>Fill</b>.
    </>
  ),
  fill: (
    <>
      <b>Step 2 · Fill.</b> Answer on the page or switch to <b>List</b>. Answers autosave, <b>Submit</b> checks
      the rules, <b>Completed PDF</b> downloads the PDF with your answers.
    </>
  ),
  code: (
    <>
      <b>Step 3 · Code.</b> This is what your app receives and stores: the form JSON from the builder's{' '}
      <code>onSave</code> and the answers from the filler's <code>onSave</code>.
    </>
  ),
}

function Demo() {
  const [sample, setSample] = useState(() => store.get<string>('fl-sample') ?? SAMPLES[0].file)
  const [upload, setUpload] = useState<File | null>(null)
  const pdf: Blob | string = upload ?? `./${sample}`
  const docKey = upload ? `upload:${upload.name}:${upload.size}` : sample
  const [form, setForm] = useState<FormDoc | undefined>(() => store.get(`fl-form:${docKey}`))
  const [answers, setAnswers] = useState<Answers | undefined>(() => store.get(`fl-answers:${docKey}`))
  const [step, setStep] = useState<Step>('build')

  function openDoc(key: string, next: () => void) {
    next()
    setForm(store.get(`fl-form:${key}`))
    setAnswers(store.get(`fl-answers:${key}`))
    setStep('build')
  }

  async function downloadCompleted() {
    if (!form) return
    const bytes = typeof pdf === 'string' ? await (await fetch(pdf)).arrayBuffer() : await pdf.arrayBuffer()
    const out = await completedPdf(bytes, form.fields, answers ?? {}, {}, form.layout)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' }))
    a.download = 'completed.pdf'
    a.click()
  }

  const errors = useMemo(() => (form ? validateAnswers(form.fields, answers ?? {}) : {}), [form, answers])
  const noFields = !form?.fields.length

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">
          formlift<small>PDF → fillable form · live demo</small>
        </span>
        <nav className="steps" role="tablist">
          {(['build', 'fill', 'code'] as Step[]).map((s, i) => (
            <button
              key={s}
              role="tab"
              aria-selected={step === s}
              disabled={s !== 'build' && noFields}
              title={s !== 'build' && noFields ? 'Add at least one field first' : undefined}
              onClick={() => setStep(s)}
            >
              {i + 1}. {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </nav>
        <div className="pick">
          <select
            aria-label="Sample PDF"
            value={upload ? '' : sample}
            onChange={(e) => {
              const file = e.target.value
              openDoc(file, () => {
                setUpload(null)
                setSample(file)
                store.set('fl-sample', file)
              })
            }}
          >
            {upload && <option value="">{upload.name}</option>}
            {SAMPLES.map((s) => (
              <option key={s.file} value={s.file}>
                {s.label}
              </option>
            ))}
          </select>
          <label>
            Use your PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) openDoc(`upload:${f.name}:${f.size}`, () => setUpload(f))
                e.target.value = ''
              }}
            />
          </label>
          <span className="links">
            <a href="https://github.com/harendra-singh-negi/formlift" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/formlift" target="_blank" rel="noreferrer">
              npm
            </a>
          </span>
        </div>
      </header>
      <p className="hint">{HINTS[step]}</p>

      <main className="main">
        {step === 'build' && (
          <FormEditor
            key={docKey}
            pdf={pdf}
            initialValue={form}
            title={upload?.name ?? SAMPLES.find((s) => s.file === sample)?.label}
            // The demo follows every change so Fill / Code always show the latest; Save also keeps it on reload.
            onChange={setForm}
            onSave={(doc) => {
              setForm(doc)
              store.set(`fl-form:${docKey}`, doc)
            }}
            onError={(e) => alert(e instanceof Error ? e.message : String(e))}
          />
        )}
        {step === 'fill' && form && (
          <FormFiller
            key={docKey}
            pdf={pdf}
            fields={form.fields}
            layout={form.layout}
            title="Fill the form"
            initialAnswers={answers}
            onSave={(a) => {
              setAnswers(a)
              store.set(`fl-answers:${docKey}`, a)
            }}
            onSubmitted={() => setStep('code')}
            toolbar={
              <button className="btn ghost" onClick={() => void downloadCompleted()}>
                Completed PDF
              </button>
            }
            onError={(e) => console.warn(e)}
          />
        )}
        {step === 'code' && form && <CodeView form={form} answers={answers ?? {}} errors={errors} />}
      </main>
    </div>
  )
}

function CodeView({ form, answers, errors }: { form: FormDoc; answers: Answers; errors: Record<string, string> }) {
  const json = (v: unknown) => JSON.stringify(v, null, 2)
  const usage = `import { FormEditor, FormFiller } from 'formlift/react'
import { validateAnswers } from 'formlift'
import 'formlift/style.css'

// Builder: onSave receives the "Form JSON" shown here; store it
<FormEditor pdf={pdfUrl} initialValue={form} onSave={saveForm} />

// Filler: onSave receives the "Answers" shown here; store them
<FormFiller pdf={pdfUrl} fields={form.fields} layout={form.layout}
  onSave={(answers, { submit }) => saveAnswers(answers, submit)} />

// Server: the same rules, so nobody can skip them
validateAnswers(form.fields, answers) // → ${json(errors).replace(/\n\s*/g, ' ')}`
  return (
    <div className="code">
      <section className="card">
        <h3>
          Form JSON <span>{form.fields.length} fields · FormEditor onSave</span>
        </h3>
        <pre>{json(form)}</pre>
      </section>
      <section className="card">
        <h3>
          Answers <span>FormFiller onSave</span>
        </h3>
        <pre>{json(answers)}</pre>
      </section>
      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <h3>
          Your code <span>npm i formlift</span>
        </h3>
        <pre>{usage}</pre>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
