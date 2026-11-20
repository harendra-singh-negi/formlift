// formlift live demo. It imports 'formlift/...' exactly like an app that installed the package (see vite.config.ts).
// Step 1 builds a form on a PDF, step 2 fills it, step 3 shows the JSON and code your app would deal with.
// Everything stays in this browser (localStorage); a real app saves through onSave on its own server.
import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { addLesson, validateAnswers, type Answers, type Comments, type Lesson } from 'formlift'
import { FormEditor, FormFiller, pdfTextLines, setPdfWorker, type FormDoc } from 'formlift/react'
import { completedPdf } from 'formlift/server'
import 'formlift/style.css'
import './demo.css'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { makeTour, tourOnFieldChange, type TourKind } from './tour'

setPdfWorker(workerUrl)

// Basic: the plain features (every field type, real forms). Advanced: form logic, and your own code next to it.
const TOURS: Record<string, TourKind> = { 'tour:types': 'types', 'tour:logic': 'logic' }
const SAMPLES = [
  { file: 'tour:types', label: 'Every field type', level: 'Basic' },
  { file: 'sample.pdf', label: 'Form', level: 'Basic' },
  { file: 'table-form.pdf', label: 'Form with a table', level: 'Basic' },
  { file: 'tour:logic', label: 'Form logic: groups, follow-ups, comments, your code', level: 'Advanced' },
] as const
type Step = 'build' | 'fill' | 'code'

const store = {
  get<T>(k: string): T | undefined {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null') ?? undefined
    } catch {
      return undefined
    }
  },
  /** false when it could not be kept (private mode, or full): the demo still works, it forgets on reload. */
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
      return true
    } catch {
      return false
    }
  },
}

const TOUR_HINTS: Record<TourKind, Record<Step, ReactNode>> = {
  types: {
    build: (
      <>
        <b>Basic · Every field type · Build.</b> All 20 types, each next to what it is for. Click one to see its
        settings on the right (placeholder, min / max, options, currency, stars…), then go to <b>Fill</b>.
      </>
    ),
    fill: (
      <>
        <b>Basic · Every field type · Fill.</b> Answer each one as its row says. <b>Submit</b> checks every rule;{' '}
        <b>Completed PDF</b> prints the answers.
      </>
    ),
    code: (
      <>
        <b>Basic · Code.</b> How each type is written in the form JSON, and the answer each one gives your app.
      </>
    ),
  },
  logic: {
    build: (
      <>
        <b>Advanced · Form logic · Build.</b> Click a field to see how it is set up on the right:{' '}
        <b>Group of boxes</b>, conditions (<b>Show only when</b>, <b>Required when</b>, <b>Read-only when</b>),{' '}
        <b>Follow-up questions</b>, <b>Allow comments</b>. The two "Your logic" rows are code: see{' '}
        <code>onFieldChange</code> in Step 3.
      </>
    ),
    fill: (
      <>
        <b>Advanced · Form logic · Fill.</b> Each row says how to try it: tick Yes / No / N/A, pick "Employed", answer
        "No" for a follow-up dialog, open a field's 💬 comments, switch on Incident. <b>Completed PDF</b> adds the
        follow-up answers and comments on pages at the end.
      </>
    ),
    code: (
      <>
        <b>Advanced · Code.</b> <code>group</code>, <code>followUp</code>, <code>dialogOnly</code>,{' '}
        <code>comments</code> and conditions in the form JSON; answers and comments as your app stores them.
      </>
    ),
  },
}

const HINTS: Record<Step, ReactNode> = {
  build: (
    <>
      <b>Step 1 · Build.</b> Fields were suggested automatically (dashed). Click one to edit it, drag new fields
      from the left, try <b>Edit text</b> or <b>Preview</b>, then go to <b>Fill</b>. <b>Ctrl+C</b> a field and{' '}
      <b>Ctrl+V</b> it on another spot: it is named after the text there. Give a table row's fields a{' '}
      <b>Repeatable row</b> and people can add rows. A field's <b>Key</b> can be typed (it must be unique). A
      file field chooses one file or <b>several</b>, and how many <b>photos in a row</b> show in the box and the PDF. Auto-detect learns from what you <b>Save</b>: press{' '}
      <b>Start over</b> and your changes come back.
    </>
  ),
  fill: (
    <>
      <b>Step 2 · Fill.</b> Answer on the page or switch to <b>List</b>. A long answer grows its box and moves the
      page down; <b>+ Add row</b> adds a table row. On a phone a file field offers <b>Camera</b>; <b>🔍+ / 🔍−</b> make its photos bigger or smaller; the list's{' '}
      <b>Photos / attachments</b> filter finds what is attached or still missing. Answers autosave, <b>Submit</b> checks the rules,{' '}
      <b>Completed PDF</b> downloads the PDF with your answers.
    </>
  ),
  code: (
    <>
      <b>Step 3 · Code.</b> This is what your app receives and stores: the form JSON from the builder's{' '}
      <code>onSave</code> and the answers from the filler's <code>onSave</code>.
    </>
  ),
}

