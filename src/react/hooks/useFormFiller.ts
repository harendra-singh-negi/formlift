import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyAnswer,
  fileIds,
  multiAnswer,
  expandRows,
  removeRow,
  rowCount,
  rowsKey,
  openedFollowUps,
  type Comments,
  type FieldComment,
  type AnswerMessages,
  type AnswerOptions,
  type Limits,
  defaultAnswers,
  fieldStates,
  validateAnswers,
  type Answers,
  type AnswerValue,
  type FieldDef,
  type Layout,
} from '../../core/form-logic'
import { extractShapes, type Ops } from '../../core/detect'
import { flowSegments, flowText, pageFlow, readPage, type PageRead } from '../../core/flow'
import { toLines, type PdfTextItem, type TextLine } from '../../core/layout'
import { toQuestions as builtinToQuestions, type PageText, type Question } from '../../core/questions'
import type { PageSize } from '../components/PdfPages'
import { useLabels, type Labels } from '../labels'
import { loadPdfJs } from '../pdfjs'

/** A file answer (upload or signature PNG) as your storage knows it. The answer's value is its `id`. */
export interface AnswerFileInfo {
  id: string
  fieldKey: string
  fileName: string
  /** Bytes, for the size shown next to the name. */
  fileSize?: number
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** What onFieldChange can do. */
export interface FieldChangeApi {
  /** All answers after this change. */
  answers: Answers
  /** Set another field's answer (does not call onFieldChange again). */
  setAnswer: (key: string, value: AnswerValue) => void
  /** Ask these fields (usually dialog-only ones) in a dialog. */
  openDialog: (keys: string[], title?: string) => void
  /** Show a message through your notify. */
  notify: (message: string) => void
}

/** The dialog asking more fields: a follow-up, or one onFieldChange opened. */
export interface FieldDialog {
  title: string
  keys: string[]
}

export interface UseFormFillerOptions {
  fields: FieldDef[]
  layout?: Layout | null
  /** A draft to continue. Default: each field's default value. */
  initialAnswers?: Answers
  /** Files already attached to these answers. */
  files?: AnswerFileInfo[]
  /** View only: no saving, no autosave. */
  readOnly?: boolean
  /**
   * Save a draft (`submit: false`, also autosave) or submit (answers already pass validateAnswers — check again on
   * your server). Throw `{ errors: { fieldKey: message } }` to show errors at the fields.
   */
  onSave?: (answers: Answers, info: { submit: boolean; comments: Comments }) => unknown
  /** Called after a successful submit. */
  onSubmitted?: (answers: Answers) => void
  /** Autosave delay in ms after the last change; false = off. Default 2500. */
  autosave?: number | false
  /** Store a file / signature PNG; resolve with its id. */
  onUpload?: (field: FieldDef, file: File) => Promise<AnswerFileInfo>
  /** The bytes of a stored file (stored signatures, opening / downloading attachments). */
  loadFile?: (id: string) => Promise<Blob>
  /**
   * Groups the visible fields into questions for the list. Default: formlift's toQuestions. Wrap it to change
   * them, e.g. `(f, t) => toQuestions(f, t, { categoryCode: false }).map(setMyCategory)`.
   */
  toQuestions?: (fields: FieldDef[], textOf: PageText) => Question[]
  /** Size limits for answers (use the same on your server). Default: DEFAULT_LIMITS. */
  limits?: Partial<Limits>
  /** Your own wording for answer errors (any language). Default: DEFAULT_ANSWER_MESSAGES. */
  messages?: Partial<AnswerMessages>
  /** Your own named rules that fields list in `rules` (same object as FormEditor's and your server's). */
  rules?: AnswerOptions['rules']
  /** Full control: runs first for every field (see AnswerOptions.validate). */
  validate?: AnswerOptions['validate']
  /**
   * Every change of the answers, as plain JSON. With this you need no onSave: keep, send or store the answers
   * however you like.
   */
  onChange?: (answers: Answers) => void
  /**
   * After the person changes a field (not after setAnswer): react with your own logic, e.g. open a dialog, fill
   * another field, show a message. Follow-ups set in the editor need none of this.
   */
  onFieldChange?: (field: FieldDef, value: AnswerValue, api: FieldChangeApi) => void
  /** Comments to start with (fields with `comments: true`). */
  initialComments?: Comments
  /** Every change of the comments. They are also passed to onSave as `info.comments`. */
  onCommentsChange?: (comments: Comments) => void
  /** Who writes new comments (name or id), stored as `by`. */
  commentAuthor?: string
  notify?: (message: string) => void
  onError?: (error: unknown) => void
  /** Your own text for every button, heading and message (any language). Default: DEFAULT_LABELS (English). */
  labels?: Partial<Labels>
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
 * Everything FormFiller does, without its UI: answers, conditions, validation, queued saves + autosave, uploads,
 * signatures and the question list. Draw the fields yourself (`boxStyle(field.position)` over each page, or a
 * plain list of `questions`) and call `change`, `save`, `submit`.
 */
export function useFormFiller({
  fields: form,
  layout = null,
  initialAnswers,
  files: initialFiles = [],
  readOnly = false,
  onSave,
  onSubmitted,
  autosave = 2500,
  onUpload,
  loadFile,
  toQuestions = builtinToQuestions,
  limits,
  messages,
  rules,
  validate,
  onChange,
  onFieldChange,
  initialComments,
  onCommentsChange,
  commentAuthor,
  notify = () => {},
  onError: notifyError = (e) => console.error(e),
  labels,
}: UseFormFillerOptions) {
  const L = useLabels(labels)
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers ?? defaultAnswers(form))
  // The form's fields with the table rows the person added (expandRows).
  const fields = useMemo(() => expandRows(form, answers), [form, answers])
  const [files, setFiles] = useState<AnswerFileInfo[]>(initialFiles)
  // Stored signature images (file id → object URL).
  const [signatures, setSignatures] = useState<Record<string, string>>({})
  const [errors, setErrorsState] = useState<Record<string, string>>({})
  // the errors as of now (not as of the last render): several changes can run before React draws again
  const errorsNow = useRef(errors)
  const setErrors = useCallback((next: Record<string, string> | ((cur: Record<string, string>) => Record<string, string>)) => {
    errorsNow.current = typeof next === 'function' ? next(errorsNow.current) : next
    setErrorsState(errorsNow.current)
  }, [])
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [hasSaved, setHasSaved] = useState(!!initialAnswers)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pdfSizes, setPdfSizes] = useState<PageSize[]>([])
  const [comments, setComments] = useState<Comments>(initialComments ?? {})
  const [dialog, setDialog] = useState<FieldDialog | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef<Answers>(answers)
  const latestComments = useRef<Comments>(comments)
  const changed = useRef(onChange)
  changed.current = onChange
  const first = useRef(true)
  useEffect(() => {
    latest.current = answers
    if (first.current) first.current = false
    else changed.current?.(answers)
  }, [answers])
  const answerOptions: AnswerOptions = { ...limits, messages, rules, validate }

