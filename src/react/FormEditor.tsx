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
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import ElementProperties from './components/ElementProperties'
import { AnswerControl } from './components/FieldControl'
import FieldProperties from './components/FieldProperties'
import LayoutElementView from './components/LayoutElementView'
import PagesPanel from './components/PagesPanel'
import PdfPages, { type PdfSource } from './components/PdfPages'
import ZoomControls from './components/ZoomControls'
import { useCompact, useFitZoom } from './hooks/useFitZoom'
import { useFormEditor, type FormDoc, type UseFormEditorOptions } from './hooks/useFormEditor'
import { TYPE_LABEL } from './constants'
import { boxStyle } from '../core/coords'
import type { FieldType } from '../core/form-logic'
import { ELEMENT_TOOLS, type ElementTool } from '../core/layout'
import {
  Button,
  ConfirmModal,
  EmptyText,
  FormliftProvider,
  IconButton,
  PanelHeading,
  SegmentedTabs,
  type FormliftComponents,
} from './ui/slots'

export type { FormDoc }

/** Parts of the FormEditor screen that can be hidden with `hide`. */
export type EditorPart =
  | 'back'
  | 'title'
  | 'status'
  | 'undo'
  | 'snap'
  | 'zoom'
  | 'editText'
  | 'autoDetect'
  | 'preview'
  | 'save'
  | 'tools'
  | 'fieldTools'
  | 'layoutTools'
  | 'panel'
  | 'propertiesTab'
  | 'fieldsTab'
  | 'pagesTab'
  | 'problems'

const DRAG_TYPE = 'application/x-doc-item' // "field:<type>" or "element:<tool>"

/** Imperative handle (`ref`): save from outside, e.g. before a workflow step. */
export interface FormEditorHandle {
  /** Saves if there are changes. false = invalid or onSave failed. */
  save: () => Promise<boolean>
  readonly dirty: boolean
  readonly value: FormDoc
}

export interface FormEditorProps extends UseFormEditorOptions {
  /** The PDF: URL, Blob / File, bytes, or a function returning one. Never modified. */
  pdf: PdfSource
  title?: ReactNode
  /** Back button in the toolbar (hidden when omitted). */
  onBack?: () => void
  /** Your own items at the end of the toolbar (status, workflow buttons…). */
  toolbar?: ReactNode
  /** A strip under the toolbar (e.g. "this version is live"). */
  banner?: ReactNode
  /** Your own tabs in the right panel (e.g. history). */
  tabs?: { id: string; label: string; content: ReactNode }[]
  /** Replace any UI primitive (Button, Modal, …), or the answer controls used in preview (FieldControl / `fields`). */
  components?: FormliftComponents
  /** Parts of the screen to leave out (the logic still runs: hide 'save' and call `ref.save()` yourself). */
  hide?: EditorPart[]
  /** Extra classes on the root. It fills its container's height (`h-full`) by default: give the container a height. */
  className?: string
  ref?: Ref<FormEditorHandle>
}

/**
 * Admin editor. The document in the middle: original PDF pages (and blank pages) with everything the admin
 * adds on top. Left: fields and layout tools to drag onto a page. "Edit text" makes every line of the original
 * clickable: a click covers it with an editable copy. Right: properties of the selection, the field list, pages
 * (reorder, delete, add blank) and history. Nothing changes the uploaded PDF; all of it is saved in the version.
 * Keyboard: Delete, Ctrl+Z / Ctrl+Y, Ctrl+D duplicate, arrows nudge (Shift = bigger steps).
 * All the logic lives in useFormEditor: use that hook directly for a completely custom UI.
 */