// Uploads stay in this tab's memory (a real app stores them on its server through onUpload). Their bytes are read
// now: a picked File only points at the file on disk, which may change or go before the PDF is made (Firefox then
// refuses to read it: "The operation was aborted").
const uploads = new Map<string, File>()
const onUpload = async (field: { key: string }, file: File) => {
  const id = crypto.randomUUID()
  uploads.set(id, new File([await file.arrayBuffer()], file.name, { type: file.type }))
  return { id, fieldKey: field.key, fileName: file.name, fileSize: file.size }
}
const loadFile = async (id: string) => uploads.get(id) ?? Promise.reject(new Error('Not in this tab any more'))

// The tour's PDF and starting form are drawn in the browser (tour.ts), once.
const tourReady: Partial<Record<TourKind, ReturnType<typeof makeTour>>> = {}
function useTour(kind: TourKind | undefined) {
  const [tour, setTour] = useState<{ kind: TourKind; doc: Awaited<ReturnType<typeof makeTour>> } | null>(null)
  useEffect(() => {
    if (!kind) return
    let live = true
    void (tourReady[kind] ??= makeTour(kind)).then((doc) => live && setTour({ kind, doc }))
    return () => {
      live = false
    }
  }, [kind])
  return kind && tour?.kind === kind ? tour.doc : null
}

