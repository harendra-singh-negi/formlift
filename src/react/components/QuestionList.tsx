import { Search, SlidersHorizontal } from 'lucide-react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuestionFilter, type QuestionFilterState, type UseQuestionFilterOptions } from '../hooks/useQuestionFilter'
import { Button, Chip, ChipGroup, RemovableChip, EmptyText, Popover } from '../ui/slots'
import type { Answers, FieldDef, FieldType } from '../../core/form-logic'
import type { FlowBlock, FlowCell, FlowImage, FlowPara, FlowRun, FlowSegment } from '../../core/flow'
import type { Question } from '../../core/questions'
import { useLabels } from '../labels'

const PAGE = 100

// Box for a control in the list (controls size their text to the box, as on the page).
/** A field control's box outside the page (list view, dialogs): controls size themselves to it. */
export const SIZE: Partial<Record<FieldType, string>> = {
  checkbox: 'h-7 w-7 lg:h-8 lg:w-8',
  textarea: 'h-20 w-full',
  signature: 'h-16 w-56',
  file: 'h-9 w-full sm:w-72',
  radio: 'h-9 w-full',
  checklist: 'h-24 w-full',
  toggle: 'h-9 w-32',
  rating: 'h-9 w-48',
  time: 'h-9 w-40',
}
/**
 * The form as its document, reflowed: the PDF's text with its look, its tables, pictures and the answer controls
 * where they sit (useFormFiller's `segments`), with search and filters. Unfiltered it is the whole document; a
 * filter or search shows the stretch of each matching question, with all of its text. `control(field)` draws a
 * field's answer control, `pdf` the pictures. Filters come from useQuestionFilter: `filters` / `search` choose
 * them, `filter` drives the list from your own useQuestionFilter, `renderToolbar` draws your own bar,
 * `toolbar={false}` none. Filters with nothing to offer in this form are left out unless `hideUnavailable={false}`.
 */