export default function FormEditor({
  pdf: pdfSource,
  title,
  onBack,
  toolbar,
  banner,
  tabs = [],
  components,
  hide = [],
  className = 'h-full',
  ref,
  ...options
}: FormEditorProps) {
  const shows = (p: EditorPart) => !hide.includes(p)
  const panelTabs = [
    ...(shows('propertiesTab') ? ['props'] : []),
    ...(shows('fieldsTab') ? ['fields'] : []),
    ...(shows('pagesTab') ? ['pages'] : []),
    ...tabs.map((t) => t.id),
  ]
  const [tab, setTabState] = useState<string>(panelTabs[0] ?? 'props')
  const setTab = (t: string) => panelTabs.includes(t) && setTabState(t)
  const ed = useFormEditor({
    ...options,
    onDetected: (found) => {
      setTab('fields')
      options.onDetected?.(found)
    },
  })
  const { fields, layout, pageCount, selection, selectedField, selectedElement, preview, armed, snapOn, editText } = ed
  // Phone / tablet (below lg): the side panels open as drawers over the page; null = both closed.
  const [drawer, setDrawer] = useState<'tools' | 'panel' | null>(null)
  const compact = useCompact()
  const [confirmDeletePage, setConfirmDeletePage] = useState<number | null>(null)
  const [loadError, setLoadError] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const { zoom, setZoom, ref: fitRef } = useFitZoom(Math.max(...(ed.pageSizes ?? [{ width: 595 }]).map((p) => p.width)))
  // A new selection shows its properties.
  useEffect(() => {
    if (selection) setTab('props')
  }, [selection])

  function goToPage(n: number) {
    scroller.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: 'start' })
  }

  const saveRef = useRef(ed.save)
  useEffect(() => {
    saveRef.current = ed.save
  })
  useImperativeHandle(
    ref,
    () => ({
      save: () => (ed.dirty ? saveRef.current() : Promise.resolve(ed.problems.length === 0)),
      dirty: ed.dirty,
      value: ed.doc,
    }),
    [ed.dirty, ed.doc, ed.problems],
  )

  if (loadError) return <p className="fl-root p-6 text-center text-sm text-danger">{loadError}</p>

  const { previewStates, previewAnswers, counts, pageHeight } = ed

  // Drag onto a page, or tap it and then tap the page (touch screens have no drag and drop).
  const toolItem = (key: string, label: string) => (
    <button
      type="button"
      key={key}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, key)}
      onClick={() => {
        ed.setArmed(armed === key ? null : key)
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
    <FormliftProvider components={components}>
      <div className={`fl-root flex min-h-[640px] flex-col bg-white text-ink ${className}`}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2.5">
          {onBack && shows('back') && (
            <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
              Back
            </Button>
          )}
          {!preview && shows('tools') && (
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
          {shows('panel') && (
            <Button
              variant={drawer === 'panel' ? 'primary' : 'secondary'}
              size="sm"
              icon={PanelRight}
              className="lg:hidden"
              onClick={() => setDrawer((d) => (d === 'panel' ? null : 'panel'))}
            >
              {selection ? 'Properties' : 'Panel'}
            </Button>
          )}
          {title != null && shows('title') && (
            <h2 className="m-0 min-w-0 truncate text-[17px] font-semibold">{title}</h2>
          )}
          {shows('status') && (
            <span className="text-[12px] text-muted">{ed.dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {shows('undo') && (
              <>
                <IconButton icon={Undo2} title="Undo (Ctrl+Z)" disabled={!ed.canUndo || preview} onClick={ed.undo} />
                <IconButton icon={Redo2} title="Redo (Ctrl+Y)" disabled={!ed.canRedo || preview} onClick={ed.redo} />
              </>
            )}
            {shows('snap') && (
              <IconButton
                icon={Grid3x3}
                title={snapOn ? 'Snap to grid: on' : 'Snap to grid: off'}
                className={snapOn ? '!text-primary' : ''}
                onClick={() => ed.setSnapOn(!snapOn)}
              />
            )}
            {shows('zoom') && <ZoomControls zoom={zoom} onChange={setZoom} />}
            {!preview && shows('editText') && (
              <Button
                variant={editText ? 'primary' : 'secondary'}
                size="sm"
                icon={Type}
                disabled={!layout}
                title="Click any line of the document to change its text"
                onClick={() => ed.setEditText(!editText)}
              >
                <span className="max-sm:hidden">Edit text</span>
              </Button>
            )}
            {!preview && shows('autoDetect') && (
              <Button
                variant="secondary"
                size="sm"
                icon={Wand2}
                disabled={!ed.pdf || !layout || !!ed.detecting}
                title="Find answer lines, checkboxes and table cells and suggest fields for them"
                onClick={() => void ed.detect()}
              >
                <span className="max-sm:hidden">Auto-detect</span>
              </Button>
            )}
            {shows('preview') && (
              <Button
                variant="secondary"
                size="sm"
                icon={preview ? Pencil : Eye}
                title={preview ? 'Back to editing' : 'Preview'}
                onClick={() => ed.setPreview(!preview)}
              >
                <span className="max-sm:hidden">{preview ? 'Edit' : 'Preview'}</span>
              </Button>
            )}
            {shows('save') && (
              <Button size="sm" icon={Save} title="Save" disabled={!ed.dirty || ed.busy} onClick={() => void ed.save()}>
                <span className="max-sm:hidden">Save</span>
              </Button>
            )}
            {toolbar}
          </div>
        </div>
        {banner}
        {ed.detecting && (
          <div className="flex items-center gap-3 bg-folder/15 px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
            Detecting fields… page {ed.detecting.done} of {ed.detecting.total}
            <div className="h-1.5 w-40 overflow-hidden rounded bg-white">
              <div
                className="h-full bg-folder"
                style={{ width: `${(100 * ed.detecting.done) / Math.max(1, ed.detecting.total)}%` }}
              />
            </div>
            <button
              type="button"
              className="cursor-pointer text-primary hover:underline"
              onClick={() => ed.detecting?.stop.abort()}
            >
              Stop
            </button>
          </div>
        )}
        {armed && !preview && (
          <p className="m-0 flex items-center gap-3 bg-primary-soft px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
            Tap the page where the {armedLabel} should go.
            <button
              type="button"
              className="cursor-pointer text-primary hover:underline"
              onClick={() => ed.setArmed(null)}
            >
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
          {!preview && shows('tools') && (
            <aside
              className={`w-[170px] flex-none overflow-y-auto border-r border-line bg-white max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:w-[220px] max-lg:shadow-xl ${
                drawer === 'tools' ? '' : 'max-lg:hidden'
              }`}
            >
              {shows('fieldTools') && ed.fieldTools.length > 0 && (
                <>
                  <PanelHeading>FIELDS</PanelHeading>
                  <p className="m-0 px-3 pt-2 text-[11.5px] text-muted">
                    Drag onto the document, or tap one, then the page
                  </p>
                  <div className="space-y-1 p-2">
                    {ed.fieldTools.map((k) => toolItem(k, TYPE_LABEL[k.slice(6) as FieldType]))}
                  </div>
                </>
              )}
              {shows('layoutTools') && ed.elementTools.length > 0 && (
                <>
                  <PanelHeading>LAYOUT</PanelHeading>
                  <div className="space-y-1 p-2">
                    {ed.elementTools.map((k) => toolItem(k, ELEMENT_TOOLS[k.slice(8) as ElementTool].label))}
                  </div>
                </>
              )}
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
              if (!preview) ed.setSelection(null)
              setDrawer(null)
            }}
          >
            <PdfPages
              load={pdfSource}
              zoom={zoom}
              pages={layout?.pages}
              withText={editText && !preview}
              onLoaded={ed.onPdfLoaded}
              onError={() => setLoadError('The document could not be shown')}
              overlay={(page, lines) => (
                <div
                  className="absolute inset-0"
                  style={
                    snapOn && !preview
                      ? {
                          backgroundImage:
                            'linear-gradient(to right, color-mix(in srgb, var(--fl-primary) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--fl-primary) 7%, transparent) 1px, transparent 1px)',
                          backgroundSize: '2% 2%',
                        }
                      : undefined
                  }
                  onDragOver={(e) => !preview && e.preventDefault()}
                  onDrop={(e) => {
                    const key = e.dataTransfer.getData(DRAG_TYPE)
                    if (ed.placeNew(key, page, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
                      e.preventDefault()
                  }}
                  onClick={(e) => {
                    if (!armed || preview) return
                    ed.placeNew(armed, page, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
                    ed.setArmed(null)
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
                      onClick={() => ed.editLine(line, page)}
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
                            ed.startDrag(e, { kind: 'element', id: el.id }, { page, ...el.position }, 'move')
                          }
                          onPointerMove={ed.onDrag}
                          onPointerUp={ed.endDrag}
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
                                ed.startDrag(e, { kind: 'element', id: el.id }, { page, ...el.position }, 'resize')
                              }
                              onPointerMove={ed.onDrag}
                              onPointerUp={ed.endDrag}
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
                            <AnswerControl
                              components={components}
                              field={f}
                              value={previewAnswers[f.key]}
                              readOnly={previewStates[f.key].readOnly}
                              compact={compact}
                              onChange={(v) => ed.setPreviewAnswers((a) => ({ ...a, [f.key]: v }))}
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
                          onPointerDown={(e) => ed.startDrag(e, { kind: 'field', id: f.id }, f.position, 'move')}
                          onPointerMove={ed.onDrag}
                          onPointerUp={ed.endDrag}
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
                              onPointerDown={(e) => ed.startDrag(e, { kind: 'field', id: f.id }, f.position, 'resize')}
                              onPointerMove={ed.onDrag}
                              onPointerUp={ed.endDrag}
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
          {shows('panel') && panelTabs.length > 0 && (
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
                  ].filter((o) => panelTabs.includes(o.value))}
                  value={tab}
                  onChange={setTab}
                />
              </div>
              {ed.problems.length > 0 && shows('problems') && (
                <ul className="m-0 border-b border-danger/30 bg-danger/5 py-2 pr-3 pl-7 text-[12px] text-danger">
                  {ed.problems.slice(0, 6).map((p) => (
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
                              onClick={ed.duplicateSelected}
                            />
                            <IconButton
                              icon={Trash2}
                              title="Delete (Del)"
                              light
                              iconSize={16}
                              onClick={ed.removeSelected}
                            />
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
                        onChange={ed.updateField}
                      />
                    ) : selectedElement ? (
                      <ElementProperties
                        key={selectedElement.id}
                        element={selectedElement}
                        pageCount={pageCount}
                        onChange={ed.updateElement}
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
                              ed.setSelection({ kind: 'field', id: f.id })
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
                            onClick={() => ed.reorderField(f.id, -1)}
                          />
                          <IconButton
                            icon={ArrowDown}
                            title="Move down"
                            iconSize={13}
                            disabled={i === fields.length - 1}
                            onClick={() => ed.reorderField(f.id, 1)}
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
                      onMove={ed.movePage}
                      onInsertBlank={ed.insertBlankPage}
                      onDelete={(n) => (counts[n] ? setConfirmDeletePage(n) : ed.deletePage(n))}
                    />
                  ) : (
                    <EmptyText>Loading pages…</EmptyText>
                  ))}

                {tabs.find((t) => t.id === tab)?.content}
              </div>
            </aside>
          )}
        </div>

        {confirmDeletePage != null && (
          <ConfirmModal
            danger
            confirmLabel="Delete page"
            onCancel={() => setConfirmDeletePage(null)}
            onConfirm={() => {
              const n = confirmDeletePage
              setConfirmDeletePage(null)
              ed.deletePage(n)
            }}
          >
            Delete page {confirmDeletePage}? Its {counts[confirmDeletePage]} fields and items go with it. (Undo brings
            them back; the uploaded file is not changed.)
          </ConfirmModal>
        )}
      </div>
    </FormliftProvider>
  )
}
