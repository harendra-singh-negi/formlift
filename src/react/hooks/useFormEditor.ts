import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { moveBy, resizeBy, snap, toPage } from '../../core/coords'
import { detectDocument, type Ops } from '../../core/detect'
import { duplicate, newField, reorder, withField, withoutField } from '../../core/fields'
import {
  defaultLayout,
  FIELD_TYPES,
  fieldStates,
  validateFields,
  type AnswerRule,
  type Limits,
  validateLayout,
  type Answers,
  type FieldDef,
  type FieldType,
  type Layout,
  type LayoutElement,
  type Position,
} from '../../core/form-logic'
import {
  deletePage,
  duplicateElement,
  ELEMENT_TOOLS,
  fitTextWidth,
  insertBlankPage,
  movePage,
  newElement,
  replaceLine,
  type Doc,
  type ElementTool,
  type TextLine,
} from '../../core/layout'
import type { PageSize } from '../components/PdfPages'
import { loadPdfJs } from '../pdfjs'
import { useLabels, type Labels } from '../labels'
import { useUndo } from './useUndo'

const GRID = 0.005 // default snap step: 0.5 % of the page

export type Selection = { kind: 'field' | 'element'; id: string } | null
/** The editor's document: fields + layout (null = the original pages untouched, nothing drawn). */
export type FormDoc = { fields: FieldDef[]; layout: Layout | null }
const EMPTY: FormDoc = { fields: [], layout: null }

export interface UseFormEditorOptions {
  /** Saved fields + layout to start from (omit for a new form). Remount (`key`) to load another. */
  initialValue?: FormDoc
  /** Called by save() with the document. A rejected promise keeps the changes unsaved. */
  onSave: (doc: FormDoc) => unknown
  /** Every change (also undo / redo). */
  onChange?: (doc: FormDoc) => void
  /** Run auto-detect when the PDF opens. Default: only when there are no fields and no layout yet. */
  autoDetect?: boolean
  /** Called with the suggested fields after a detect that found some. */
  onDetected?: (found: FieldDef[]) => void
  /** Delete, Ctrl+Z / Ctrl+Y, Ctrl+D, arrows, Escape on window. Default true. */
  keyboard?: boolean
  /** Field types that can be added. Default: all (FIELD_TYPES). */
  fieldTypes?: readonly FieldType[]
  /** Layout tools that can be added. Default: all. */
  elementTools?: readonly ElementTool[]
  /** Browser warning when leaving with unsaved changes. Default true. */
  warnUnsaved?: boolean
  /** Size limits checked before saving (use the same on your server). Default: DEFAULT_LIMITS. */
  limits?: Partial<Limits>
  /** Snap-to-grid step as a fraction of the page. Default 0.005 (0.5 %). */
  snapStep?: number
  /** Undo steps kept. Default 100. */
  undoLimit?: number
  /** Your own validation rules, offered in a field's properties (same object as FormFiller's and your server's). */
  rules?: Record<string, AnswerRule>
  notify?: (message: string) => void
  onError?: (error: unknown) => void
  /** Your own text for every button, heading and message (any language). Default: DEFAULT_LABELS (English). */
  labels?: Partial<Labels>
}

const isDefault = (l: Layout, sizes: PageSize[]) =>
  !l.elements.length && l.pages.length === sizes.length && l.pages.every((p, i) => p.source === i + 1)

/**
 * Everything FormEditor does, without its UI: the document with undo / redo, selection, placing / moving / resizing
 * fields and layout items, pages, auto-detect, preview answers, validation and save. Render the pages with
 * PdfPages (`onLoaded={ed.onPdfLoaded}`) and draw your own boxes, panels and toolbars around it.
 */
