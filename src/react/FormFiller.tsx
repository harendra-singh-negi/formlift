import { ArrowLeft, Download, ListPlus, MessageSquare, Paperclip, Plus, Save, Send, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLabels } from './labels'
import { boxStyle } from '../core/coords'
import {
  evaluate,
  movedDown,
  onSheets,
  pageGrowth,
  perRowOf,
  textSize,
  type Answers,
  type FieldDef,
  type Layout,
  type WidthOf,
} from '../core/form-logic'
import { BASE_SCALE, PAGE_GAP } from './constants'
import { AnswerControl } from './components/FieldControl'
import { CommentsDialog, FieldDialog } from './components/FieldDialogs'
import LayoutElementView from './components/LayoutElementView'
import PdfPages, { type PdfSource } from './components/PdfPages'
import QuestionList from './components/QuestionList'
import ZoomControls from './components/ZoomControls'
import { useCompact, useFitZoom } from './hooks/useFitZoom'
import { useFormFiller, type AnswerFileInfo, type UseFormFillerOptions } from './hooks/useFormFiller'
import type { QuestionFilterState, UseQuestionFilterOptions } from './hooks/useQuestionFilter'
import { Button, ConfirmModal, FormliftProvider, SegmentedTabs, type FormliftComponents } from './ui/slots'

export type { AnswerFileInfo }

// Text widths for growing answers, Helvetica metrics like the completed PDF (Arial has the same widths).
let measure: CanvasRenderingContext2D | null | undefined
const widthOf: WidthOf = (text, size) => {
  if (measure === undefined) measure = document.createElement('canvas').getContext('2d')
  if (!measure) return text.length * size * 0.5
  measure.font = `${size}px Helvetica, Arial, sans-serif`
  return measure.measureText(text).width
}

/**
 * A grown box running over a page break: one window per page, each showing its part of the same control (one
 * copy per window, sharing the answer). When the caret leaves a window the browser scrolls it to follow; that
 * scroll is undone and the caret carries on in the next (or previous) window's copy.
 * ponytail: copies repeat the control's ids / names; give copies their own ids if a label or test needs them.
 */
