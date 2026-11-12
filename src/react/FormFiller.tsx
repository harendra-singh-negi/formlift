import { ArrowLeft, Download, Paperclip, Save, Send } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { boxStyle } from '../core/coords'
import type { FieldDef, Layout } from '../core/form-logic'
import { AnswerControl } from './components/FieldControl'
import LayoutElementView from './components/LayoutElementView'
import PdfPages, { type PdfSource } from './components/PdfPages'
import QuestionList from './components/QuestionList'
import ZoomControls from './components/ZoomControls'
import { useCompact, useFitZoom } from './hooks/useFitZoom'
import { useFormFiller, type AnswerFileInfo, type UseFormFillerOptions } from './hooks/useFormFiller'
import type { QuestionFilterState, UseQuestionFilterOptions } from './hooks/useQuestionFilter'
import { Button, ConfirmModal, FormliftProvider, SegmentedTabs, type FormliftComponents } from './ui/slots'

export type { AnswerFileInfo }

/** Parts of the FormFiller screen that can be hidden with `hide`. */
export type FillerPart =
  | 'back'
  | 'title'
  | 'views'
  | 'zoom'
  | 'saveStatus'
  | 'saveDraft'
  | 'submit'
  | 'attachments'
  | 'errors'
  | 'requiredMark'