export default function QuestionList({
  questions,
  segments,
  answers,
  control,
  pdf,
  reading,
  filter: external,
  filters,
  search,
  hideUnavailable = true,
  toolbar = true,
  renderToolbar,
  renderReading,
  pageSize = PAGE,
  loadMore = 'button',
  paperClassName = '',
}: {
  questions: Question[]
  /** The document's flow, cut where questions end (useFormFiller's `segments`). */
  segments: FlowSegment[]
  answers: Answers
  control: (f: FieldDef) => ReactNode
  /** The open PDF: pictures are cut from its pages. */
  pdf?: PDFDocumentProxy | null
  /** While the PDF is read: pages read so far (useFormFiller's `reading`). */
  reading?: { done: number; total: number } | null
  filter?: QuestionFilterState
  filters?: UseQuestionFilterOptions['filters']
  search?: boolean
  hideUnavailable?: boolean
  toolbar?: boolean
  renderToolbar?: (fs: QuestionFilterState) => ReactNode
  /** Your own loader while the PDF is read. Default: the `readingDocument` text. */
  renderReading?: (reading: { done: number; total: number }) => ReactNode
  /** Questions shown at first and added by "Show more". Default 100. */
  pageSize?: number
  /** How more questions come: a "Show more" button (default), or by themselves as the end scrolls into view. */
  loadMore?: 'button' | 'scroll'
  /** Your classes on the document's paper, e.g. `max-w-5xl mx-auto` for a narrower page. Default: full width. */
  paperClassName?: string
}) {
  const L = useLabels()
  const own = useQuestionFilter(questions, answers, { filters, search })
  const fs = external ?? own
  const { list } = fs
  const [shown, setShown] = useState(pageSize)
  useEffect(() => setShown(pageSize), [fs.version, pageSize])
  // Controls for the fields that show (conditions), in the stretches of the questions that match.
  const live = useMemo(() => new Set(questions.flatMap((q) => q.parts.map((p) => p.field.id))), [questions])
  const matching = useMemo(() => new Set(list.map((q) => q.id)), [list])
  const stretches = fs.active ? segments.filter((s) => s.questions.some((id) => matching.has(id))) : segments
  const page: FlowSegment[] = []
  let count = 0
  for (const s of stretches) {
    if (count >= shown && s.questions.length) break
    page.push(s)
    count += s.questions.filter((id) => matching.has(id)).length
  }
  const field = (x: FieldPart, inCell: boolean, fill?: Fill) =>
    live.has(x.field.id) ? <Control x={x} inCell={inCell} fill={fill} control={control} /> : null
  const picture = (x: ImagePart) => <Picture x={x} pdf={pdf} />
  let lastPage = 0
  const groups = fs.groups.filter((g) => g.available || !hideUnavailable)
  const bar = groups.filter((g) => g.section === 'bar')
  const menu = groups.filter((g) => g.section !== 'bar')
  const sections = [...new Set(menu.map((g) => g.section ?? ''))]

  return (
    <div className="w-full p-3 sm:p-4 lg:px-6">
      {renderToolbar
        ? renderToolbar(fs)
        : toolbar && (
            <div className="sticky top-0 z-10 -mx-3 mb-3 flex flex-col gap-2 border-b border-line bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
              <div className="flex flex-wrap items-center gap-2">
                {fs.search != null && (
                  <label className="relative min-w-0 flex-1 basis-full sm:basis-72">
                    <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      aria-label={L.searchQuestions}
                      placeholder={L.searchPlaceholder}
                      value={fs.search}
                      onChange={(e) => fs.setSearch(e.target.value)}
                      className="w-full rounded-full border border-line-strong bg-surface py-1.5 pr-3 pl-9 text-[13px] outline-none focus:border-primary focus:bg-white max-sm:text-base"
                    />
                  </label>
                )}
                {menu.length > 0 && (
                  <Popover label={L.filters} icon={SlidersHorizontal} badge={fs.inUse.length} align="right">
                    <div className="flex flex-col gap-4">
                      {sections.map((sec) => (
                        <FilterSection key={sec} title={sec}>
                          {menu
                            .filter((g) => (g.section ?? '') === sec)
                            .map((g) => (
                              <ChipGroup
                                key={g.id}
                                title={g.title}
                                value={g.value}
                                onChange={g.set}
                                options={g.options}
                              />
                            ))}
                        </FilterSection>
                      ))}
                    </div>
                  </Popover>
                )}
                <span className="text-[12.5px] text-muted sm:ml-auto" aria-live="polite">
                  {L.questionsCount(list.length, fs.total)
                    .split(String(list.length))
                    .map((part, i) => (
                      <Fragment key={i}>
                        {i > 0 && <b className="font-semibold text-ink-2">{list.length}</b>}
                        {part}
                      </Fragment>
                    ))}
                </span>
                {fs.active && (
                  <Button variant="secondary" size="sm" onClick={fs.clear}>
                    {L.clearAll}
                  </Button>
                )}
              </div>
              {bar.map((g) => (
                <div key={g.id} role="group" aria-label={g.title} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{g.title}</span>
                  <Chip label={L.all} count={fs.total} active={g.value == null} onClick={() => g.set(null)} />
                  {g.options.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      count={o.count}
                      active={g.value === o.value}
                      onClick={() => g.set(g.value === o.value ? null : o.value)}
                    />
                  ))}
                </div>
              ))}
              {fs.inUse.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {fs.inUse.map((f) => (
                    <RemovableChip key={f.id} label={f.label} onRemove={f.clear} />
                  ))}
                </div>
              )}
            </div>
          )}

      {reading ? (
        renderReading ? (
          renderReading(reading)
        ) : (
          <EmptyText>{L.readingDocument(reading.done, reading.total)}</EmptyText>
        )
      ) : (
        fs.active && page.length === 0 && <EmptyText>{L.noQuestionMatches}</EmptyText>
      )}
      {!reading && page.length > 0 && (
        // The document on its paper: as wide as a page reads well, cells stacked on a narrow screen (@container).
        <ul className={`@container my-0 list-none rounded-md bg-white p-3 text-[14px] leading-snug text-ink shadow-[0_1px_6px_rgba(15,23,42,0.14)] sm:p-5 lg:text-[15px] ${paperClassName}`}>
          {page.map((s) => (
            <li
              key={`${s.blocks[0].page}:${s.blocks[0].y}`}
              className={fs.active ? 'border-t-8 border-hover pt-3 not-first:mt-3 first:border-t-0 first:pt-0' : ''}
            >
              {s.blocks.map((b, j) => {
                // The page each stretch of the document comes from, where it starts.
                const mark = b.page !== lastPage
                lastPage = b.page
                return (
                  <Fragment key={j}>
                    {mark && (
                      <div className="mt-2 mb-1 text-right text-[11px] text-faint first:mt-0">{L.pageTag(b.page)}</div>
                    )}
                    <Block b={b} field={field} picture={picture} />
                  </Fragment>
                )
              })}
            </li>
          ))}
        </ul>
      )}
      {!reading && list.length > count && loadMore === 'scroll' && (
        <More onSeen={() => setShown((n) => n + pageSize)} />
      )}
      {!reading && list.length > count && loadMore === 'button' && (
        <div className="mt-3 text-center">
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + pageSize)}>
            {L.showMore(list.length - count)}
          </Button>
        </div>
      )}
    </div>
  )
}