export function useFormEditor({
  initialValue = EMPTY,
  onSave,
  onChange,
  autoDetect,
  onDetected,
  keyboard = true,
  warnUnsaved = true,
  fieldTypes = FIELD_TYPES,
  elementTools = Object.keys(ELEMENT_TOOLS) as ElementTool[],
  limits,
  snapStep = GRID,
  undoLimit,
  notify = () => {},
  onError: notifyError = (e) => console.error(e),
  labels,
}: UseFormEditorOptions) {
  const L = useLabels(labels)
  const [sizes, setSizes] = useState<PageSize[] | null>(null)
  const history = useUndo<FormDoc>(initialValue, undoLimit)
  const { value: doc, set } = history
  const [saved, setSaved] = useState<FormDoc>(initialValue)
  const [selection, setSelection] = useState<Selection>(null)
  // A field / layout tool picked by a tap (touch screens cannot drag): the next tap on a page places it.
  const [armed, setArmed] = useState<string | null>(null)
  const [snapOn, setSnapOn] = useState(true)
  const [editText, setEditText] = useState(false)
  const [preview, setPreviewState] = useState(false)
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({})
  const [busy, setBusy] = useState(false)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [detecting, setDetecting] = useState<{ done: number; total: number; stop: AbortController } | null>(null)
  const autoDetected = useRef(false)
  const drag = useRef<{
    sel: NonNullable<Selection>
    mode: 'move' | 'resize'
    x: number
    y: number
    start: Position
    rect: DOMRect
  } | null>(null)

  const { fields } = doc
  // The layout as shown: the saved one, or the original pages once the PDF told us their sizes.
  const layout: Layout | null = doc.layout ?? (sizes ? defaultLayout(sizes) : null)
  const pageCount = layout?.pages.length ?? 1
  const grid = snapOn ? snapStep : 0
  const selectedField = selection?.kind === 'field' ? (fields.find((f) => f.id === selection.id) ?? null) : null
  const selectedElement =
    selection?.kind === 'element' ? (layout?.elements.find((e) => e.id === selection.id) ?? null) : null
  const dirty = JSON.stringify(doc) !== JSON.stringify(saved)
  const problems = useMemo(
    () =>
      sizes
        ? [...(doc.layout ? validateLayout(doc.layout, sizes.length, limits) : []), ...validateFields(fields, pageCount, limits)]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- limits by value: an inline object is new every render
    [sizes, doc.layout, fields, pageCount, JSON.stringify(limits ?? {})],
  )

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else onChangeRef.current?.(doc)
  }, [doc])

  // Changes that touch the layout start from the shown one (the default until the first change).
  const withDoc = useCallback(
    (fn: (d: Doc) => Doc, record = true) =>
      set((cur) => {
        const base = cur.layout ?? (sizes ? defaultLayout(sizes) : null)
        if (!base) return cur
        return fn({ fields: cur.fields, layout: base })
      }, record),
    [set, sizes],
  )
  const setFields = useCallback(
    (fn: (f: FieldDef[]) => FieldDef[], record = true) => set((cur) => ({ ...cur, fields: fn(cur.fields) }), record),
    [set],
  )
  const setElements = useCallback(
    (fn: (e: LayoutElement[]) => LayoutElement[], record = true) =>
      withDoc((d) => ({ ...d, layout: { ...d.layout, elements: fn(d.layout.elements) } }), record),
    [withDoc],
  )

  const updateField = useCallback((f: FieldDef) => setFields((l) => withField(l, f)), [setFields])
  // Text items grow to fit longer text, so nothing is cut off.
  const updateElement = useCallback(
    (e: LayoutElement) => {
      const pageWidth = layout?.pages[e.page - 1]?.width ?? 595
      setElements((l) => l.map((x) => (x.id === e.id ? fitTextWidth(e, pageWidth) : x)))
    },
    [setElements, layout],
  )
  const removeSelected = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'field') setFields((l) => withoutField(l, selection.id))
    else setElements((l) => l.filter((x) => x.id !== selection.id))
    setSelection(null)
  }, [selection, setFields, setElements])
  const duplicateSelected = useCallback(() => {
    if (selectedField) {
      const copy = duplicate(selectedField, fields)
      setFields((l) => [...l, copy])
      setSelection({ kind: 'field', id: copy.id })
    } else if (selectedElement) {
      const copy = duplicateElement(selectedElement)
      setElements((l) => [...l, copy])
      setSelection({ kind: 'element', id: copy.id })
    }
  }, [selectedField, selectedElement, fields, setFields, setElements])
  /** Moves the selection by a fraction of the page. */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedField) updateField({ ...selectedField, position: moveBy(selectedField.position, dx, dy) })
      if (selectedElement) {
        const { page: _p, ...position } = moveBy({ page: selectedElement.page, ...selectedElement.position }, dx, dy)
        void _p
        updateElement({ ...selectedElement, position })
      }
    },
    [selectedField, selectedElement, updateField, updateElement],
  )

  // Keyboard shortcuts (not while typing in an input).
  useEffect(() => {
    if (!keyboard) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (preview || t.closest('input, textarea, select, [contenteditable]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        history.redo()
      } else if (e.key === 'Escape' && armed) setArmed(null)
      else if (!selection) return
      else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected()
      else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelected()
      } else if (e.key === 'Escape') setSelection(null)
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 0.01 : 0.002
        nudge(
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard, preview, armed, selection, history, removeSelected, duplicateSelected, nudge])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty || !warnUnsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, warnUnsaved])

  /** onPointerDown of a box (or its resize handle) inside an element with `data-page`. */
  function startDrag(e: ReactPointerEvent, sel: NonNullable<Selection>, start: Position, mode: 'move' | 'resize') {
    if (e.button !== 0) return
    e.stopPropagation()
    const pageEl = (e.currentTarget as HTMLElement).closest('[data-page]')
    if (!pageEl) return
    setSelection(sel)
    history.checkpoint()
    drag.current = { sel, mode, x: e.clientX, y: e.clientY, start, rect: pageEl.getBoundingClientRect() }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  /** onPointerMove of the same box. */
  function onDrag(e: ReactPointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / d.rect.width
    const dy = (e.clientY - d.y) / d.rect.height
    if (d.sel.kind === 'field') {
      const position = d.mode === 'move' ? moveBy(d.start, dx, dy, grid) : resizeBy(d.start, dx, dy, grid)
      setFields((l) => l.map((x) => (x.id === d.sel.id ? { ...x, position } : x)), false)
      return
    }
    setElements(
      (l) =>
        l.map((x) => {
          if (x.id !== d.sel.id) return x
          if (d.mode === 'move') {
            const { page: _p, ...position } = moveBy(d.start, dx, dy, grid)
            void _p
            return { ...x, position }
          }
          if (x.type === 'line') {
            // Lines may be flat: a near-zero side snaps to 0 so horizontal / vertical lines stay straight.
            const flat = (n: number) => (n < 0.004 ? 0 : n)
            const width = flat(Math.min(1 - d.start.x, Math.max(0, snap(d.start.width + dx, grid))))
            const height = flat(Math.min(1 - d.start.y, Math.max(0, snap(d.start.height + dy, grid))))
            return { ...x, position: { ...x.position, width, height } }
          }
          const { page: _p, ...position } = resizeBy(d.start, dx, dy, grid)
          void _p
          return { ...x, position }
        }),
      false,
    )
  }
  /** onPointerUp of the same box. */
  const endDrag = () => {
    drag.current = null
  }

  /** Adds the tool `key` ('field:text', 'element:box') at a point on the page `rect`. true = placed. */
  function placeNew(key: string, page: number, clientX: number, clientY: number, rect: DOMRect) {
    const [kind, what] = key.split(':')
    const { x, y } = toPage(clientX, clientY, rect)
    if (kind === 'field' && fieldTypes.includes(what as FieldType)) {
      const f = newField(what as FieldType, page, x, y, fields)
      setFields((l) => [...l, f])
      setSelection({ kind: 'field', id: f.id })
      return true
    }
    if (kind === 'element' && elementTools.includes(what as ElementTool)) {
      const el = newElement(what as ElementTool, page, x, y)
      setElements((l) => [...l, el])
      setSelection({ kind: 'element', id: el.id })
      return true
    }
    return false
  }
  /** Covers a line of the original text with an editable copy (Edit text). */
  function editLine(line: TextLine, page: number) {
    const el = replaceLine(line, page)
    setElements((l) => [...l, el])
    setSelection({ kind: 'element', id: el.id })
  }

  // Suggested fields for the whole document (source 'ai'); one undo step removes them all.
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  })
  const detect = useCallback(
    async (auto = false) => {
      if (!pdf || !layout || detecting) return
      const stop = new AbortController()
      setDetecting({ done: 0, total: layout.pages.length, stop })
      try {
        const lib = await loadPdfJs()
        const found = await detectDocument(
          pdf,
          lib.OPS as unknown as Ops,
          layout.pages,
          fields,
          (done, total) => setDetecting((d) => d && { ...d, done, total }),
          stop.signal,
        )
        if (found.length) {
          setFields((l) => [...l, ...found])
          onDetectedRef.current?.(found)
        }
        notify(
          found.length
            ? L.fieldsSuggested(found.length, stop.signal.aborted)
            : auto
              ? L.noFieldsFoundAuto
              : L.noNewFieldsFound,
        )
      } catch (err) {
        notifyError(err)
      } finally {
        setDetecting(null)
      }
    },
    [pdf, layout, detecting, fields, setFields, notify, notifyError, L],
  )

  // A new form (nothing placed yet) gets suggestions right away.
  useEffect(() => {
    if (autoDetected.current || !pdf || !layout) return
    const fresh = autoDetect ?? (!initialValue.fields.length && !initialValue.layout)
    if (!fresh) {
      autoDetected.current = true
      return
    }
    // Started after this render (an effect must not set state synchronously).
    const t = setTimeout(() => {
      autoDetected.current = true
      void detect(true)
    })
    return () => clearTimeout(t)
  }, [pdf, layout, detect, autoDetect, initialValue])

  /** Validates and calls onSave. false = invalid or onSave failed. */
  async function save() {
    if (problems.length) {
      notifyError(problems[0])
      return false
    }
    setBusy(true)
    try {
      // An untouched layout is saved as null: "the original pages as they are".
      const layoutToSave = doc.layout && sizes && isDefault(doc.layout, sizes) ? null : doc.layout
      const sent = doc
      await onSave({ fields, layout: layoutToSave })
      setSaved(sent)
      notify(L.saved)
      return true
    } catch (err) {
      notifyError(err)
      return false
    } finally {
      setBusy(false)
    }
  }

  // Fields and layout items per page.
  const counts: Record<number, number> = {}
  for (const f of fields) counts[f.position.page] = (counts[f.position.page] ?? 0) + 1
  for (const el of layout?.elements ?? []) counts[el.page] = (counts[el.page] ?? 0) + 1

  return {
    doc,
    fields,
    /** The layout as shown (the original pages until changed); null until the PDF has loaded. */
    layout,
    pageCount,
    /** Page size in PDF points, for drawing layout text at the right size. */
    pageHeight: (page: number) => layout?.pages[page - 1]?.height ?? 842,
    /** Fields + layout items per page. */
    counts,
    dirty,
    /** Validation messages; save() refuses while there are any. */
    problems,
    busy,
    save,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    /** Changes the document; `record: false` = no undo step (live drags). */
    setFields,
    setElements,
    updateField,
    updateElement,
    reorderField: (id: string, step: -1 | 1) => setFields((l) => reorder(l, id, step)),
    movePage: (n: number, step: -1 | 1) => withDoc((d) => movePage(d, n, step)),
    insertBlankPage: (n: number) => withDoc((d) => insertBlankPage(d, n)),
    deletePage: (n: number) => {
      setSelection(null)
      withDoc((d) => deletePage(d, n))
    },
    selection,
    setSelection,
    selectedField,
    selectedElement,
    removeSelected,
    duplicateSelected,
    nudge,
    startDrag,
    onDrag,
    endDrag,
    /** Tools for a palette: drag with `dataTransfer` / tap to arm, then placeNew. */
    fieldTools: fieldTypes.map((t) => `field:${t}`),
    elementTools: elementTools.map((t) => `element:${t}`),
    armed,
    setArmed,
    placeNew,
    editText,
    setEditText,
    editLine,
    snapOn,
    setSnapOn,
    preview,
    /** Preview starts with empty answers; leaving it ends Edit text. */
    setPreview: (on: boolean) => {
      setPreviewState(on)
      setPreviewAnswers({})
      setEditText(false)
    },
    previewAnswers,
    setPreviewAnswers,
    previewStates: fieldStates(fields, previewAnswers),
    pdf,
    /** Pass to PdfPages' onLoaded. */
    onPdfLoaded: (s: PageSize[], d: PDFDocumentProxy) => {
      setSizes(s)
      setPdf(d)
    },
    pageSizes: sizes,
    detect,
    /** Progress while detecting; `stop.abort()` keeps what was found so far. */
    detecting,
  }
}

export type FormEditorState = ReturnType<typeof useFormEditor>
