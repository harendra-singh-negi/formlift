import type { ReactNode, Ref } from 'react'
import type { PdfSource } from './components/PdfPages'
import DocumentView from './editor/DocumentView'
import SidePanel from './editor/SidePanel'
import Toolbar from './editor/Toolbar'
import Toolbox from './editor/Toolbox'
import { useEditorScreen } from './editor/useEditorScreen'
import type { FormDoc, UseFormEditorOptions } from './hooks/useFormEditor'
import { ConfirmModal, FormliftProvider, type FormliftComponents } from './ui/slots'

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
  | 'learntTab'
  | 'problems'


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
export default function FormEditor(props: FormEditorProps) {
  const ui = useEditorScreen(props)
  const {
    L, ed, components, options, className, stickyPanels, loadError, confirmDeletePage, setConfirmDeletePage, counts,
  } = ui
  if (loadError) return <p className="fl-root p-6 text-center text-sm text-danger">{loadError}</p>
  return (
    <FormliftProvider components={components} labels={options.labels}>
      <div
        className={`fl-root flex min-h-[min(640px,100%)] flex-col bg-white text-ink ${stickyPanels ? '' : 'overflow-auto'} ${className}`}
      >
        <Toolbar ui={ui} />

        <div className={`relative flex ${stickyPanels ? 'min-h-0 flex-1' : 'flex-none'}`}>
          <Toolbox ui={ui} />
          <DocumentView ui={ui} />
          <SidePanel ui={ui} />
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