function Demo() {
  const [sample, setSample] = useState(() => store.get<string>('fl-sample') ?? SAMPLES[0].file)
  const [upload, setUpload] = useState<File | null>(null)
  const tourKind = upload ? undefined : TOURS[sample]
  const tour = useTour(tourKind)
  const isTour = !!tourKind
  const pdf: Blob | string | undefined = upload ?? (isTour ? tour?.pdf : `./${sample}`)
  const docKey = upload ? `upload:${upload.name}:${upload.size}` : sample
  const [form, setForm] = useState<FormDoc | undefined>(() => store.get(`fl-form:${docKey}`))
  const [answers, setAnswers] = useState<Answers | undefined>(() => store.get(`fl-answers:${docKey}`))
  const [comments, setComments] = useState<Comments | undefined>(() => store.get(`fl-comments:${docKey}`))
  const [step, setStep] = useState<Step>('build')
  const [toast, setToast] = useState('')
  // What auto-detect learnt from every save, for all PDFs (a real app keeps them on its server: see the README).
  const [lessons, setLessons] = useState<Lesson[]>(() => store.get('fl-lessons') ?? [])
  const [round, setRound] = useState(0)
  // the tour starts from its ready-made form (each feature already set up)
  const startForm = form ?? (isTour ? tour?.form : undefined)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function openDoc(key: string, next: () => void) {
    next()
    setForm(store.get(`fl-form:${key}`))
    setAnswers(store.get(`fl-answers:${key}`))
    setComments(store.get(`fl-comments:${key}`))
    setStep('build')
  }

  async function downloadCompleted() {
    if (!startForm || !pdf) return
    const bytes = typeof pdf === 'string' ? await (await fetch(pdf)).arrayBuffer() : await pdf.arrayBuffer()
    // The files people attached (kept in this tab), so photos print; the page's text, so growing boxes do not smear it.
    const files = Object.fromEntries(
      await Promise.all(
        [...uploads].map(async ([id, f]) => {
          try {
            return [[id, { bytes: new Uint8Array(await f.arrayBuffer()), fileName: f.name, fileType: f.type }] as const]
          } catch {
            return [] // unreadable: the PDF is made without it
          }
        }),
      ).then((l) => l.flat()),
    )
    const textLines = await pdfTextLines(bytes)
    const out = await completedPdf(bytes, startForm.fields, answers ?? {}, files, startForm.layout, { comments, textLines })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' }))
    a.download = 'completed.pdf'
    a.click()
  }

  const errors = useMemo(
    () => (startForm ? validateAnswers(startForm.fields, answers ?? {}) : {}),
    [startForm, answers],
  )
  const noFields = !startForm?.fields.length

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
            {(['Basic', 'Advanced'] as const).map((level) => (
              <optgroup key={level} label={level}>
                {SAMPLES.filter((s) => s.level === level).map((s) => (
                  <option key={s.file} value={s.file}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
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
      <p className="hint">{(tourKind ? TOUR_HINTS[tourKind] : HINTS)[step]}</p>
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}

      <main className="main">
        {!pdf && <p className="loading">Preparing the tour…</p>}
        {step === 'build' && pdf && (
          <FormEditor
            key={`${docKey}:${round}`}
            pdf={pdf}
            initialValue={startForm}
            title={upload?.name ?? SAMPLES.find((s) => s.file === sample)?.label}
            // the tours come ready-made: no auto-detect on top of them
            autoDetect={isTour ? false : undefined}
            // The demo follows every change so Fill / Code always show the latest; Save also keeps it on reload.
            onChange={setForm}
            // Long documents too (a 1001-page form with 12 000 fields). Your app sets its own, the same as its server.
            limits={{ maxFields: 20_000, maxPages: 2_000 }}
            onSave={(doc) => {
              setForm(doc)
              store.set(`fl-form:${docKey}`, doc)
            }}
            lessons={lessons}
            onLesson={(lesson) =>
              setLessons((list) => {
                let next = addLesson(list, lesson, 50)
                // localStorage keeps about 5 MB: when a big form's lessons do not fit, the oldest go first.
                while (!store.set('fl-lessons', next) && next.length > 1) next = next.slice(1)
                return next
              })
            }
            notify={setToast}
            toolbar={
              !isTour && (
                <button
                  className="btn ghost"
                  title="Remove this form's fields and detect again, with what auto-detect learnt from your saves"
                  onClick={() => {
                    store.set(`fl-form:${docKey}`, null)
                    setForm(undefined)
                    setRound((r) => r + 1)
                  }}
                >
                  Start over
                </button>
              )
            }
            onError={(e) => alert(e instanceof Error ? e.message : String(e))}
          />
        )}
        {step === 'fill' && startForm && pdf && (
          <FormFiller
            key={docKey}
            pdf={pdf}
            fields={startForm.fields}
            layout={startForm.layout}
            title="Fill the form"
            commentAuthor="Demo user"
            initialAnswers={answers}
            initialComments={comments}
            onUpload={onUpload}
            loadFile={loadFile}
            // Advanced: your own logic next to the editor's settings
            onFieldChange={tourKind === 'logic' ? tourOnFieldChange : undefined}
            notify={setToast}
            // Your own loader in the list view while the PDF is read (default: a line of text)
            renderListReading={({ done, total }) => (
              <div className="reading" role="status">
                <span>Reading page {done} of {total}</span>
                <progress value={done} max={total} />
              </div>
            )}
            onSave={(a, info) => {
              setAnswers(a)
              setComments(info.comments)
              store.set(`fl-answers:${docKey}`, a)
              store.set(`fl-comments:${docKey}`, info.comments)
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
        {step === 'code' && startForm && (
          <CodeView
            name={upload?.name ?? sample}
            form={startForm}
            answers={answers ?? {}}
            comments={comments ?? {}}
            errors={errors}
            lessons={lessons}
          />
        )}
      </main>
    </div>
  )
}

function CodeView({
  name,
  form,
  answers,
  comments,
  errors,
  lessons,
}: {
  name: string
  form: FormDoc
  answers: Answers
  comments: Comments
  errors: Record<string, string>
  lessons: Lesson[]
}) {
  const json = (v: unknown) => JSON.stringify(v, null, 2)
  // The form JSON as a file next to its PDF ("form.pdf" → "form.json"): what `npm run eval:real` scores against.
  function download() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([json(form)], { type: 'application/json' }))
    a.download = `${name.replace(/^.*\//, '').replace(/\.pdf$/i, '')}.json`
    a.click()
  }
  const usage = `import { FormEditor, FormFiller } from 'formlift/react'
import { validateAnswers } from 'formlift'
import 'formlift/style.css'

// Builder: onSave receives the "Form JSON" shown here; store it.
// onLesson: what each save taught auto-detect; store them all and pass them back as lessons
<FormEditor pdf={pdfUrl} initialValue={form} onSave={saveForm}
  lessons={lessons} onLesson={saveLesson} />

// Filler: onSave receives the "Answers" and "Comments" shown here; store them
<FormFiller pdf={pdfUrl} fields={form.fields} layout={form.layout}
  commentAuthor={user.name}
  onFieldChange={(field, value, api) => { /* your own rules: api.setAnswer, api.openDialog, api.notify */ }}
  onSave={(answers, { submit, comments }) => saveAnswers(answers, comments, submit)} />

// Server: the same rules, so nobody can skip them
validateAnswers(form.fields, answers) // → ${json(errors).replace(/\n\s*/g, ' ')}`
  return (
    <div className="code">
      <section className="card">
        <h3>
          Form JSON <span>{form.fields.length} fields · FormEditor onSave</span>{' '}
          <button className="btn ghost" onClick={download}>
            Download
          </button>
        </h3>
        <pre>{json(form)}</pre>
      </section>
      <section className="card">
        <h3>
          Answers <span>FormFiller onSave</span>
        </h3>
        <pre>{json(answers)}</pre>
      </section>
      <section className="card">
        <h3>
          Comments <span>onSave info.comments</span>
        </h3>
        <pre>{json(comments)}</pre>
      </section>
      <section className="card">
        <h3>
          Lessons <span>{lessons.length} · FormEditor onLesson</span>
        </h3>
        <pre>{json(lessons)}</pre>
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