  const states = useMemo(() => fieldStates(fields, answers), [fields, answers])

  // The PDF read page by page on first need (loadPageText): its text lines (questions get their own words as
  // titles) and its text, tables, colours and pictures for the list view's flow. Read once per document.
  const [wantText, setWantText] = useState(false)
  const [pages, setPages] = useState<Record<number, { lines: TextLine[]; read: PageRead }> | null>(null)
  const [reading, setReading] = useState(0)
  useEffect(() => {
    if (!wantText || !pdf || pages) return
    let live = true
    ;(async () => {
      const { OPS } = await loadPdfJs()
      const out: Record<number, { lines: TextLine[]; read: PageRead }> = {}
      const step = Math.ceil(pdf.numPages / 20)
      for (let i = 1; i <= pdf.numPages && live; i++) {
        const page = await pdf.getPage(i)
        // The operator list first: it loads the page's fonts, whose names tell bold and italic text.
        const ops = await page.getOperatorList({ intent: 'print' })
        const items = (await page.getTextContent()).items as PdfTextItem[]
        const fontOf = (id: string) => {
          try {
            return page.commonObjs.has(id) ? (page.commonObjs.get(id) as { name?: string })?.name : undefined
          } catch {
            return undefined
          }
        }
        const shapes = extractShapes(ops.fnArray, ops.argsArray as unknown[][], OPS as unknown as Ops, page.view)
        out[i] = { lines: toLines(items, page.view, fontOf), read: readPage(items, shapes, page.view, fontOf) }
        page.cleanup() // its decoded pictures: the list draws the ones it shows again from the page
        if (i % step === 0) setReading(i)
      }
      if (live) setPages(out)
    })().catch(() => live && setPages({}))
    return () => {
      live = false
    }
  }, [wantText, pdf, pages])
  // Rebuilt when fields are shown / hidden by conditions, not on every keystroke.
  const visibleKeys = fields
    .filter((f) => states[f.key]?.visible)
    .map((f) => f.key)
    .join(',')
  const pageLines = useCallback(
    (page: number): TextLine[] | undefined => {
      const source = layout ? layout.pages[page - 1]?.source : page
      return source ? pages?.[source]?.lines : undefined
    },
    [layout, pages],
  )
  const listed = useMemo(() => {
    const keys = new Set(visibleKeys.split(','))
    const textOf = (page: number) => {
      const source = layout ? layout.pages[page - 1]?.source : page
      return source ? pages?.[source]?.lines : undefined
    }
    return toQuestions(
      fields.filter((f) => keys.has(f.key) && !f.dialogOnly),
      textOf,
    )
  }, [fields, layout, visibleKeys, pages, toQuestions])
  // The form as a flow, page by page: the original page as read (none yet: its fields alone), the fields on it,
  // the layout's own text and white-outs.
  const flow = useMemo(() => {
    const last = Math.max(1, ...fields.map((f) => f.position.page))
    const sheets =
      layout?.pages ??
      (pdfSizes.length ? pdfSizes : Array.from({ length: last }, () => ({ width: 595, height: 842 }))).map((s, i) => ({
        source: i + 1,
        ...s,
      }))
    return sheets.flatMap((p, i) =>
      pageFlow(
        p.source ? pages?.[p.source]?.read : undefined,
        { page: i + 1, ...p },
        fields.filter((f) => f.position.page === i + 1 && !f.dialogOnly),
        layout?.elements.filter((e) => e.page === i + 1),
      ),
    )
  }, [fields, layout, pdfSizes, pages])
  // Cut where questions end; each question searchable by the document's text around it.
  const segments = useMemo(() => flowSegments(flow, listed), [flow, listed])
  const questions = useMemo(() => {
    const text = new Map<string, string>()
    for (const s of segments) {
      const t = flowText(s.blocks)
      for (const id of s.questions) text.set(id, t)
    }
    return listed.map((q) => (text.has(q.id) ? { ...q, text: text.get(q.id) } : q))
  }, [segments, listed])