export interface FormFillerProps extends UseFormFillerOptions {
  /** The PDF: URL, Blob / File, bytes, or a function returning one. */
  pdf: PdfSource
  title?: ReactNode
  onBack?: () => void
  /** Your own items at the end of the toolbar (e.g. "Download completed PDF"). */
  toolbar?: ReactNode
  /** Replace any UI primitive (Button, Modal, …), the answer control (FieldControl) or one per type (`fields`). */
  components?: FormliftComponents
  /** Parts of the screen to leave out. */
  hide?: FillerPart[]
  /** The views offered, the first one shown first. Default ['document', 'list']. */
  views?: ('document' | 'list')[]
  /** The list view's filters, in order: filter objects or ids of defaultFilters. Default: defaultFilters. */
  listFilters?: UseQuestionFilterOptions['filters']
  /** Search box over the list. Default true. */
  listSearch?: boolean
  /** Leave out filters this form has nothing for (e.g. Category on a form without category codes). Default true. */
  hideUnavailableFilters?: boolean
  /** Your own search / filter bar over the list instead of the built-in one; `fs` has every filter as data. */
  renderFilters?: (fs: QuestionFilterState) => ReactNode
  /** Ask "Submit this form?" first. Default true. */
  confirmSubmit?: boolean
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

/**
 * The PDF with the form's fields on it. The user fills them in place (or as a searchable list); answers autosave
 * through onSave, Submit checks them with the same rules as validateAnswers on your server.
 * All the logic lives in useFormFiller: use that hook directly for a completely custom UI.
 */
export default function FormFiller({
  pdf: pdfSource,
  title,
  onBack,
  toolbar,
  components,
  hide = [],
  views = ['document', 'list'],
  listFilters,
  listSearch,
  hideUnavailableFilters,
  renderFilters,
  confirmSubmit: askFirst = true,
  className = 'h-full',
  ...options
}: FormFillerProps) {
  const shows = (p: FillerPart) => !hide.includes(p)
  const ff = useFormFiller(options)
  const { fields, readOnly = false, onSave } = options
  const layout: Layout | null = options.layout ?? null
  const { answers, states, errors } = ff
  const pdfWidth = ff.pdfSizes.length ? Math.max(...ff.pdfSizes.map((p) => p.width)) : 595
  const { zoom, setZoom, ref: fitRef } = useFitZoom(Math.max(...(layout?.pages.map((p) => p.width) ?? [pdfWidth])))
  const compact = useCompact()
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Document = the PDF with the controls on it; List = the same answers as questions, with search and filters.
  const [view, setView] = useState<'document' | 'list'>(views[0] ?? 'document')
  const { loadPageText } = ff
  useEffect(() => {
    if (view === 'list') loadPageText()
  }, [view, loadPageText])

  if (loadError) return <p className="fl-root p-6 text-center text-sm text-danger">{loadError}</p>

  // One field's answer control (the same on the document and in the list), with the required star.
  const control = (f: FieldDef) => (
    <>
      <AnswerControl
        components={components}
        field={f}
        value={answers[f.key]}
        readOnly={readOnly || states[f.key].readOnly || (f.type === 'file' && !ff.canUpload)}
        compact={compact}
        error={errors[f.key]}
        onChange={(v) => ff.change(f, v)}
        fileName={ff.fileOf(answers[f.key])?.fileName}
        signatureSrc={ff.signatureSrc(f)}
        onFile={ff.canUpload ? (file) => void ff.attach(f, file) : undefined}
        onOpenFile={() => ff.openFile(String(answers[f.key]))}
      />
      {states[f.key].required && !readOnly && shows('requiredMark') && (
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 text-[12px] font-bold text-danger">*</span>
      )}
    </>
  )

  return (
    <FormliftProvider components={components}>
      <div className={`fl-root flex min-h-[min(600px,100dvh)] flex-col bg-white text-ink ${className}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
          {onBack && shows('back') && (
            <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
              Back
            </Button>
          )}
          {title != null && shows('title') && (
            <h2 className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold max-sm:text-[15px] sm:flex-none">
              {title}
            </h2>
          )}
          {views.length > 1 && shows('views') && (
            <SegmentedTabs
              options={views.map((v) => ({ value: v, label: v === 'document' ? 'Document' : 'List' }))}
              value={view}
              onChange={setView}
            />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end">
            {view === 'document' && shows('zoom') && <ZoomControls zoom={zoom} onChange={setZoom} />}
            {!readOnly && onSave && (
              <>
                {shows('saveStatus') && (
                  <span className="text-right text-[12px] text-muted sm:w-24" aria-live="polite">
                    {
                      {
                        saved: ff.hasSaved ? 'Draft saved' : '',
                        dirty: 'Unsaved',
                        saving: 'Saving…',
                        error: 'Not saved',
                      }[ff.saveState]
                    }
                  </span>
                )}
                {shows('saveDraft') && (
                  <Button variant="secondary" size="sm" icon={Save} title="Save draft" onClick={() => void ff.save()}>
                    <span className="max-sm:hidden">Save draft</span>
                  </Button>
                )}
                {shows('submit') && (
                  <Button size="sm" icon={Send} onClick={() => (askFirst ? setConfirmSubmit(true) : void ff.submit())}>
                    Submit
                  </Button>
                )}
              </>
            )}
            {toolbar}
          </div>
        </div>
        {ff.attachments.length > 0 && shows('attachments') && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-white px-4 py-1.5 text-[12.5px]">
            <span className="inline-flex items-center gap-1 font-semibold text-ink-2">
              <Paperclip size={13} /> Attachments
            </span>
            {ff.attachments.map((x) => (
              <button
                key={x.id}
                type="button"
                title={`Download ${x.fileName}`}
                disabled={!ff.canLoadFiles}
                className="inline-flex max-w-full cursor-pointer items-center gap-1 text-primary hover:underline disabled:cursor-default"
                onClick={() => ff.downloadFile(x.id, x.fileName)}
              >
                <span className="truncate">{x.fileName}</span>
                {x.fileSize ? <span className="text-muted">({humanSize(x.fileSize)})</span> : null}
                {ff.canLoadFiles && <Download size={12} />}
              </button>
            ))}
          </div>
        )}
        {ff.errorList.length > 0 && shows('errors') && (
          <ul className="m-0 border-b border-danger/30 bg-danger/5 px-6 py-2 text-[13px] text-danger">
            {ff.errorList.map((f) => (
              <li key={f.key}>
                Page {f.position.page}: {errors[f.key]}
              </li>
            ))}
          </ul>
        )}
        {view === 'list' && (
          <div className="flex-1 overflow-auto bg-hover">
            <QuestionList
              questions={ff.questions}
              answers={answers}
              control={control}
              filters={listFilters}
              search={listSearch}
              hideUnavailable={hideUnavailableFilters}
              renderToolbar={renderFilters}
            />
          </div>
        )}
        {/* Kept while the list shows, so the pages need not be drawn again. */}
        <div ref={fitRef} className={`flex-1 overflow-auto bg-hover ${view === 'list' ? 'hidden' : ''}`}>
          <PdfPages
            load={pdfSource}
            zoom={zoom}
            pages={layout?.pages}
            onLoaded={ff.onPdfLoaded}
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
          <ConfirmModal
            confirmLabel="Submit"
            onConfirm={() => {
              setConfirmSubmit(false)
              void ff.submit()
            }}
            onCancel={() => setConfirmSubmit(false)}
          >
            Submit this form? You cannot change the answers afterwards.
          </ConfirmModal>
        )}
      </div>
    </FormliftProvider>
  )
}
