import {
  ArrowLeft,
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
import { Fragment, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import ElementProperties from './components/ElementProperties'
import { AnswerControl } from './components/FieldControl'
import FieldOrderList from './components/FieldOrderList'
import FieldProperties from './components/FieldProperties'
import LayoutElementView from './components/LayoutElementView'
import PagesPanel from './components/PagesPanel'
import PdfPages, { type PdfSource } from './components/PdfPages'
import ZoomControls from './components/ZoomControls'
import { useCompact, useFitZoom } from './hooks/useFitZoom'
import { useFormEditor, type FormDoc, type UseFormEditorOptions } from './hooks/useFormEditor'
import { toolName, typeName, useLabels } from './labels'
import { boxStyle } from '../core/coords'
import { applyAnswer, type FieldType } from '../core/form-logic'
import type { ElementTool } from '../core/layout'
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
  /** Zoom steps of the − / + buttons. Default [0.5, 0.75, 1, 1.25, 1.5, 2]. */
  zoomSteps?: readonly number[]
  /**
   * true (default): the toolbar stays on top when the page around the editor scrolls.
   * false: it scrolls away with the page.
   */
  stickyToolbar?: boolean
  /**
   * true (default): only the document scrolls; the tools and the right panel stay in view.
   * false: the whole editor scrolls as one page, panels included.
   */
  stickyPanels?: boolean
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
  zoomSteps,
  stickyToolbar = true,
  stickyPanels = true,
  ...options
}: FormEditorProps) {
  const shows = (p: EditorPart) => !hide.includes(p)
  const L = useLabels(options.labels)
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
  const { zoom, setZoom, ref: fitRef } = useFitZoom(Math.max(...(ed.pageSizes ?? [{ width: 595 }]).map((p) => p.width)), zoomSteps)
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
      ? typeName(L, armed.slice(6) as FieldType)
      : toolName(L, armed.slice(8) as ElementTool)
    : ''

  return (
    <FormliftProvider components={components} labels={options.labels}>
      <div
        className={`fl-root flex min-h-[min(640px,100%)] flex-col bg-white text-ink ${stickyPanels ? '' : 'overflow-auto'} ${className}`}
      >
        {/* Toolbar */}
        <div
          className={`flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2.5 max-sm:px-3 max-sm:py-2 ${stickyToolbar ? 'sticky top-0 z-20' : ''}`}
        >
          {onBack && shows('back') && (
            <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
              {L.back}
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
              {L.add}
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
              {selection ? L.properties : L.panel}
            </Button>
          )}
          {title != null && shows('title') && (
            <h2 className="m-0 min-w-0 truncate text-[17px] font-semibold max-sm:flex-1 max-sm:text-[15px]">{title}</h2>
          )}
          {shows('status') && (
            // phones: the Save button being enabled already says "unsaved"
            <span className="text-[12px] text-muted max-sm:hidden">{ed.dirty ? L.unsavedChanges : L.allChangesSaved}</span>
          )}
          {/* phones: one row that scrolls sideways instead of wrapping into several */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:flex-nowrap max-sm:overflow-x-auto">
            {shows('undo') && (
              <>
                <IconButton icon={Undo2} title={L.undo} disabled={!ed.canUndo || preview} onClick={ed.undo} />
                <IconButton icon={Redo2} title={L.redo} disabled={!ed.canRedo || preview} onClick={ed.redo} />
              </>
            )}
            {shows('snap') && (
              <IconButton
                icon={Grid3x3}
                title={snapOn ? L.snapOn : L.snapOff}
                className={snapOn ? '!text-primary' : ''}
                onClick={() => ed.setSnapOn(!snapOn)}
              />
            )}
            {shows('zoom') && (
              <div className="max-sm:hidden">
                <ZoomControls zoom={zoom} onChange={setZoom} steps={zoomSteps} />
              </div>
            )}
            {!preview && shows('editText') && (
              <Button
                variant={editText ? 'primary' : 'secondary'}
                size="sm"
                icon={Type}
                disabled={!layout}
                title={L.editTextHint}
                onClick={() => ed.setEditText(!editText)}
              >
                <span className="max-sm:hidden">{L.editText}</span>
              </Button>
            )}
            {!preview && shows('autoDetect') && (
              <Button
                variant="secondary"
                size="sm"
                icon={Wand2}
                disabled={!ed.pdf || !layout || !!ed.detecting}
                title={L.autoDetectHint}
                onClick={() => void ed.detect()}
              >
                <span className="max-sm:hidden">{L.autoDetect}</span>
              </Button>
            )}
            {shows('preview') && (
              <Button
                variant="secondary"
                size="sm"
                icon={preview ? Pencil : Eye}
                title={preview ? L.backToEditing : L.preview}
                onClick={() => ed.setPreview(!preview)}
              >
                <span className="max-sm:hidden">{preview ? L.edit : L.preview}</span>
              </Button>
            )}
            {shows('save') && (
              <Button
                size="sm"
                icon={Save}
                title={L.save}
                className="max-sm:ml-auto"
                disabled={!ed.dirty || ed.busy}
                onClick={() => void ed.save()}
              >
                <span className="max-sm:hidden">{L.save}</span>
              </Button>
            )}
            {toolbar}
          </div>
        </div>
        {banner}
        {ed.detecting && (
          <div className="flex items-center gap-3 bg-folder/15 px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
            {L.detecting(ed.detecting.done, ed.detecting.total)}
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
              {L.stop}
            </button>
          </div>
        )}
        {armed && !preview && (
          <p className="m-0 flex items-center gap-3 bg-primary-soft px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
            {L.tapToPlace(armedLabel)}
            <button
              type="button"
              className="cursor-pointer text-primary hover:underline"
              onClick={() => ed.setArmed(null)}
            >
              {L.cancel}
            </button>
          </p>
        )}
        {editText && (
          <p className="m-0 bg-folder/15 px-4 py-1.5 text-[12.5px] text-ink-2">
            {L.editTextBanner}
          </p>
        )}

        <div className={`relative flex ${stickyPanels ? 'min-h-0 flex-1' : 'flex-none'}`}>
          {/* Toolbox: a column on large screens, a drawer from the left below lg. */}
          {!preview && shows('tools') && (
            <aside
              className={`w-[170px] flex-none overflow-y-auto border-r border-line bg-white max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:w-[220px] max-lg:shadow-xl ${
                drawer === 'tools' ? '' : 'max-lg:hidden'
              }`}
            >
              {shows('fieldTools') && ed.fieldTools.length > 0 && (
                <>
                  <PanelHeading>{L.fieldsHeading}</PanelHeading>
                  <p className="m-0 px-3 pt-2 text-[11.5px] text-muted">
                    {L.dragHint}
                  </p>
                  <div className="space-y-1 p-2">
                    {ed.fieldTools.map((k) => toolItem(k, typeName(L, k.slice(6) as FieldType)))}
                  </div>
                </>
              )}
              {shows('layoutTools') && ed.elementTools.length > 0 && (
                <>
                  <PanelHeading>{L.layoutHeading}</PanelHeading>
                  <div className="space-y-1 p-2">
                    {ed.elementTools.map((k) => toolItem(k, toolName(L, k.slice(8) as ElementTool)))}
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
            className={`min-w-0 flex-1 bg-hover ${stickyPanels ? 'overflow-auto' : 'overflow-x-auto'}`}
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
              onError={() => setLoadError(L.documentLoadError)}
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
                      title={L.editLine(line.text)}
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
                          aria-label={`${toolName(L, el.type)} ${el.text ?? ''}`}
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
                              aria-label={L.resize}
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
                    .filter((f) => f.position.page === page && !f.dialogOnly)
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
                              onChange={(v) => ed.setPreviewAnswers((a) => applyAnswer(fields, a, f, v))}
                            />
                          </div>
                        )
                      ) : (
                        <div
                          key={f.id}
                          role="button"
                          tabIndex={0}
                          aria-label={L.fieldOnPage(typeName(L, f.type), f.label || f.key)}
                          title={`${f.label || f.key} (${typeName(L, f.type)})`}
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
                              aria-label={L.resize}
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
                    { value: 'props', label: L.propertiesTab },
                    { value: 'fields', label: L.fieldsTab(fields.length) },
                    { value: 'pages', label: L.pagesTab(pageCount) },
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
              <div className="min-h-0 flex-1 overflow-y-auto" data-fl-scroll>
                {tab === 'props' && (
                  <>
                    <PanelHeading
                      actions={
                        selection && (
                          <>
                            <IconButton
                              icon={Copy}
                              title={L.duplicate}
                              light
                              iconSize={16}
                              onClick={ed.duplicateSelected}
                            />
                            <IconButton
                              icon={Trash2}
                              title={L.deleteSelected}
                              light
                              iconSize={16}
                              onClick={ed.removeSelected}
                            />
                          </>
                        )
                      }
                    >
                      {selectedField
                        ? L.fieldHeading
                        : selectedElement
                          ? toolName(L, selectedElement.type).toUpperCase()
                          : L.propertiesHeading}
                    </PanelHeading>
                    {selectedField ? (
                      <FieldProperties
                        key={selectedField.id}
                        field={selectedField}
                        fields={fields}
                        pageCount={pageCount}
                        onChange={ed.updateField}
                        onFieldsChange={ed.setFields}
                        onSelect={(id) => ed.setSelection({ kind: 'field', id })}
                        rules={options.rules}
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
                        {L.nothingSelected.split(L.editText).map((part, i) => (
                          <Fragment key={i}>
                            {i > 0 && <b>{L.editText}</b>}
                            {part}
                          </Fragment>
                        ))}
                      </EmptyText>
                    )}
                  </>
                )}

                {tab === 'fields' && (
                  <>
                    <PanelHeading>{L.fillOrderHeading}</PanelHeading>
                    {!fields.length && <EmptyText>{L.noFields}</EmptyText>}
                    <FieldOrderList
                      fields={fields}
                      selectedId={selection?.id}
                      onPick={(f) => {
                        ed.setSelection({ kind: 'field', id: f.id })
                        goToPage(f.position.page)
                      }}
                      onMove={ed.reorderField}
                    />
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
                    <EmptyText>{L.loadingPages}</EmptyText>
                  ))}

                {tabs.find((t) => t.id === tab)?.content}
              </div>
            </aside>
          )}
        </div>

        {confirmDeletePage != null && (
          <ConfirmModal
            danger
            confirmLabel={L.deletePage}
            onCancel={() => setConfirmDeletePage(null)}
            onConfirm={() => {
              const n = confirmDeletePage
              setConfirmDeletePage(null)
              ed.deletePage(n)
            }}
          >
            {L.confirmDeletePage(confirmDeletePage, counts[confirmDeletePage])}
          </ConfirmModal>
        )}
      </div>
    </FormliftProvider>
  )
}
