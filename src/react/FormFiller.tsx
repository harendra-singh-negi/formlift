import { ArrowLeft, Download, Paperclip, Save, Send } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { boxStyle } from '../core/coords'
import {
  checkAnswer,
  defaultAnswers,
  fieldStates,
  validateAnswers,
  type Answers,
  type AnswerValue,
  type FieldDef,
  type Layout,
} from '../core/form-logic'
import { toLines, type PdfTextItem, type TextLine } from '../core/layout'
import { toQuestions } from '../core/questions'
import FieldControl from './components/FieldControl'
import LayoutElementView from './components/LayoutElementView'
import PdfPages, { type PdfSource } from './components/PdfPages'
import QuestionList from './components/QuestionList'
import ZoomControls from './components/ZoomControls'
import { useCompact, useFitZoom } from './hooks/useFitZoom'
import Button from './ui/Button'
import { ConfirmModal } from './ui/Modal'
import SegmentedTabs from './ui/SegmentedTabs'

/** A file answer (upload or signature PNG) as your storage knows it. The answer's value is its `id`. */
export interface AnswerFileInfo {
  id: string
  fieldKey: string
  fileName: string
  /** Bytes, for the size shown next to the name. */
  fileSize?: number
}

export interface FormFillerProps {
  /** The PDF: URL, Blob / File, bytes, or a function returning one. */
  pdf: PdfSource
  fields: FieldDef[]
  layout?: Layout | null
  title?: ReactNode
  /** A draft to continue. Default: each field's default value. */
  initialAnswers?: Answers
  /** Files already attached to these answers. */
  files?: AnswerFileInfo[]
  /** View only (a submitted form): no Save / Submit. */
  readOnly?: boolean
  /**
   * Save a draft (`submit: false`, also autosave) or submit (answers already pass validateAnswers — check again on
   * your server). Throw `{ errors: { fieldKey: message } }` to show errors at the fields.
   */
  onSave?: (answers: Answers, info: { submit: boolean }) => unknown
  /** Called after a successful submit. */
  onSubmitted?: (answers: Answers) => void
  /** Autosave delay in ms after the last change; false = off. Default 2500. */
  autosave?: number | false
  /** Store a file / signature PNG; resolve with its id. Without it, file fields are read-only and signatures are kept as PNG data URLs in the answer. */
  onUpload?: (field: FieldDef, file: File) => Promise<AnswerFileInfo>
  /** The bytes of a stored file (shows stored signatures, opens / downloads attachments). */
  loadFile?: (id: string) => Promise<Blob>
  onBack?: () => void
  /** Your own items at the end of the toolbar (e.g. "Download completed PDF"). */
  toolbar?: ReactNode
  notify?: (message: string) => void
  onError?: (error: unknown) => void
  /** Extra classes on the root. It fills its container's height (`h-full`) by default: give the container a height. */
  className?: string
}

