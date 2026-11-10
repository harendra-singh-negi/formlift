import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  Grid3x3,
  PanelRight,
  Pencil,
  Plus,
  Redo2,
  Save,
  Trash2,
  Type,
  Undo2,
  Wand2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import Button from './ui/Button'
import { ConfirmModal } from './ui/Modal'
import IconButton from './ui/IconButton'
import { EmptyText, PanelHeading } from './ui/Panel'
import SegmentedTabs from './ui/SegmentedTabs'
import ElementProperties from './components/ElementProperties'
import FieldControl from './components/FieldControl'
import FieldProperties from './components/FieldProperties'
import LayoutElementView from './components/LayoutElementView'
import PagesPanel from './components/PagesPanel'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import PdfPages, { type PageSize, type PdfSource } from './components/PdfPages'
import ZoomControls from './components/ZoomControls'
import { useCompact, useFitZoom } from './hooks/useFitZoom'
import { TYPE_LABEL } from './constants'
import {
  defaultLayout,
  FIELD_TYPES,
  fieldStates,
  validateFields,
  validateLayout,
  type Answers,
  type FieldDef,
  type FieldType,
  type Layout,
  type LayoutElement,
  type Position,
} from '../core/form-logic'
import { useUndo } from './hooks/useUndo'
import { boxStyle, moveBy, resizeBy, snap, toPage } from '../core/coords'
import { detectDocument, type Ops } from '../core/detect'
import { duplicate, newField, reorder, withField } from '../core/fields'
import { loadPdfJs } from './pdfjs'
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
} from '../core/layout'

const GRID = 0.005 // snap step: 0.5 % of the page
const DRAG_TYPE = 'application/x-doc-item' // "field:<type>" or "element:<tool>"

type Selection = { kind: 'field' | 'element'; id: string } | null
type Tab = string
/** The editor's document: fields + layout (null = the original pages untouched, nothing drawn). */
export type FormDoc = { fields: FieldDef[]; layout: Layout | null }
type EditorDoc = FormDoc
const EMPTY: FormDoc = { fields: [], layout: null }

/** Imperative handle (`ref`): save from outside, e.g. before a workflow step. */
export interface FormEditorHandle {
  /** Saves if there are changes. false = invalid or onSave failed. */
  save: () => Promise<boolean>
  readonly dirty: boolean
  readonly value: FormDoc
}

export interface FormEditorProps {
  /** The PDF: URL, Blob / File, bytes, or a function returning one. Never modified. */
  pdf: PdfSource
  /** Saved fields + layout to start from (omit for a new form). Remount (`key`) to load another. */
  initialValue?: FormDoc
  /** Called by Save with the document. A rejected promise keeps the changes unsaved. */
  onSave: (doc: FormDoc) => unknown
  /** Every change (also undo / redo). */
  onChange?: (doc: FormDoc) => void
  title?: ReactNode
  /** Back button in the toolbar (hidden when omitted). */
  onBack?: () => void
  /** Your own items at the end of the toolbar (status, workflow buttons…). */
  toolbar?: ReactNode
  /** A strip under the toolbar (e.g. "this version is live"). */
  banner?: ReactNode
  /** Your own tabs in the right panel (e.g. history). */
  tabs?: { id: string; label: string; content: ReactNode }[]
  /** Run auto-detect when the PDF opens. Default: only when there are no fields and no layout yet. */
  autoDetect?: boolean
  notify?: (message: string) => void
  onError?: (error: unknown) => void
  /** Extra classes on the root. It fills its container's height (`h-full`) by default: give the container a height. */
  className?: string
  ref?: Ref<FormEditorHandle>
}

const isDefault = (l: Layout, sizes: PageSize[]) =>
  !l.elements.length && l.pages.length === sizes.length && l.pages.every((p, i) => p.source === i + 1)

/**
 * Admin editor. The document in the middle: original PDF pages (and blank pages) with everything the admin
 * adds on top. Left: fields and layout tools to drag onto a page. "Edit text" makes every line of the original
 * clickable: a click covers it with an editable copy. Right: properties of the selection, the field list, pages
 * (reorder, delete, add blank) and history. Nothing changes the uploaded PDF; all of it is saved in the version.
 * Keyboard: Delete, Ctrl+Z / Ctrl+Y, Ctrl+D duplicate, arrows nudge (Shift = bigger steps).
 */