  // Loads the stored pictures shown on the page (once each): signatures, and the photos of file fields with a
  // photosPerRow (other files are not pictures and are left out).
  const loading = useRef(new Set<string>())
  useEffect(() => {
    if (!loadFile) return
    for (const f of fields) {
      const v = answers[f.key]
      const ids =
        f.type === 'signature' ? (typeof v === 'string' && v && !v.startsWith('data:') ? [v] : []) : f.type === 'file' && f.photosPerRow ? fileIds(v) : []
      for (const id of ids) {
        if (signatures[id] || loading.current.has(id)) continue
        loading.current.add(id)
        loadFile(id)
          .then((blob) => {
            if (f.type === 'signature' || blob.type.startsWith('image/'))
              setSignatures((m) => ({ ...m, [id]: URL.createObjectURL(blob) }))
          })
          .catch(() => loading.current.delete(id))
      }
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
          await onSave(latest.current, { submit, comments: latestComments.current })
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

  function setAll(next: Answers) {
    latest.current = next
    setAnswers(next)
    setSaveState('dirty')
  }

  // Sets one answer: a 'single' group unticks its other boxes; shown errors of the field / its group are re-checked.
  function put(f: FieldDef, v: AnswerValue) {
    const before = latest.current
    const next = applyAnswer(fields, before, f, v)
    latest.current = next
    setAnswers(next)
    setSaveState('dirty')
    const related = f.group ? fields.filter((x) => x.group?.id === f.group!.id).map((x) => x.key) : [f.key]
    if (related.some((k) => errorsNow.current[k])) {
      const found = validateAnswers(fields, next, answerOptions)
      setErrors((all) => {
        const rest = { ...all }
        for (const k of related) delete rest[k]
        for (const k of related) if (found[k]) rest[k] = found[k]
        return rest
      })
    }
    return { before, next }
  }

  /** The person's change of one field: sets it, opens a follow-up it triggers, calls onFieldChange. */
  function change(f: FieldDef, v: AnswerValue) {
    const { before, next } = put(f, v)
    const opened = openedFollowUps(fields, before, next).find((t) => t.followUp!.fields.length)
    if (opened) setDialog({ title: opened.followUp!.title || opened.label || opened.key, keys: opened.followUp!.fields })
    onFieldChange?.(f, v, {
      answers: next,
      setAnswer: (key, value) => {
        const target = fields.find((x) => x.key === key)
        if (target) put(target, value)
      },
      openDialog: (keys, title) => setDialog({ title: title ?? '', keys }),
      notify,
    })
  }

  /** Opens a field's follow-up again (its 💬-like badge on the page). */
  function openFollowUp(f: FieldDef) {
    if (f.followUp?.fields.length) setDialog({ title: f.followUp.title || f.label || f.key, keys: f.followUp.fields })
  }

  function setAllComments(next: Comments) {
    latestComments.current = next
    setComments(next)
    setSaveState('dirty')
    onCommentsChange?.(next)
  }
  /** Adds a comment by commentAuthor to a field. */
  function addComment(f: FieldDef, text: string) {
    if (!text.trim()) return
    const c: FieldComment = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `c${Date.now()}${Math.random()}`,
      text: text.trim(),
      at: new Date().toISOString(),
      ...(commentAuthor ? { by: commentAuthor } : {}),
    }
    const cur = latestComments.current
    setAllComments({ ...cur, [f.key]: [...(cur[f.key] ?? []), c] })
  }
  /** Removes one comment. */
  function removeComment(f: FieldDef, id: string) {
    const cur = latestComments.current
    const list = (cur[f.key] ?? []).filter((c) => c.id !== id)
    const next = { ...cur }
    if (list.length) next[f.key] = list
    else delete next[f.key]
    setAllComments(next)
  }

  /**
   * Uploads a file / signature PNG through onUpload and makes it the field's answer. A file field with `multiple`
   * adds it to the ones it has.
   */
  async function attach(f: FieldDef, file: File) {
    if (!onUpload) return
    try {
      const info = await onUpload(f, file)
      const many = f.type === 'file' && f.multiple
      setFiles((list) => [...list.filter((x) => many || x.fieldKey !== f.key), info])
      if (f.type === 'signature' || (f.photosPerRow && file.type.startsWith('image/')))
        setSignatures((m) => ({ ...m, [info.id]: URL.createObjectURL(file) }))
      change(f, many ? multiAnswer([...fileIds(latest.current[f.key]), info.id]) : info.id)
    } catch (err) {
      notifyError(err)
    }
  }

  /** Takes one file off a field with several (`multiple`). */
  function removeFile(f: FieldDef, id: string) {
    change(f, multiAnswer(fileIds(latest.current[f.key]).filter((x) => x !== id)))
  }

  const fetchFile = (id: string, then: (blob: Blob) => void) =>
    loadFile?.(id).then(then, () => notifyError(L.fileOpenError))
  /** Opens a stored file in a new tab. */
  const openFile = (id: string) =>
    fetchFile(id, (blob) => {
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    })
  /** Downloads a stored file. */
  const downloadFile = (id: string, name: string) => fetchFile(id, (blob) => download(blob, name))

  /** Validates everything; when clean, saves with `submit: true`. true = submitted. */
  async function submit() {
    const found = validateAnswers(fields, answers, answerOptions)
    setErrors(found)
    if (Object.keys(found).length) {
      notifyError(L.answersNeedAttention)
      return false
    }
    if (!(await save(true))) return false
    notify(L.submitted)
    onSubmitted?.(latest.current)
    return true
  }

  const fileOf = (id: AnswerValue | undefined) => files.find((x) => x.id === id)

  return {
    answers,
    /** Visible / required / readOnly per field key, from the conditions and current answers. */
    states,
    /** Field key → message. */
    errors,
    setErrors,
    /** Fields with an error, in form order. */
    errorList: fields.filter((f) => errors[f.key]),
    /** The fields with the table rows the person added (copies keyed `<key>__<k>`). */
    fields,
    change,
    /** Adds a row under the repeatable row `id` (up to its max). */
    addRow: (id: string) => {
      if (readOnly) return
      const n = rowCount(form, id, latest.current)
      const max = form.find((f) => f.repeat?.id === id)?.repeat?.max
      if (max && n >= max) return
      setAll({ ...latest.current, [rowsKey(id)]: String(n + 1) })
    },
    /** Takes out row `k` (2, 3…) of the repeatable row `id`; the rows under it move up. */
    removeRow: (id: string, k: number) => {
      if (readOnly) return
      setAll(removeRow(form, latest.current, id, k))
      setErrors({})
    },
    /** The open dialog of more questions, or null. */
    dialog,
    closeDialog: () => setDialog(null),
    openDialog: (keys: string[], title = '') => setDialog({ title, keys }),
    openFollowUp,
    comments,
    addComment,
    removeComment,
    commentAuthor,
    save,
    submit,
    saveState,
    hasSaved,
    readOnly,
    files,
    fileOf,
    /** Files of upload fields that are answers now. */
    attachments: files.filter((x) =>
      fields.some((f) => f.type === 'file' && f.key === x.fieldKey && fileIds(answers[f.key]).includes(x.id)),
    ),
    attach,
    removeFile,
    /** The files of a file answer (several for a field with `multiple`), as far as they are known. */
    filesOf: (v: AnswerValue | undefined) => fileIds(v).flatMap((id) => files.filter((x) => x.id === id)),
    canUpload: !!onUpload,
    canLoadFiles: !!loadFile,
    openFile,
    downloadFile,
    /** Image src of a signature answer (stored file or data URL). */
    signatureSrc: (f: FieldDef) => signatures[String(answers[f.key])],
    /** A file field with photosPerRow: its photos to preview (id and picture URL), as far as loaded. */
    photosOf: (f: FieldDef) =>
      f.type === 'file' && f.photosPerRow ? fileIds(answers[f.key]).flatMap((id) => (signatures[id] ? [{ id, src: signatures[id] }] : [])) : [],
    /** Visible fields grouped as questions (tables, option groups), titled from the PDF text once loaded. */
    questions,
    /**
     * The document as a flow (its text, tables, colours, pictures and the fields in place), cut where questions
     * end: what the list view shows. Fields alone until the PDF is read (loadPageText).
     */
    segments,
    /** While loadPageText reads the PDF: pages read so far. */
    reading: wantText && pdf && !pages ? { done: reading, total: pdf.numPages } : null,
    /** Reads the PDF so `questions` get real titles and `segments` the document's text (call when you first show them). */
    loadPageText: () => setWantText(true),
    /** A page's text lines once read (loadPageText); undefined before. Layout pages map to their source page. */
    pageLines,
    pdf,
    pdfSizes,
    /** Pass to PdfPages' onLoaded. */
    onPdfLoaded: (sizes: PageSize[], doc: PDFDocumentProxy) => {
      setPdf(doc)
      setPdfSizes(sizes)
    },
  }
}

export type FormFillerState = ReturnType<typeof useFormFiller>