/** The end of the list: shows more questions when it scrolls into view (infinite scroll). */
function More({ onSeen }: { onSeen: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useRef(onSeen)
  seen.current = onSeen
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && seen.current())
    io.observe(el)
    return () => io.disconnect()
  })
  return <div ref={ref} aria-hidden className="h-px" />
}

type FieldPart = { field: FieldDef; w: number; h: number; caption?: boolean }
type ImagePart = { image: FlowImage; w: number; h: number }
type Fill = boolean | 'always'
type Draw = { field: (x: FieldPart, inCell: boolean, fill?: Fill) => ReactNode; picture: (x: ImagePart) => ReactNode }

/**
 * A table row (cells side by side, one under another on a narrow screen), a line of the page (its text and fields
 * at their places, wrapping like words on a narrow screen) or a stretch of free text.
 */
function Block({ b, ...draw }: { b: FlowBlock } & Draw) {
  if (b.cells && b.line) {
    const parts = (c: FlowCell) => c.paras.flatMap((p) => p.parts)
    const fields = b.cells.some((c) => parts(c).some((x) => 'field' in x))
    // On a narrow screen a field takes the rest of its label's line (a wide one a line of its own), or goes under it.
    const growOf = (c: FlowCell) => {
      const f = parts(c).find((x) => 'field' in x)?.field
      return parts(c).some((x) => 'text' in x) || !f ? '' : isWide(f) ? 'basis-full' : FIXED.includes(f.type) ? '' : 'flex-[1_1_10em]'
    }
    const cell = (c: FlowCell, i: number) => {
      const text = parts(c).some((x) => 'text' in x)
      const grow = growOf(c)
      return (
        <div
          key={i}
          // Text keeps its words whole, a field gives way when the line is short of room.
          className={`max-w-full @min-[40rem]:ml-(--o) @min-[40rem]:w-(--w) @min-[40rem]:flex-initial ${text ? '' : 'min-w-0'} ${grow}`}
          style={{ '--w': `${c.width}%`, '--o': `${c.offset}%` } as CSSProperties}
        >
          {c.paras.map((p, k) => (
            <Para key={k} p={p} inCell fill={grow.startsWith('flex') ? 'always' : true} {...draw} />
          ))}
        </div>
      )
    }
    // A label and the fields after it stay together: one line each on a narrow screen ("SITE: ___", then "ID: ___"),
    // side by side as on the page on a wide one (`contents`). A line of text only wraps like words.
    const groups: { c: FlowCell; i: number }[][] = []
    b.cells.forEach((c, i) => {
      if (!fields || !groups.length || parts(c).some((x) => 'text' in x)) groups.push([])
      groups.at(-1)!.push({ c, i })
    })
    return (
      <div
        className={`flex flex-wrap gap-x-2 gap-y-1 @min-[40rem]:flex-nowrap @min-[40rem]:gap-0 ${fields ? 'items-center' : 'items-baseline'} ${b.gap ? 'mt-3' : 'mt-0.5'}`}
      >
        {fields
          ? groups.map((g) => (
              // A line of its own when its field stretches; "Verified ☐  N/A ☐" stay side by side.
              <div
                key={g[0].i}
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 @min-[40rem]:contents ${g.some(({ c }) => growOf(c)) ? 'w-full' : ''}`}
              >
                {g.map(({ c, i }) => cell(c, i))}
              </div>
            ))
          : b.cells.map(cell)}
      </div>
    )
  }
  if (b.cells)
    return (
      // One under another on a narrow screen, a row's cells kept together by a gap after it.
      <div className={`flex @max-[40rem]:mb-1.5 @max-[40rem]:block ${b.gap ? 'mt-3' : ''}`}>
        {b.cells.map((c, i) => (
          <div
            key={i}
            className="ml-(--o) w-(--w) min-w-0 space-y-0.5 px-2 py-1 shadow-[inset_0_0_0_0.5px_var(--fl-ink-3)] @max-[40rem]:ml-0 @max-[40rem]:w-auto @max-[40rem]:empty:hidden"
            style={{ '--w': `${c.width}%`, '--o': `${c.offset}%`, background: c.fill } as CSSProperties}
          >
            {c.paras.map((p, k) => (
              // A field alone in its cell is the cell's answer box: as wide as the cell on a wide screen.
              <Para key={k} p={p} inCell fill={c.paras.flatMap((q) => q.parts).length === 1} {...draw} />
            ))}
          </div>
        ))}
      </div>
    )
  return (
    <div className={`space-y-0.5 ${b.gap ? 'mt-3' : 'mt-0.5'}`}>
      {b.paras!.map((p, k) => (
        <Para key={k} p={p} inCell={false} {...draw} />
      ))}
    </div>
  )
}

function Para({ p, inCell, fill, field, picture }: { p: FlowPara; inCell: boolean; fill?: Fill } & Draw) {
  // A paragraph with a full-width control takes the whole line (also beside others on a line of the page).
  const full = p.parts.some((x) => 'field' in x && isWide(x.field))
  return (
    <div
      className={`max-w-full break-words ${full ? 'w-full' : ''} ${p.align === 'center' ? 'text-center' : p.align === 'right' ? '@min-[40rem]:text-right' : ''}`}
      style={p.size !== 1 ? { fontSize: `${p.size}em` } : undefined}
    >
      {/* A space before a control or picture: on a narrow screen it may go to the next line. */}
      {p.parts.map((x, i) => (
        <Fragment key={i}>
          {'text' in x ? <Run r={x} /> : <>{i > 0 && ' '}{'field' in x ? field(x, inCell, fill) : picture(x)}</>}
        </Fragment>
      ))}
    </div>
  )
}

const FAMILY = { serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, Menlo, Consolas, monospace' }
function Run({ r }: { r: FlowRun }) {
  const style: CSSProperties = {}
  if (r.bold) style.fontWeight = 700
  if (r.italic) style.fontStyle = 'italic'
  if (r.underline) style.textDecoration = 'underline'
  if (r.font) style.fontFamily = FAMILY[r.font]
  if (r.color) style.color = r.color
  if (r.bg) style.background = r.bg
  if (r.size) style.fontSize = `${r.size}em`
  return Object.keys(style).length ? <span style={style}>{r.text}</span> : <>{r.text}</>
}

/**
 * A field's answer control in the text: as wide as its box on the page (in the text's ems), within the screen;
 * full width for the wide types; with `fill` (a line laid out as on the page), as wide as its place there on a
 * wide screen. Its label shows when nothing on the page names it (in a table cell or on such a line only on a
 * narrow screen, where it has left its column header).
 */
const isWide = (f: FieldDef) => !!SIZE[f.type]?.includes('w-full')
// Widest text these show, in ems: a date's "dd / mm / yyyy" with its calendar button.
const MIN_EM: Partial<Record<FieldType, number>> = { date: 10, datetime: 14 }
// Controls that keep their own size, never stretched to their place.
const FIXED: FieldType[] = ['checkbox', 'toggle', 'rating']
function Control({
  x,
  inCell,
  fill,
  control,
}: {
  x: FieldPart
  inCell: boolean
  /** As wide as its place on the page on a wide screen; 'always': as wide as its place on any screen. */
  fill?: Fill
  control: (f: FieldDef) => ReactNode
}) {
  const { field: f, w, h, caption } = x
  const size = f.type === 'checkbox' ? 'h-6 w-6 lg:h-7 lg:w-7' : (SIZE[f.type] ?? 'h-9 lg:h-10')
  const wide = isWide(f)
  const fit = fill && !wide && !FIXED.includes(f.type)
  // Full class names (Tailwind finds them in this file).
  const [row, full] = !fit ? ['', ''] : fill === 'always' ? ['flex!', 'w-full!'] : ['@min-[40rem]:flex', '@min-[40rem]:w-full!']
  const style: CSSProperties | undefined =
    f.type === 'textarea'
      ? { height: `${Math.min(16, Math.max(4, h)).toFixed(1)}em` }
      : SIZE[f.type] || f.type === 'checkbox'
        ? undefined
        : { width: `${Math.min(40, Math.max(MIN_EM[f.type] ?? 8, w)).toFixed(1)}em` }
  return (
    // The label over a wide control, beside a small one (going under it when the line is too short).
    <span
      className={`${wide ? 'flex w-full flex-col gap-1' : `inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 ${row}`} my-0.5 align-middle`}
    >
      {caption && <span className={`text-[12px] text-muted ${inCell ? '@min-[40rem]:hidden' : ''}`}>{f.label}</span>}
      {/* As wide as on the page, narrower when the line is shorter (a box stays its size). Typed in place: 16 px text, as iOS zooms into a smaller input it focuses. */}
      <span
        className={`relative inline-block max-w-full min-w-0 [container-type:size] [&_:is(input,textarea,select)]:text-[16px] ${size} ${wide || f.type === 'checkbox' ? 'flex-none' : 'shrink'} ${full}`}
        style={style}
      >
        {control(f)}
      </span>
    </span>
  )
}

// pdf.js paints text (fillText, or glyph outlines with fill), lines, fills and the white page with these; pictures
// with drawImage. Without them only the pictures are drawn: the text and table around a picture (which can lie
// inside its box) are in the flow already, and its transparent parts show the cell it sits in.
const PAINT = new Set(['fillText', 'strokeText', 'fill', 'stroke', 'fillRect', 'strokeRect'])
// A canvas that hands pdf.js (which takes its context from the canvas) a context drawing pictures only.
function picturesOnly(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = canvas.getContext('2d') // with alpha: transparent wherever no picture is drawn
  if (!ctx) return null
  const real = (target: object, key: string | symbol) => {
    const v = Reflect.get(target, key, target)
    return typeof v === 'function' ? v.bind(target) : v
  }
  const only = new Proxy(ctx, {
    get: (target, key) => (typeof key === 'string' && PAINT.has(key) ? () => {} : real(target, key)),
    set: (target, key, v) => Reflect.set(target, key, v, target),
  })
  return new Proxy(canvas, {
    get: (target, key) => (key === 'getContext' ? () => only : real(target, key)),
    set: (target, key, v) => Reflect.set(target, key, v, target),
  })
}

/**
 * A picture of the document, drawn by pdf.js from its page when it comes near the screen (pictures only), as
 * large as on the page next to the text.
 */
function Picture({ x, pdf }: { x: ImagePart; pdf?: PDFDocumentProxy | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  // Its size in ems once its transparent margins are cut off (0: nothing visible).
  const [seen, setSeen] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return setNear(true)
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!near || !pdf || !el) return
    let task: RenderTask | null = null
    let live = true
    const { source, x: left, y: top, width, height } = x.image
    void pdf.getPage(source).then((page) => {
      if (!live) return
      const full = page.getViewport({ scale: 1 })
      // Sharp at its size on screen (about 16 px an em, on a high-density screen too), at most 4× the page.
      const ratio = Math.max(1.5, window.devicePixelRatio || 1)
      const scale = Math.min(4, Math.max(1, (x.w * 16 * ratio) / (width * full.width)))
      el.width = Math.max(1, Math.round(width * full.width * scale))
      el.height = Math.max(1, Math.round(height * full.height * scale))
      // The whole page drawn shifted so the picture's corner is the canvas's; the rest falls outside it.
      const viewport = page.getViewport({
        scale,
        offsetX: -left * full.width * scale,
        offsetY: -top * full.height * scale,
      })
      const canvas = picturesOnly(el)
      if (!canvas) return
      task = page.render({ canvas, viewport })
      task.promise.then(() => live && setSeen(trim(el, x)), () => {})
    })
    return () => {
      live = false
      task?.cancel()
    }
  }, [near, pdf, x])
  const { w, h } = seen ?? x
  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`max-w-full align-middle ${w ? 'inline-block' : 'hidden'}`}
      style={{ width: `${w}em`, aspectRatio: `${w} / ${h}` }}
    />
  )
}

// Cuts a drawn picture down to its visible pixels (a picture's box often has transparent margins, lying over the
// text around it); its size in ems follows. null: nothing to cut.
function trim(el: HTMLCanvasElement, x: ImagePart) {
  const ctx = el.getContext('2d')
  const { width: W, height: H } = el
  if (!ctx || !W || !H) return null
  const { data } = ctx.getImageData(0, 0, W, H)
  let [x0, y0, x1, y1] = [W, H, -1, -1]
  for (let y = 0; y < H; y++)
    for (let i = 0; i < W; i++)
      if (data[(y * W + i) * 4 + 3] > 8) {
        if (i < x0) x0 = i
        if (i > x1) x1 = i
        if (y < y0) y0 = y
        y1 = y
      }
  if (x1 < 0) return { w: 0, h: 0 }
  const [cw, ch] = [x1 - x0 + 1, y1 - y0 + 1]
  if (cw * ch > 0.9 * W * H) return null
  const part = ctx.getImageData(x0, y0, cw, ch)
  el.width = cw
  el.height = ch
  ctx.putImageData(part, 0, 0)
  return { w: (x.w * cw) / W, h: (x.h * ch) / H }
}

/** A titled block of filters in the Filters panel. */
function FilterSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-line-soft pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 text-[13px] font-semibold text-ink">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}