export default function FormEditor({
  pdf: pdfSource,
  initialValue = EMPTY,
  onSave,
  onChange,
  title,
  onBack,
  toolbar,
  banner,
  tabs = [],
  autoDetect,
  notify = () => {},
  onError: notifyError = (e) => console.error(e),
  className = 'h-full',
  ref,
}: FormEditorProps) {
  const [sizes, setSizes] = useState<PageSize[] | null>(null)
  const history = useUndo<EditorDoc>(initialValue)
  const { value: doc, set } = history
  const [saved, setSaved] = useState<EditorDoc>(initialValue)
  const [selection, setSelection] = useState<Selection>(null)
  const [tab, setTab] = useState<Tab>('props')
  // Phone / tablet (below lg): the side panels open as drawers over the page; null = both closed.
  const [drawer, setDrawer] = useState<'tools' | 'panel' | null>(null)
  // A field / layout tool picked by a tap (touch screens cannot drag): the next tap on a page places it.
  const [armed, setArmed] = useState<string | null>(null)
  const compact = useCompact()
  const [snapOn, setSnapOn] = useState(true)
  const [editText, setEditText] = useState(false)
  const [preview, setPreview] = useState(false)
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({})
  const [busy, setBusy] = useState(false)
  const [confirmDeletePage, setConfirmDeletePage] = useState<number | null>(null)
  const [loadError, setLoadError] = useState('')
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
  const scroller = useRef<HTMLDivElement>(null)
  const { zoom, setZoom, ref: fitRef } = useFitZoom(Math.max(...(sizes ?? [{ width: 595 }]).map((p) => p.width)))

  const { fields } = doc
  // The layout as shown: the saved one, or the original pages once the PDF told us their sizes.
  const layout: Layout | null = doc.layout ?? (sizes ? defaultLayout(sizes) : null)
  const pageCount = layout?.pages.length ?? 1
  const grid = snapOn ? GRID : 0
  const selectedField = selection?.kind === 'field' ? (fields.find((f) => f.id === selection.id) ?? null) : null
  const selectedElement =
    selection?.kind === 'element' ? (layout?.elements.find((e) => e.id === selection.id) ?? null) : null
  const dirty = JSON.stringify(doc) !== JSON.stringify(saved)
  const problems = useMemo(
    () =>
      sizes
        ? [...(doc.layout ? validateLayout(doc.layout, sizes.length) : []), ...validateFields(fields, pageCount)]
        : [],
    [sizes, doc.layout, fields, pageCount],
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

  const select = (s: Selection) => {
    setSelection(s)
    if (s) setTab('props')
  }
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
    if (selection.kind === 'field') setFields((l) => l.filter((x) => x.id !== selection.id))
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

  // Keyboard shortcuts (not while typing in an input).
  useEffect(() => {
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
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (selectedField) updateField({ ...selectedField, position: moveBy(selectedField.position, dx, dy) })
        if (selectedElement) {
          const { page: _p, ...position } = moveBy({ page: selectedElement.page, ...selectedElement.position }, dx, dy)
          void _p
          updateElement({ ...selectedElement, position })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    preview,
    armed,
    selection,
    selectedField,
    selectedElement,
    history,
    removeSelected,
    duplicateSelected,
    updateField,
    updateElement,
  ])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function startDrag(e: ReactPointerEvent, sel: NonNullable<Selection>, start: Position, mode: 'move' | 'resize') {
    if (e.button !== 0) return
    e.stopPropagation()
    const pageEl = (e.currentTarget as HTMLElement).closest('[data-page]')
    if (!pageEl) return
    select(sel)
    history.checkpoint()
    drag.current = { sel, mode, x: e.clientX, y: e.clientY, start, rect: pageEl.getBoundingClientRect() }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
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
  const endDrag = () => (drag.current = null)

  /** Adds the tool `key` ('field:text', 'element:box') where the page was dropped on / tapped. */
  function placeNew(key: string, page: number, clientX: number, clientY: number, rect: DOMRect) {
    const [kind, what] = key.split(':')
    const { x, y } = toPage(clientX, clientY, rect)
    if (kind === 'field' && FIELD_TYPES.includes(what as FieldType)) {
      const f = newField(what as FieldType, page, x, y, fields)
      setFields((l) => [...l, f])
      select({ kind: 'field', id: f.id })
      return true
    }
    if (kind === 'element' && what in ELEMENT_TOOLS) {
      const el = newElement(what as ElementTool, page, x, y)
      setElements((l) => [...l, el])
      select({ kind: 'element', id: el.id })
      return true
    }
    return false
  }
  function dropNew(e: React.DragEvent, page: number) {
    const key = e.dataTransfer.getData(DRAG_TYPE)
    if (placeNew(key, page, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())) e.preventDefault()
  }

  function goToPage(n: number) {
    scroller.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: 'start' })
  }

  // Suggested fields for the whole document (dashed amber boxes); one undo step removes them all.
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
          setTab('fields')
        }
        notify(
          found.length
            ? `${found.length} fields suggested${stop.signal.aborted ? ' (stopped early)' : ''}. Check the dashed ones, then Save.`
            : auto
              ? 'No fields found automatically. Drag them in from the left.'
              : 'No new fields found',
        )
      } catch (err) {
        notifyError(err)
      } finally {
        setDetecting(null)
      }
    },
    [pdf, layout, detecting, fields, setFields, notify, notifyError],
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
      notify('Saved')
      return true
    } catch (err) {
      notifyError(err)
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useImperativeHandle(
    ref,
    () => ({
      save: () => (dirty ? saveRef.current() : Promise.resolve(problems.length === 0)),
      dirty,
      value: doc,
    }),
    [dirty, doc, problems],
  )

  if (loadError) return <p className="fl-root p-6 text-center text-sm text-danger">{loadError}</p>

  const previewStates = fieldStates(fields, previewAnswers)
  const counts: Record<number, number> = {}
  for (const f of fields) counts[f.position.page] = (counts[f.position.page] ?? 0) + 1
  for (const el of layout?.elements ?? []) counts[el.page] = (counts[el.page] ?? 0) + 1
  const pageHeight = (page: number) => layout?.pages[page - 1]?.height ?? 842

  // Drag onto a page, or tap it and then tap the page (touch screens have no drag and drop).
  const toolItem = (key: string, label: string) => (
    <button
      type="button"
      key={key}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, key)}
      onClick={() => {
        setArmed((a) => (a === key ? null : key))
        setDrawer(null)
      }}
      aria-pressed={armed === key}
      className={`block w-full cursor-grab rounded-md border px-2.5 py-1.5 text-left text-[13px] hover:border-primary hover:bg-primary-soft active:cursor-grabbing max-lg:py-2.5 ${
        armed === key ? 'border-primary bg-primary-soft' : 'border-line'
      }`}
    >
      {label}
    </button>
  )
  const armedLabel = armed
    ? armed.startsWith('field:')
      ? TYPE_LABEL[armed.slice(6) as FieldType]
      : ELEMENT_TOOLS[armed.slice(8) as ElementTool]?.label
    : ''

  return (
    <div className={`fl-root flex min-h-[640px] flex-col bg-white text-ink ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2.5">
        {onBack && (
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
            Back
          </Button>
        )}
        {!preview && (
          <Button
            variant={drawer === 'tools' ? 'primary' : 'secondary'}
            size="sm"
            icon={Plus}
            className="lg:hidden"
            onClick={() => setDrawer((d) => (d === 'tools' ? null : 'tools'))}
          >
            Add
          </Button>
        )}
        <Button
          variant={drawer === 'panel' ? 'primary' : 'secondary'}
          size="sm"
          icon={PanelRight}
          className="lg:hidden"
          onClick={() => setDrawer((d) => (d === 'panel' ? null : 'panel'))}
        >
          {selection ? 'Properties' : 'Panel'}
        </Button>
        {title != null && <h2 className="m-0 min-w-0 truncate text-[17px] font-semibold">{title}</h2>}
        <span className="text-[12px] text-muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <IconButton
            icon={Undo2}
            title="Undo (Ctrl+Z)"
            disabled={!history.canUndo || preview}
            onClick={history.undo}
          />
          <IconButton
            icon={Redo2}
            title="Redo (Ctrl+Y)"
            disabled={!history.canRedo || preview}
            onClick={history.redo}
          />
          <IconButton
            icon={Grid3x3}
            title={snapOn ? 'Snap to grid: on' : 'Snap to grid: off'}
            className={snapOn ? '!text-primary' : ''}
            onClick={() => setSnapOn((s) => !s)}
          />
          <ZoomControls zoom={zoom} onChange={setZoom} />
          {!preview && (
            <Button
              variant={editText ? 'primary' : 'secondary'}
              size="sm"
              icon={Type}
              disabled={!layout}
              title="Click any line of the document to change its text"
              onClick={() => setEditText((v) => !v)}
            >
              <span className="max-sm:hidden">Edit text</span>
            </Button>
          )}
          {!preview && (
            <Button
              variant="secondary"
              size="sm"
              icon={Wand2}
              disabled={!pdf || !layout || !!detecting}
              title="Find answer lines, checkboxes and table cells and suggest fields for them"
              onClick={() => void detect()}
            >
              <span className="max-sm:hidden">Auto-detect</span>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={preview ? Pencil : Eye}
            title={preview ? 'Back to editing' : 'Preview'}
            onClick={() => {
              setPreview((p) => !p)
              setPreviewAnswers({})
              setEditText(false)
            }}
          >
            <span className="max-sm:hidden">{preview ? 'Edit' : 'Preview'}</span>
          </Button>
          <Button size="sm" icon={Save} title="Save" disabled={!dirty || busy} onClick={() => void save()}>
            <span className="max-sm:hidden">Save</span>
          </Button>
          {toolbar}
        </div>
      </div>
      {banner}
      {detecting && (
        <div className="flex items-center gap-3 bg-folder/15 px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
          Detecting fields… page {detecting.done} of {detecting.total}
          <div className="h-1.5 w-40 overflow-hidden rounded bg-white">
            <div
              className="h-full bg-folder"
              style={{ width: `${(100 * detecting.done) / Math.max(1, detecting.total)}%` }}
            />
          </div>
          <button
            type="button"
            className="cursor-pointer text-primary hover:underline"
            onClick={() => detecting.stop.abort()}
          >
            Stop
          </button>
        </div>
      )}
      {armed && !preview && (
        <p className="m-0 flex items-center gap-3 bg-primary-soft px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
          Tap the page where the {armedLabel} should go.
          <button type="button" className="cursor-pointer text-primary hover:underline" onClick={() => setArmed(null)}>
            Cancel
          </button>
        </p>
      )}
      {editText && (
        <p className="m-0 bg-folder/15 px-4 py-1.5 text-[12.5px] text-ink-2">
          Edit text: click a line of the document to replace it with an editable copy (same place and size). The
          uploaded file itself never changes.
        </p>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Toolbox: a column on large screens, a drawer from the left below lg. */}
        {!preview && (
          <aside
            className={`w-[170px] flex-none overflow-y-auto border-r border-line bg-white max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:w-[220px] max-lg:shadow-xl ${
              drawer === 'tools' ? '' : 'max-lg:hidden'
            }`}
          >
            <PanelHeading>FIELDS</PanelHeading>
            <p className="m-0 px-3 pt-2 text-[11.5px] text-muted">Drag onto the document, or tap one, then the page</p>
            <div className="space-y-1 p-2">{FIELD_TYPES.map((t) => toolItem(`field:${t}`, TYPE_LABEL[t]))}</div>
            <PanelHeading>LAYOUT</PanelHeading>
            <div className="space-y-1 p-2">
              {(Object.keys(ELEMENT_TOOLS) as ElementTool[]).map((t) =>
                toolItem(`element:${t}`, ELEMENT_TOOLS[t].label),
              )}
            </div>
          </aside>
        )}

        {/* Document */}
        <div
          ref={(n) => {
            scroller.current = n
            fitRef(n)
          }}
          className="min-w-0 flex-1 overflow-auto bg-hover"
          onPointerDown={() => {
            if (!preview) setSelection(null)
            setDrawer(null)
          }}
        >
          <PdfPages
            load={pdfSource}
            zoom={zoom}
            pages={layout?.pages}
            withText={editText && !preview}
            onLoaded={(s, doc) => {
              setSizes(s)
              setPdf(doc)
            }}
            onError={() => setLoadError('The document could not be shown')}
            overlay={(page, lines) => (
              <div
                className="absolute inset-0"
                style={
                  snapOn && !preview
                    ? {
                        backgroundImage:
                          'linear-gradient(to right, rgb(27 108 196 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(27 108 196 / 0.06) 1px, transparent 1px)',
                        backgroundSize: '2% 2%',
                      }
                    : undefined
                }
                onDragOver={(e) => !preview && e.preventDefault()}
                onDrop={(e) => dropNew(e, page)}
                onClick={(e) => {
                  if (!armed || preview) return
                  placeNew(armed, page, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
                  setArmed(null)
                }}
              >
                {/* Original text lines (Edit text): a click replaces the line with an editable copy. */}
                {lines?.map((line, i) => (
                  <button
                    key={i}
                    type="button"
                    title={`Edit: ${line.text}`}
                    className="absolute cursor-text rounded-[1px] outline-1 outline-folder/60 hover:bg-folder/25 hover:outline-folder"
                    style={boxStyle({ page, ...line })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      const el = replaceLine(line, page)
                      setElements((l) => [...l, el])
                      select({ kind: 'element', id: el.id })
                    }}
                  />
                ))}

                {layout?.elements
                  .filter((el) => el.page === page)
                  .map((el) =>
                    preview ? (
                      <LayoutElementView key={el.id} element={el} pageHeight={pageHeight(page)} />
                    ) : (
                      <div
                        key={el.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${el.type} ${el.text ?? ''}`}
                        className={`absolute cursor-move touch-none select-none ${
                          selection?.id === el.id
                            ? 'z-10 outline-2 outline-primary'
                            : 'hover:outline-1 hover:outline-primary/50'
                        }`}
                        style={boxStyle({ page, ...el.position, height: Math.max(el.position.height, 0.004) })}
                        onPointerDown={(e) =>
                          startDrag(e, { kind: 'element', id: el.id }, { page, ...el.position }, 'move')
                        }
                        onPointerMove={onDrag}
                        onPointerUp={endDrag}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LayoutElementView
                          element={el}
                          pageHeight={pageHeight(page)}
                          style={{ left: 0, top: 0, width: '100%', height: '100%' }}
                        />
                        {selection?.id === el.id && (
                          <span
                            aria-label="Resize"
                            className="absolute -right-1 -bottom-1 h-2.5 w-2.5 cursor-se-resize rounded-sm border border-white bg-primary"
                            onPointerDown={(e) =>
                              startDrag(e, { kind: 'element', id: el.id }, { page, ...el.position }, 'resize')
                            }
                            onPointerMove={onDrag}
                            onPointerUp={endDrag}
                          />
                        )}
                      </div>
                    ),
                  )}

                {fields
                  .filter((f) => f.position.page === page)
                  .map((f) =>
                    preview ? (
                      previewStates[f.key]?.visible && (
                        <div key={f.id} className="absolute [container-type:size]" style={boxStyle(f.position)}>
                          <FieldControl
                            field={f}
                            value={previewAnswers[f.key]}
                            readOnly={previewStates[f.key].readOnly}
                            compact={compact}
                            onChange={(v) => setPreviewAnswers((a) => ({ ...a, [f.key]: v }))}
                          />
                        </div>
                      )
                    ) : (
                      <div
                        key={f.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${TYPE_LABEL[f.type]} field ${f.label || f.key}`}
                        title={`${f.label || f.key} (${TYPE_LABEL[f.type]})`}
                        className={`absolute cursor-move touch-none rounded-sm border text-[10px] select-none [container-type:size] ${
                          selection?.id === f.id
                            ? 'z-10 border-primary bg-primary/20 ring-2 ring-primary/40'
                            : f.source === 'ai'
                              ? 'border-dashed border-folder bg-folder/15'
                              : 'border-primary/60 bg-primary/10 hover:bg-primary/15'
                        }`}
                        style={boxStyle(f.position)}
                        onPointerDown={(e) => startDrag(e, { kind: 'field', id: f.id }, f.position, 'move')}
                        onPointerMove={onDrag}
                        onPointerUp={endDrag}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="pointer-events-none block truncate px-0.5 text-[clamp(7px,55cqh,12px)] leading-tight text-primary">
                          {f.label || f.key}
                          {f.required && <b className="text-danger"> *</b>}
                        </span>
                        {selection?.id === f.id && (
                          <span
                            aria-label="Resize"
                            className="absolute -right-1 -bottom-1 h-2.5 w-2.5 cursor-se-resize rounded-sm border border-white bg-primary"
                            onPointerDown={(e) => startDrag(e, { kind: 'field', id: f.id }, f.position, 'resize')}
                            onPointerMove={onDrag}
                            onPointerUp={endDrag}
                          />
                        )}
                      </div>
                    ),
                  )}
              </div>
            )}
          />
        </div>

        {/* Right panel: a column on large screens, a drawer from the right below lg. */}
        <aside
          className={`flex w-[350px] flex-none flex-col border-l border-line bg-white max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-[min(350px,92vw)] max-lg:shadow-xl ${
            drawer === 'panel' ? '' : 'max-lg:hidden'
          }`}
        >
          <div className="overflow-x-auto border-b border-line p-2 [&_button]:px-2.5">
            <SegmentedTabs
              options={[
                { value: 'props', label: 'Properties' },
                { value: 'fields', label: `Fields (${fields.length})` },
                { value: 'pages', label: `Pages (${pageCount})` },
                ...tabs.map((t) => ({ value: t.id, label: t.label })),
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          {problems.length > 0 && (
            <ul className="m-0 border-b border-danger/30 bg-danger/5 py-2 pr-3 pl-7 text-[12px] text-danger">
              {problems.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'props' && (
              <>
                <PanelHeading
                  actions={
                    selection && (
                      <>
                        <IconButton
                          icon={Copy}
                          title="Duplicate (Ctrl+D)"
                          light
                          iconSize={16}
                          onClick={duplicateSelected}
                        />
                        <IconButton icon={Trash2} title="Delete (Del)" light iconSize={16} onClick={removeSelected} />
                      </>
                    )
                  }
                >
                  {selectedField ? 'FIELD' : selectedElement ? selectedElement.type.toUpperCase() : 'PROPERTIES'}
                </PanelHeading>
                {selectedField ? (
                  <FieldProperties
                    key={selectedField.id}
                    field={selectedField}
                    fields={fields}
                    pageCount={pageCount}
                    onChange={updateField}
                  />
                ) : selectedElement ? (
                  <ElementProperties
                    key={selectedElement.id}
                    element={selectedElement}
                    pageCount={pageCount}
                    onChange={updateElement}
                  />
                ) : (
                  <EmptyText>
                    Select something on the document, drag a field or layout item in from the left, or use{' '}
                    <b>Edit text</b> to change the document's own text.
                  </EmptyText>
                )}
              </>
            )}

            {tab === 'fields' && (
              <>
                <PanelHeading>FILL ORDER</PanelHeading>
                {!fields.length && <EmptyText>No fields yet.</EmptyText>}
                <ol className="m-0 list-none p-0">
                  {fields.map((f, i) => (
                    <li
                      key={f.id}
                      className={`flex items-center gap-1 border-b border-line-soft px-2 py-1 text-[12.5px] ${selection?.id === f.id ? 'bg-primary-tint' : ''}`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer truncate text-left"
                        onClick={() => {
                          select({ kind: 'field', id: f.id })
                          goToPage(f.position.page)
                        }}
                      >
                        <span className="text-faint">p{f.position.page}</span> {f.label || f.key}{' '}
                        <span className="text-muted">· {TYPE_LABEL[f.type]}</span>
                        {f.source === 'ai' && <span className="text-folder"> · AI</span>}
                      </button>
                      <IconButton
                        icon={ArrowUp}
                        title="Move up"
                        iconSize={13}
                        disabled={i === 0}
                        onClick={() => setFields((l) => reorder(l, f.id, -1))}
                      />
                      <IconButton
                        icon={ArrowDown}
                        title="Move down"
                        iconSize={13}
                        disabled={i === fields.length - 1}
                        onClick={() => setFields((l) => reorder(l, f.id, 1))}
                      />
                    </li>
                  ))}
                </ol>
              </>
            )}

            {tab === 'pages' &&
              (layout ? (
                <PagesPanel
                  pages={layout.pages}
                  counts={counts}
                  onGoTo={goToPage}
                  onMove={(n, step) => withDoc((d) => movePage(d, n, step))}
                  onInsertBlank={(n) => withDoc((d) => insertBlankPage(d, n))}
                  onDelete={(n) => (counts[n] ? setConfirmDeletePage(n) : withDoc((d) => deletePage(d, n)))}
                />
              ) : (
                <EmptyText>Loading pages…</EmptyText>
              ))}

            {tabs.find((t) => t.id === tab)?.content}
          </div>
        </aside>
      </div>

      {confirmDeletePage != null && (
        <ConfirmModal
          danger
          confirmLabel="Delete page"
          onCancel={() => setConfirmDeletePage(null)}
          onConfirm={() => {
            const n = confirmDeletePage
            setConfirmDeletePage(null)
            setSelection(null)
            withDoc((d) => deletePage(d, n))
          }}
        >
          Delete page {confirmDeletePage}? Its {counts[confirmDeletePage]} fields and items go with it. (Undo brings
          them back; the uploaded file is not changed.)
        </ConfirmModal>
      )}

    </div>
  )
}