const humanSize = (n?: number) => {
  if (!n) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The PDF with the form's fields on it. The user fills them in place (or as a searchable list); answers autosave
 * through onSave, Submit checks them with the same rules as validateAnswers on your server.
 */
export default function FormFiller({
  pdf: pdfSource,
  fields,
  layout = null,
  title,
  initialAnswers,
  files: initialFiles = [],
  readOnly = false,
  onSave,
  onSubmitted,
  autosave = 2500,
  onUpload,
  loadFile,
  onBack,
  toolbar,
  notify = () => {},
  onError: notifyError = (e) => console.error(e),
  className = 'h-full',
}: FormFillerProps) {
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers ?? defaultAnswers(fields))
  const [files, setFiles] = useState<AnswerFileInfo[]>(initialFiles)
  // Stored signature images (file id → object URL).
  const [signatures, setSignatures] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pdfWidth, setPdfWidth] = useState(595)
  const pageWidth = Math.max(...(layout?.pages.map((p) => p.width) ?? [pdfWidth]))
  const { zoom, setZoom, ref: fitRef } = useFitZoom(pageWidth)
  const compact = useCompact()
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [hasSaved, setHasSaved] = useState(!!initialAnswers)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [loadError, setLoadError] = useState('')
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef<Answers>(answers)
  useEffect(() => {
    latest.current = answers
  }, [answers])

  const states = useMemo(() => fieldStates(fields, answers), [fields, answers])
  // Document = the PDF with the controls on it; List = the same answers as questions, with search and filters.
  const [view, setView] = useState<'document' | 'list'>('document')
  // The PDF's text per original page, read when the list is first shown: questions get their own words as titles.
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageText, setPageText] = useState<Record<number, TextLine[]> | null>(null)
  useEffect(() => {
    if (view !== 'list' || !pdf || pageText) return
    let live = true
    ;(async () => {
      const out: Record<number, TextLine[]> = {}
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        out[i] = toLines((await page.getTextContent()).items as PdfTextItem[], page.view)
      }
      if (live) setPageText(out)
    })().catch(() => live && setPageText({}))
    return () => {
      live = false
    }
  }, [view, pdf, pageText])
  // Rebuilt when fields are shown / hidden by conditions, not on every keystroke.
  const visibleKeys = fields
    .filter((f) => states[f.key]?.visible)
    .map((f) => f.key)
    .join(',')
  const questions = useMemo(() => {
    const keys = new Set(visibleKeys.split(','))
    const textOf = (page: number) => {
      const source = layout ? layout.pages[page - 1]?.source : page
      return source ? pageText?.[source] : undefined
    }
    return toQuestions(
      fields.filter((f) => keys.has(f.key)),
      textOf,
    )
  }, [fields, layout, visibleKeys, pageText])

  // Loads the stored signatures shown on the page (once each).
  const loading = useRef(new Set<string>())
  useEffect(() => {
    if (!loadFile) return
    for (const f of fields) {
      const v = answers[f.key]
      if (f.type !== 'signature' || typeof v !== 'string' || !v || v.startsWith('data:')) continue
      if (signatures[v] || loading.current.has(v)) continue
      loading.current.add(v)
      loadFile(v)
        .then((blob) => setSignatures((m) => ({ ...m, [v]: URL.createObjectURL(blob) })))
        .catch(() => loading.current.delete(v))
    }
  }, [fields, answers, signatures, loadFile])
  const urls = useRef(signatures)
  useEffect(() => {
    urls.current = signatures
  }, [signatures])
  useEffect(() => () => Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u)), [])

  // Saves run one after another, so a slow save never overwrites a newer one.
  const save = useCallback(
    (submit = false) => {
      if (!onSave) return Promise.resolve(true)
      const run = queue.current.then(async () => {
        setSaveState('saving')
        try {
          await onSave(latest.current, { submit })
          setHasSaved(true)
          setSaveState('saved')
          return true
        } catch (err) {
          setSaveState('error')
          const fieldErrors = (err as { errors?: unknown })?.errors
          if (fieldErrors && typeof fieldErrors === 'object') setErrors(fieldErrors as Record<string, string>)
          notifyError(err)
          return false
        }
      })
      queue.current = run
      return run
    },
    [onSave, notifyError],
  )

  useEffect(() => {
    if (readOnly || autosave === false || !onSave || saveState !== 'dirty') return
    const t = setTimeout(() => void save(), autosave)
    return () => clearTimeout(t)
  }, [answers, readOnly, autosave, onSave, saveState, save])

  function change(f: FieldDef, v: AnswerValue) {
    setAnswers((a) => ({ ...a, [f.key]: v }))
    setSaveState('dirty')
    if (errors[f.key]) {
      const err = checkAnswer(f, v, states[f.key]?.required)
      setErrors((all) => {
        const rest = { ...all }
        delete rest[f.key]
        return err ? { ...rest, [f.key]: err } : rest
      })
    }
  }

  async function attach(f: FieldDef, file: File) {
    if (!onUpload) return
    try {
      const info = await onUpload(f, file)
      setFiles((list) => [...list.filter((x) => x.fieldKey !== f.key), info])
      if (f.type === 'signature') setSignatures((m) => ({ ...m, [info.id]: URL.createObjectURL(file) }))
      change(f, info.id)
    } catch (err) {
      notifyError(err)
    }
  }

  const fetchFile = (id: string, then: (blob: Blob) => void) =>
    loadFile?.(id).then(then, () => notifyError('Unable to open the file'))

  async function submit() {
    setConfirmSubmit(false)
    const found = validateAnswers(fields, answers)
    setErrors(found)
    if (Object.keys(found).length) return notifyError('Some answers need attention')
    if (await save(true)) {
      notify('Submitted')
      onSubmitted?.(latest.current)
    }
  }

  if (loadError) return <p className="fl-root p-6 text-center text-sm text-danger">{loadError}</p>

  const fileOf = (id: AnswerValue | undefined) => files.find((x) => x.id === id)
  // Files of upload fields that are answers now (signatures show on the page; replaced files are gone).
  const attachments = files.filter((x) =>
    fields.some((f) => f.type === 'file' && f.key === x.fieldKey && answers[f.key] === x.id),
  )
  const errorList = fields.filter((f) => errors[f.key])
  // One field's answer control (the same on the document and in the list), with the required star.
  const control = (f: FieldDef) => (
    <>
      <FieldControl
        field={f}
        value={answers[f.key]}
        readOnly={readOnly || states[f.key].readOnly || (f.type === 'file' && !onUpload)}
        compact={compact}
        error={errors[f.key]}
        onChange={(v) => change(f, v)}
        fileName={fileOf(answers[f.key])?.fileName}
        signatureSrc={signatures[String(answers[f.key])]}
        onFile={onUpload ? (file) => void attach(f, file) : undefined}
        onOpenFile={() =>
          fetchFile(String(answers[f.key]), (blob) => {
            const url = URL.createObjectURL(blob)
            window.open(url, '_blank')
            setTimeout(() => URL.revokeObjectURL(url), 60000)
          })
        }
      />
      {states[f.key].required && !readOnly && (
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 text-[12px] font-bold text-danger">*</span>
      )}
    </>
  )

  return (
    <div className={`fl-root flex min-h-[min(600px,100dvh)] flex-col bg-white text-ink ${className}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        {onBack && (
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
            Back
          </Button>
        )}
        {title != null && (
          <h2 className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold max-sm:text-[15px] sm:flex-none">
            {title}
          </h2>
        )}
        <SegmentedTabs
          options={[
            { value: 'document', label: 'Document' },
            { value: 'list', label: 'List' },
          ]}
          value={view}
          onChange={setView}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end">
          {view === 'document' && <ZoomControls zoom={zoom} onChange={setZoom} />}
          {!readOnly && onSave && (
            <>
              <span className="text-right text-[12px] text-muted sm:w-24" aria-live="polite">
                {
                  {
                    saved: hasSaved ? 'Draft saved' : '',
                    dirty: 'Unsaved',
                    saving: 'Saving…',
                    error: 'Not saved',
                  }[saveState]
                }
              </span>
              <Button variant="secondary" size="sm" icon={Save} title="Save draft" onClick={() => void save()}>
                <span className="max-sm:hidden">Save draft</span>
              </Button>
              <Button size="sm" icon={Send} onClick={() => setConfirmSubmit(true)}>
                Submit
              </Button>
            </>
          )}
          {toolbar}
        </div>
      </div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-white px-4 py-1.5 text-[12.5px]">
          <span className="inline-flex items-center gap-1 font-semibold text-ink-2">
            <Paperclip size={13} /> Attachments
          </span>
          {attachments.map((x) => (
            <button
              key={x.id}
              type="button"
              title={`Download ${x.fileName}`}
              disabled={!loadFile}
              className="inline-flex max-w-full cursor-pointer items-center gap-1 text-primary hover:underline disabled:cursor-default"
              onClick={() => fetchFile(x.id, (blob) => download(blob, x.fileName))}
            >
              <span className="truncate">{x.fileName}</span>
              {x.fileSize ? <span className="text-muted">({humanSize(x.fileSize)})</span> : null}
              {loadFile && <Download size={12} />}
            </button>
          ))}
        </div>
      )}
      {errorList.length > 0 && (
        <ul className="m-0 border-b border-danger/30 bg-danger/5 px-6 py-2 text-[13px] text-danger">
          {errorList.map((f) => (
            <li key={f.key}>
              Page {f.position.page}: {errors[f.key]}
            </li>
          ))}
        </ul>
      )}
      {view === 'list' && (
        <div className="flex-1 overflow-auto bg-hover">
          <QuestionList questions={questions} answers={answers} control={control} />
        </div>
      )}
      {/* Kept while the list shows, so the pages need not be drawn again. */}
      <div ref={fitRef} className={`flex-1 overflow-auto bg-hover ${view === 'list' ? 'hidden' : ''}`}>
        <PdfPages
          load={pdfSource}
          zoom={zoom}
          pages={layout?.pages}
          onLoaded={(sizes, doc) => {
            setPdf(doc)
            if (sizes.length) setPdfWidth(Math.max(...sizes.map((p) => p.width)))
          }}
          onError={() => setLoadError('The document could not be shown')}
          overlay={(page) => [
            // The admin's text / boxes / lines first, the answer controls on top.
            ...(layout?.elements ?? [])
              .filter((el) => el.page === page)
              .map((el) => (
                <LayoutElementView key={el.id} element={el} pageHeight={layout!.pages[page - 1]?.height ?? 842} />
              )),
            ...fields
              .filter((f) => f.position.page === page && states[f.key]?.visible)
              .map((f) => (
                <div key={f.id} className="absolute [container-type:size]" style={boxStyle(f.position)}>
                  {control(f)}
                </div>
              )),
          ]}
        />
      </div>
      {confirmSubmit && (
        <ConfirmModal confirmLabel="Submit" onConfirm={() => void submit()} onCancel={() => setConfirmSubmit(false)}>
          Submit this form? You cannot change the answers afterwards.
        </ConfirmModal>
      )}
    </div>
  )
}
