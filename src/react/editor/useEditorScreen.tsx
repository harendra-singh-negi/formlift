// The editor screen's state and handlers, shared by FormEditor's parts (toolbar, tools, document, side panel).
// The form logic itself is useFormEditor's; this adds what only this screen needs: panel tabs, drawers on small
// screens, zoom, drag and drop from the tools, and the imperative handle.

import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { FieldType } from '../../core/form-logic'
import type { ElementTool } from '../../core/layout'
import { taughtBy, whyLearnt } from '../../core/learn'
import type { EditorPart, FormEditorProps } from '../FormEditor'
import { useCompact, useFitZoom } from '../hooks/useFitZoom'
import { useFormEditor } from '../hooks/useFormEditor'
import { toolName, typeName, useLabels } from '../labels'

export const DRAG_TYPE = 'application/x-doc-item' // "field:<type>" or "element:<tool>"

/** Everything FormEditor's parts share: its props, the editor (`ed`), and the screen's own state. */
export function useEditorScreen({
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
    // What auto-detect learnt: only where it learns (onLesson).
    ...(shows('learntTab') && options.onLesson ? ['learnt'] : []),
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


  const { previewStates, previewAnswers, counts, pageHeight } = ed
  // How learning made the selected field, when it did (this session's suggestions): what Forget this forgets.
  const why = selectedField && ed.learnt ? whyLearnt(selectedField) : undefined
  const taught = selectedField && ed.learnt ? taughtBy(selectedField) : undefined

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

  return {
    pdfSource,
    title,
    onBack,
    toolbar,
    banner,
    tabs,
    components,
    className,
    zoomSteps,
    stickyToolbar,
    stickyPanels,
    options,
    shows,
    L,
    panelTabs,
    tab,
    setTab,
    ed,
    fields,
    layout,
    pageCount,
    selection,
    selectedField,
    selectedElement,
    preview,
    armed,
    snapOn,
    editText,
    drawer,
    setDrawer,
    compact,
    confirmDeletePage,
    setConfirmDeletePage,
    loadError,
    setLoadError,
    scroller,
    zoom,
    setZoom,
    fitRef,
    goToPage,
    previewStates,
    previewAnswers,
    counts,
    pageHeight,
    why,
    taught,
    toolItem,
    armedLabel,
  }
}

export type EditorScreen = ReturnType<typeof useEditorScreen>