function SplitBox({
  left,
  width,
  height,
  style,
  windows,
  children,
}: {
  left: string
  width: string
  height: number
  style: CSSProperties
  windows: { top: number; height: number; scroll: number }[]
  children: ReactNode
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([])
  return windows.map((w, j) => (
    <div
      key={j}
      ref={(el) => {
        refs.current[j] = el
        if (el) el.scrollTop = w.scroll
      }}
      className="absolute overflow-hidden"
      style={{ left, width, top: w.top, height: w.height }}
      onScroll={(e) => {
        const el = e.currentTarget
        if (Math.abs(el.scrollTop - w.scroll) < 1) return
        const next = refs.current[j + (el.scrollTop > w.scroll ? 1 : -1)]
        el.scrollTop = w.scroll
        const from = el.querySelector('textarea')
        const to = next?.querySelector('textarea')
        if (!from || !to || document.activeElement !== from) return
        to.focus({ preventScroll: true })
        to.setSelectionRange(from.selectionStart, from.selectionEnd)
      }}
    >
      <div className="relative [container-type:size]" style={{ ...style, height }}>
        {children}
      </div>
    </div>
  ))
}

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
  /** Your own loader in the list view while the PDF is read (`done` of `total` pages). Default: the `readingDocument` text. */
  renderListReading?: (reading: { done: number; total: number }) => ReactNode
  /** Ask "Submit this form?" first. Default true. */
  confirmSubmit?: boolean
  /** Extra classes on the root. It fills its container's height (`h-full`) by default: give the container a height. */
  className?: string
  /** Zoom steps of the − / + buttons. Default [0.5, 0.75, 1, 1.25, 1.5, 2]. */
  zoomSteps?: readonly number[]
  /** Questions per "Show more" step in the list view. Default 100. */
  listPageSize?: number
  /** How the list view shows more questions: a "Show more" button (default) or infinite scroll. */
  listLoadMore?: 'button' | 'scroll'
  /** Your classes on the list view's document (its paper). It fills the width by default. */
  listPaperClassName?: string
  /**
   * true (default): the toolbar stays on top while the page or answers scroll.
   * false: it scrolls away with the content.
   */
  stickyToolbar?: boolean
  /**
   * Your own things next to a field (React only): an icon, a button, a status. Drawn on the box's bottom-right corner (with the follow-up and comment badges), on
   * the page and in the list.
   */
  renderFieldExtras?: (field: FieldDef, ctx: { answers: Answers; readOnly: boolean }) => ReactNode
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
  renderListReading,
  confirmSubmit: askFirst = true,
  className = 'h-full',
  zoomSteps,
  listPageSize,
  listLoadMore,
  listPaperClassName,
  stickyToolbar = true,
  renderFieldExtras,
  ...options
}: FormFillerProps) {
  const shows = (p: FillerPart) => !hide.includes(p)
  const ff = useFormFiller(options)
  const L = useLabels(options.labels)
  const { readOnly = false, onSave } = options
  const fields = ff.fields // with the table rows the person added
  const layout: Layout | null = options.layout ?? null
  const { answers, states, errors } = ff
  const pdfWidth = ff.pdfSizes.length ? Math.max(...ff.pdfSizes.map((p) => p.width)) : 595
  const { zoom, setZoom, ref: fitRef } = useFitZoom(Math.max(...(layout?.pages.map((p) => p.width) ?? [pdfWidth])), zoomSteps)
  const compact = useCompact()
  // Each page's size (points) and how long answers grow it: the page moves down under them, as in the PDF.
  const pageSizes = useMemo(
    () => (layout ? layout.pages.map((p) => (p.source ? (ff.pdfSizes[p.source - 1] ?? p) : p)) : ff.pdfSizes),
    [layout, ff.pdfSizes],
  )
  // With the page's text (read once something grows), the room under a growing box is made from a line with no
  // text beside the box, so that text is not smeared.
  const { pageLines } = ff
  const growth = useMemo(
    () =>
      pageSizes.map((size, i) =>
        pageGrowth(fields, answers, i + 1, size, widthOf, (f) => !!states[f.key]?.visible, pageLines(i + 1) ?? [], ff.isPhoto),
      ),
    [pageSizes, fields, answers, states, pageLines, ff.isPhoto],
  )
  const grows = growth.some((g) => g.cuts.length)
  useEffect(() => {
    if (grows) ff.loadPageText()
  }, [grows, ff.loadPageText])
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [commentsOf, setCommentsOf] = useState<FieldDef | null>(null)
  const [loadError, setLoadError] = useState('')
  // Document = the PDF with the controls on it; List = the same answers as questions, with search and filters.
  const [view, setView] = useState<'document' | 'list'>(views[0] ?? 'document')
  const { loadPageText } = ff
  useEffect(() => {
    if (view === 'list') loadPageText()
  }, [view, loadPageText])

  if (loadError) return <p className="fl-root p-6 text-center text-sm text-danger">{loadError}</p>

  // One field's answer control, with the required star. `sheet`: typed in a full-size dialog (phones, on the
  // document, whose boxes are too small to type in); the list and dialogs draw full-size boxes, typed in place.
  const inPlace = (f: FieldDef) => control(f, false)
  const control = (f: FieldDef, sheet = compact) => (
    <>
      <AnswerControl
        components={components}
        field={f}
        value={answers[f.key]}
        readOnly={readOnly || states[f.key].readOnly || (f.type === 'file' && !ff.canUpload)}
        compact={sheet}
        error={errors[f.key]}
        onChange={(v) => ff.change(f, v)}
        fileName={ff.fileOf(answers[f.key])?.fileName}
        files={f.multiple ? ff.filesOf(answers[f.key]) : undefined}
        onRemoveFile={(id) => ff.removeFile(f, id)}
        signatureSrc={ff.signatureSrc(f)}
        photos={ff.photosOf(f)}
        isPhoto={ff.isPhoto}
        photosPerRow={perRowOf(f, answers)}
        onPhotosPerRow={(n) => ff.setPhotosPerRow(f, n)}
        onFile={ff.canUpload ? (file) => void ff.attach(f, file) : undefined}
        onOpenFile={(id) => ff.openFile(id ?? String(answers[f.key]))}
      />
      {states[f.key].required && !readOnly && shows('requiredMark') && (
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 text-[12px] font-bold text-danger">*</span>
      )}
      {badges(f)}
    </>
  )

  // Repeatable table rows on a page: "+ Add row" under the last row, and an ✕ at the end of each added row.
  function rowButtons(page: number, H: number, topOf: (f: FieldDef) => number, place: (d: number) => number, px: number) {
    const out: ReactNode[] = []
    const ids = [...new Set(fields.filter((f) => f.position.page === page && f.repeat && states[f.key]?.visible).map((f) => f.repeat!.id))]
    for (const id of ids) {
      const row = fields.filter((f) => f.repeat?.id === id && states[f.key]?.visible)
      const first = row.filter((f) => !f.repeat!.row)
      const left = Math.min(...first.map((f) => f.position.x)) * 100
      const right = Math.max(...first.map((f) => f.position.x + f.position.width)) * 100
      const n = Math.max(1, ...row.map((f) => f.repeat!.row ?? 1))
      const max = first[0]?.repeat?.max
      const bottomOf = (k: number) =>
        Math.max(...row.filter((f) => (f.repeat!.row ?? 1) === k).map((f) => topOf(f) + f.position.height * H))
      const pill =
        'absolute z-10 flex items-center gap-0.5 rounded-full border border-primary/40 bg-white px-1.5 py-px text-[11px] text-primary shadow-sm hover:bg-primary-soft'
      if (!max || n < max)
        out.push(
          <button
            key={`add-${id}`}
            type="button"
            className={pill}
            style={{ left: `${left}%`, top: place(bottomOf(n)) * px + 3 }}
            onClick={() => ff.addRow(id)}
          >
            <Plus size={11} aria-hidden /> {L.addRow}
          </button>,
        )
      for (let k = 2; k <= n; k++) {
        const top = Math.min(...row.filter((f) => f.repeat!.row === k).map(topOf))
        out.push(
          <button
            key={`remove-${id}-${k}`}
            type="button"
            aria-label={L.removeRow(k)}
            title={L.removeRow(k)}
            className={`${pill} !px-0.5 -translate-y-1/2`}
            style={{ left: `calc(${right}% + 4px)`, top: place(top) * px + 6 }}
            onClick={() => ff.removeRow(id, k)}
          >
            <X size={11} aria-hidden />
          </button>,
        )
      }
    }
    return out
  }

  // Next to a field: its follow-up (once open, to reopen it), its comments, your extras.
  function badges(f: FieldDef) {
    const askedKeys = f.followUp?.fields ?? []
    const followUpOn = askedKeys.length > 0 && evaluate(f.followUp!.when, answers)
    const answered = askedKeys.filter((k) => answers[k] != null && answers[k] !== '' && answers[k] !== false).length
    const list = ff.comments[f.key] ?? []
    const extras = renderFieldExtras?.(f, { answers, readOnly })
    if (!followUpOn && !f.comments && extras == null) return null
    const chip =
      'inline-flex h-5 cursor-pointer items-center gap-0.5 rounded-full border bg-white px-1.5 text-[11px] shadow-sm'
    const asked = fields.filter((x) => askedKeys.includes(x.key))
    const hasError = asked.some((x) => errors[x.key])
    return (
      // on the box's bottom-right corner: never outside the page, so never off-screen near its edge
      <div className="absolute right-1 bottom-0 z-10 flex translate-y-1/2 items-center gap-1">
        {followUpOn && (
          <button
            type="button"
            title={L.moreAnswers(answered)}
            aria-label={L.moreAnswers(answered)}
            className={`${chip} ${hasError ? 'border-danger text-danger' : 'border-primary/50 text-primary'}`}
            onClick={() => ff.openFollowUp(f)}
          >
            <ListPlus size={12} />
            {answered || ''}
          </button>
        )}
        {f.comments && (
          <button
            type="button"
            title={L.commentsButton(list.length)}
            aria-label={L.commentsButton(list.length)}
            className={`${chip} ${list.length ? 'border-folder text-ink-2' : 'border-line-strong text-muted'}`}
            onClick={() => setCommentsOf(f)}
          >
            <MessageSquare size={12} />
            {list.length || ''}
          </button>
        )}
        {extras}
      </div>
    )
  }

  return (
    <FormliftProvider components={components} labels={options.labels}>
      <div
        className={`fl-root flex min-h-[min(600px,100dvh)] flex-col bg-white text-ink ${stickyToolbar ? '' : 'overflow-auto'} ${className}`}
      >
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-white px-4 py-2.5 max-sm:px-3 max-sm:py-2 ${stickyToolbar ? 'sticky top-0 z-20' : ''}`}
        >
          {onBack && shows('back') && (
            <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
              {L.back}
            </Button>
          )}
          {title != null && shows('title') && (
            <h2 className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold max-sm:text-[15px] sm:flex-none">
              {title}
            </h2>
          )}
          {views.length > 1 && shows('views') && (
            <SegmentedTabs
              options={views.map((v) => ({ value: v, label: v === 'document' ? L.documentView : L.listView }))}
              value={view}
              onChange={setView}
            />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end">
            {view === 'document' && shows('zoom') && (
              // phones pinch-zoom and fit the page to the width already
              <div className="max-sm:hidden">
                <ZoomControls zoom={zoom} onChange={setZoom} steps={zoomSteps} />
              </div>
            )}
            {!readOnly && onSave && (
              <>
                {shows('saveStatus') && (
                  <span className="text-right text-[12px] text-muted sm:w-24" aria-live="polite">
                    {
                      {
                        saved: ff.hasSaved ? L.draftSaved : '',
                        dirty: L.unsaved,
                        saving: L.saving,
                        error: L.notSaved,
                      }[ff.saveState]
                    }
                  </span>
                )}
                {shows('saveDraft') && (
                  <Button variant="secondary" size="sm" icon={Save} title={L.saveDraft} onClick={() => void ff.save()}>
                    <span className="max-sm:hidden">{L.saveDraft}</span>
                  </Button>
                )}
                {shows('submit') && (
                  <Button size="sm" icon={Send} onClick={() => (askFirst ? setConfirmSubmit(true) : void ff.submit())}>
                    {L.submit}
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
              <Paperclip size={13} /> {L.attachments}
            </span>
            {ff.attachments.map((x) => (
              <button
                key={x.id}
                type="button"
                title={L.download(x.fileName)}
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
                {L.errorOnPage(f.position.page, errors[f.key])}
              </li>
            ))}
          </ul>
        )}
        {view === 'list' && (
          <div className={`bg-hover ${stickyToolbar ? 'flex-1 overflow-auto' : 'flex-none'}`}>
            <QuestionList
              questions={ff.questions}
              segments={ff.segments}
              pdf={ff.pdf}
              reading={ff.reading}
              answers={answers}
              control={inPlace}
              filters={listFilters}
              search={listSearch}
              hideUnavailable={hideUnavailableFilters}
              renderToolbar={renderFilters}
              renderReading={renderListReading}
              pageSize={listPageSize}
              loadMore={listLoadMore}
              paperClassName={listPaperClassName}
            />
          </div>
        )}
        {/* Kept mounted while the list shows (scroll position, loaded document); hidden, its pages free their canvases and are drawn again on return. */}
        <div
          ref={fitRef}
          className={`bg-hover ${stickyToolbar ? 'flex-1 overflow-auto' : 'flex-none'} ${view === 'list' ? 'hidden' : ''}`}
        >
          <PdfPages
            load={pdfSource}
            zoom={zoom}
            pages={layout?.pages}
            onLoaded={ff.onPdfLoaded}
            onError={() => setLoadError(L.documentLoadError)}
            grow={(page) => growth[page - 1]}
            overlay={(page) => {
              const H = pageSizes[page - 1]?.height ?? 842
              const g = growth[page - 1]
              const px = BASE_SCALE * zoom
              // A point of the page with its added rows (from its top) on screen: moved down by answers above it,
              // onto the next page (past its margins and the gap) where the grown page breaks.
              const grown = !!g && (g.cuts.length > 0 || g.rows.length > 0)
              const place = (d: number) => (grown ? onSheets(movedDown(d, g.cuts), g.sheets, H, PAGE_GAP / px) : d)
              const shift = (from: number, d: number) => {
                const dy = (place(d) - from) * px
                return dy ? { transform: `translateY(${dy}px)` } : {}
              }
              const down = (y: number) => shift(y * H, g ? g.toRows(y * H) : y * H)
              const topOf = (f: FieldDef) => (g ? g.top(f) : f.position.y * H)
              return [
                // The admin's text / boxes / lines first, the answer controls on top.
                ...(layout?.elements ?? [])
                  .filter((el) => el.page === page)
                  .map((el) => (
                    <LayoutElementView
                      key={el.id}
                      element={el}
                      pageHeight={layout!.pages[page - 1]?.height ?? 842}
                      style={down(el.position.y)}
                    />
                  )),
                ...fields
                  .filter((f) => f.position.page === page && !f.dialogOnly && states[f.key]?.visible)
                  .map((f) => {
                    const extra = growth[page - 1]?.boxes.get(f.key)?.extra ?? 0
                    const p = f.position
                    // A textarea's text as the PDF prints it (size, face, line height), so what fits shows here.
                    const face = { '--fl-font': 'Helvetica, Arial, sans-serif' }
                    const print =
                      f.type === 'textarea'
                        ? { ...face, '--fl-text': `${textSize(p.height * H) * px}px`, '--fl-lh': '1.2' }
                        : f.type === 'text'
                          ? extra > 0
                            ? { ...face, '--fl-text': `${textSize(p.height * H, true) * px}px`, '--fl-lh': '1.2' }
                            : { '--fl-lh': `${p.height * H * px - 2}px` } // one line, centred in its box
                          : f.type === 'file' && f.multiple
                            ? { '--fl-row': `${p.height * H * px}px` } // several files: a row per box height, as printed
                            : {}
                    // Across a page break: a window on each page showing its part of the box.
                    const start = g ? movedDown(topOf(f), g.cuts) : 0
                    const end = start + p.height * H + extra
                    const parts = extra
                      ? g!.sheets
                          .map((s) => [Math.max(start, s.from), Math.min(end, s.to)])
                          .filter(([a, z]) => z > a)
                      : []
                    if (parts.length > 1)
                      return (
                        <SplitBox
                          key={f.id}
                          left={`${p.x * 100}%`}
                          width={`${p.width * 100}%`}
                          height={(end - start) * px}
                          style={print as CSSProperties}
                          windows={parts.map(([a, z]) => ({
                            top: onSheets(a, g!.sheets, H, PAGE_GAP / px) * px,
                            height: (z - a) * px,
                            scroll: (a - start) * px,
                          }))}
                        >
                          {control(f)}
                        </SplitBox>
                      )
                    return (
                      <div
                        key={f.id}
                        className="absolute [container-type:size]"
                        style={{ ...boxStyle(p), height: `${(p.height + extra / H) * 100}%`, ...shift(p.y * H, topOf(f)), ...print }}
                      >
                        {control(f)}
                      </div>
                    )
                  }),
                ...(readOnly ? [] : rowButtons(page, H, topOf, place, px)),
              ]
            }}
          />
        </div>
        {ff.dialog && (
          <FieldDialog
            title={ff.dialog.title}
            fields={ff.dialog.keys
              .map((k) => fields.find((x) => x.key === k))
              .filter((x): x is FieldDef => !!x && !!states[x.key]?.visible)}
            control={inPlace}
            errors={errors}
            onClose={ff.closeDialog}
          />
        )}
        {commentsOf && (
          <CommentsDialog
            field={commentsOf}
            comments={ff.comments[commentsOf.key] ?? []}
            readOnly={readOnly}
            onAdd={(text) => ff.addComment(commentsOf, text)}
            onRemove={(id) => ff.removeComment(commentsOf, id)}
            onClose={() => setCommentsOf(null)}
          />
        )}
        {confirmSubmit && (
          <ConfirmModal
            confirmLabel={L.submit}
            onConfirm={() => {
              setConfirmSubmit(false)
              void ff.submit()
            }}
            onCancel={() => setConfirmSubmit(false)}
          >
            {L.confirmSubmit}
          </ConfirmModal>
        )}
      </div>
    </FormliftProvider>
  )
}
