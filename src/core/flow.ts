// The document as a flow, for the list view: each page's text with its look (bold, italic, underline, colour,
// highlight, size), its tables (ruled cells and shaded bars, with their fill), its pictures and the form's fields
// where they sit, in reading order. Drawn as plain HTML it reads like the PDF and reflows on any screen.
// Everything comes from pdf.js (getTextContent, and the operator list through extractShapes): no AI, no server.
import { tableCells, type Shapes } from './detect'
import type { FieldDef, LayoutElement } from './form-logic'
import type { PdfTextItem } from './layout'
import type { Question } from './questions'

/** Text with its look. Colours are #rrggbb; left out = the text's normal ink, no highlight. */
export interface FlowRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  font?: 'serif' | 'mono'
  color?: string
  /** Highlight behind the text. */
  bg?: string
  /** Size relative to its paragraph, when it differs. */
  size?: number
}

/** A picture: its box on its original PDF page (`source`), in page fractions, to cut from the drawn page. */
export interface FlowImage {
  source: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * A piece of a paragraph: text, a field's answer control, or a picture. `w` / `h` are its size on the page in ems
 * of the page's body text, so it keeps its size next to the text. `caption`: nothing written on the page around it
 * names the field (a scanned page, an empty table cell): show its label with it.
 */
export type FlowPart =
  | FlowRun
  | { field: FieldDef; w: number; h: number; caption?: boolean }
  | { image: FlowImage; w: number; h: number }

export interface FlowPara {
  parts: FlowPart[]
  /** Text size relative to the page's body text. */
  size: number
  align?: 'center' | 'right'
}

/**
 * A cell of a table row or a shaded bar, or a thing on a line (`FlowBlock.line`): its width and its gap from the
 * one before, in % of the page's content.
 */
export interface FlowCell {
  width: number
  offset: number
  fill?: string
  paras: FlowPara[]
}

export interface FlowBlock {
  /** The form's page (as in field positions). */
  page: number
  /** Top and bottom on the page, page fractions. */
  y: number
  bottom: number
  /** Space above it on the page. */
  gap?: boolean
  /** A table row: cells side by side (one under another on a narrow screen)… */
  cells?: FlowCell[]
  /**
   * …or with `line`, a line of the page without rules: its text and fields side by side, each at its place
   * ("SHIP: ___   GT: ___", a row of answer lines under column names); on a narrow screen they wrap like words…
   */
  line?: boolean
  /** …or free text: paragraphs one under another. */
  paras?: FlowPara[]
}

/** A PDF page read for the flow, in points from its top left (readPage). The same for every form using the page. */
export interface PageRead {
  width: number
  height: number
  /** Text with its look; `base` = baseline, `pt` = font size. */
  items: { run: FlowRun; x: number; w: number; base: number; pt: number }[]
  /** Ruled table cells and shaded bars, with their fill. */
  boxes: { x0: number; y0: number; x1: number; y1: number; fill?: string }[]
  /** Pictures. */
  images: { x: number; y: number; w: number; h: number }[]
}

/** A stretch of the flow and the questions answered in it: what the list shows for one entry. */
export interface FlowSegment {
  blocks: FlowBlock[]
  /** Ids of its questions. */
  questions: string[]
}

type Box = PageRead['boxes'][number]

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
// Black and near-black is the text's normal ink (drawn in the list's own colour); white is the paper.
const isInk = (hex: string) => {
  const c = rgb(hex)
  return Math.max(...c) < 0.28 && Math.max(...c) - Math.min(...c) < 0.1
}
const isPaper = (hex: string) => lum(hex) > 0.985
const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0)
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
const within = (b: Box, x: number, y: number) => x >= b.x0 - 0.5 && x <= b.x1 + 0.5 && y >= b.y0 - 0.5 && y <= b.y1 + 0.5

const BOLD = /bold|black|heavy|semibold|demi/i
const ITALIC = /italic|oblique/i
const MONO = /mono|courier|consol/i
const SERIF = /serif|times|georgia|garamond|cambria|palatino|antiqua|minion/i

/**
 * One PDF page for the flow: text items with their look, ruled cells and shaded bars with their fill, pictures.
 * `shapes` = extractShapes on the page's operator list; get the operator list first, it loads the fonts whose
 * real names (`fontOf`, as in toLines) tell bold, italic, serif and mono text.
 */
export function readPage(
  textItems: PdfTextItem[],
  shapes: Shapes,
  viewBox: number[],
  fontOf: (id: string) => string | undefined = () => undefined,
): PageRead {
  const [x0, y0, x1, y1] = viewBox
  const [width, height] = [x1 - x0, y1 - y0]
  // Each item where it sits, with the colour of each character: the drawn glyphs, matched in order
  // (getTextContent and the operator list read the page's content in the same order).
  const ink = shapes.ink ?? []
  let k = 0
  const raw: {
    it: PdfTextItem
    chars: string[]
    colors: (string | undefined)[]
    /** Where each character starts and ends along the item, 0..1 (by the glyphs' widths when known). */
    at: number[]
    x: number
    base: number
    pt: number
  }[] = []
  for (const it of textItems) {
    const chars = [...it.str]
    const colors: (string | undefined)[] = []
    const widths: number[] = []
    let cur: string | undefined
    for (const ch of chars) {
      let w = NaN
      if (ch.trim()) {
        let j = k
        while (j < ink.length && j < k + 40 && ink[j].ch !== ch) j++
        if (ink[j]?.ch === ch) [cur, w, k] = [ink[j].color, ink[j].w || NaN, j + 1]
      }
      colors.push(cur)
      widths.push(w)
    }
    // Spaces and characters not matched: the item's average width.
    const known = widths.filter((w) => w > 0)
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1
    const at = [0]
    for (const w of widths) at.push(at[at.length - 1] + (w > 0 ? w : avg))
    const total = at[at.length - 1] || 1
    if (!it.str.trim()) continue
    const [a, b, c, d, e, f] = it.transform
    const pt = Math.hypot(c, d) || Math.hypot(a, b) || 1
    let [x, base] = [e - x0, y1 - f]
    // Turned text (a column header written upwards) is read where its middle is, as a line of its own.
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) {
      const n = Math.hypot(a, b) || 1
      x += ((a / n) * it.width) / 2 - it.width / 2
      base -= ((b / n) * it.width) / 2 - 0.35 * pt
    }
    raw.push({ it, chars, colors, at: at.map((v) => v / total), x, base, pt })
  }
  const mid = (t: (typeof raw)[number]) => t.base - t.pt / 3

  // Cells take the fill drawn over (nearly) all of them. Frames around other cells are not cells.
  const shaded: Box[] = shapes.rects
    .filter((r) => r.filled && r.fill && !isPaper(r.fill) && r.w > 1 && r.h > 1)
    .map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h, fill: r.fill }))
  const ruled: Box[] = tableCells(shapes.hlines, shapes.vlines)
  const cells = ruled.filter(
    (c) => !ruled.some((o) => o !== c && area(o) < area(c) && within(c, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2)),
  )
  const fills = new Set<Box>()
  for (const c of cells) {
    const s = shaded.filter((r) => overlap(r, c) >= 0.8 * area(c)).at(-1)
    if (!s) continue
    c.fill = s.fill
    fills.add(s)
  }
  // A shaded box outside the tables holding whole lines of text is a bar or panel ("General Inspection
  // Overview"); one with text running on beside it on its line is a highlight behind some words.
  const panels: Box[] = []
  for (const s of shaded) {
    if (s.x1 - s.x0 < 20 || s.y1 - s.y0 < 8 || fills.has(s)) continue
    if (cells.some((c) => overlap(c, s) > 0.5 * Math.min(area(c), area(s)))) continue
    if (panels.some((p) => Math.abs(p.x0 - s.x0) + Math.abs(p.y0 - s.y0) + Math.abs(p.x1 - s.x1) < 2)) continue
    const line = raw.filter((t) => mid(t) > s.y0 && mid(t) < s.y1)
    const inside = line.filter((t) => t.x + t.it.width / 2 > s.x0 && t.x + t.it.width / 2 < s.x1)
    if (
      inside.length &&
      inside.length === line.length &&
      inside.every((t) => t.x >= s.x0 - 1 && t.x + t.it.width <= s.x1 + 1)
    )
      panels.push(s)
  }
  const marks = shaded.filter((s) => !fills.has(s) && !panels.includes(s))
  // Underlines: solid rules just under the baseline that are not a cell's or a bar's edge.
  const edges = [...cells, ...panels]
  const unders = shapes.hlines.filter(
    (l) =>
      !l.dashed &&
      !edges.some((c) => (Math.abs(c.y0 - l.y0) < 1.5 || Math.abs(c.y1 - l.y0) < 1.5) && l.x0 < c.x1 && l.x1 > c.x0),
  )

  // Runs: the characters of one item with the same look together.
  const items: PageRead['items'] = []
  for (const t of raw) {
    const font = (t.it.fontName && fontOf(t.it.fontName)) || ''
    const look: Omit<FlowRun, 'text'> = {}
    if (BOLD.test(font)) look.bold = true
    if (ITALIC.test(font)) look.italic = true
    if (MONO.test(font)) look.font = 'mono'
    else if (SERIF.test(font) && !/sans/i.test(font)) look.font = 'serif'
    const n = t.chars.length
    const w = t.it.width
    const styleAt = (i: number) => {
      const cx = t.x + (w * (t.at[i] + t.at[i + 1])) / 2
      const color = t.colors[i]
      return {
        color: color && !isInk(color) ? color : undefined,
        bg: marks.filter((m) => m.y1 - m.y0 <= 2.5 * t.pt && within(m, cx, mid(t))).at(-1)?.fill,
        ul: unders.some((l) => cx >= l.x0 && cx <= l.x1 && l.y0 >= t.base - 1 && l.y0 <= t.base + 0.4 * t.pt),
      }
    }
    let s = 0
    let cur = styleAt(0)
    for (let i = 1; i <= n; i++) {
      const next = i < n ? styleAt(i) : null
      if (next && next.color === cur.color && next.bg === cur.bg && next.ul === cur.ul) continue
      const text = t.chars.slice(s, i).join('')
      if (text.trim())
        items.push({
          run: {
            text,
            ...look,
            ...(cur.color && { color: cur.color }),
            ...(cur.bg && { bg: cur.bg }),
            ...(cur.ul && { underline: true }),
          },
          x: t.x + w * t.at[s],
          w: w * (t.at[i] - t.at[s]),
          base: t.base,
          pt: t.pt,
        })
      if (next) [s, cur] = [i, next]
    }
  }
  // Pictures on the page; one covering most of it is a background (a scan, a watermark), not a picture in the text.
  const images = (shapes.images ?? [])
    .map((im) => {
      const [x, y] = [Math.max(0, im.x), Math.max(0, im.y)]
      return { x, y, w: Math.min(width, im.x + im.w) - x, h: Math.min(height, im.y + im.h) - y }
    })
    .filter((im) => im.w >= 4 && im.h >= 4 && im.w * im.h < 0.5 * width * height)
  return { width, height, items, boxes: [...cells, ...panels], images }
}

// ---------- a page's flow ----------

interface Item {
  part: FlowPart
  x: number
  w: number
  base: number
  top: number
  pt: number
}
interface Piece {
  /** Its parts, each with where it starts and ends on the line. */
  parts: { part: FlowPart; pt: number; x: number; end: number }[]
  x: number
  end: number
  base: number
  top: number
  pt: number
}
const isText = (p: FlowPart): p is FlowRun => 'text' in p
const textOf = (p: Piece) =>
  p.parts
    .map((x) => (isText(x.part) ? x.part.text : ''))
    .join('')
    .trim()
const plain = (p: Piece) => p.parts.every((x) => isText(x.part))
const round = (n: number) => Math.round(n * 100) / 100

// Boxes typed as text ("☐") and answer blanks ("____", "……", ".....") where a field sits: the field takes their place.
const BOX = /[\u2610-\u2612\u25A1\u25A2\u25FB\u25FD\u274F-\u2752]/gu
const BLANK = /_{2,}|…+|\.{3,}/g
// A line starting a new paragraph: "1) ", "a. ", "(iv) ", "A1. ", "3.2.2 ", "-", "•" (or a symbol font's bullet).
const MARKER = /^(\(?\d{1,2}[.)]\s|\(?[a-z][.)]\s|\(?[ivx]{1,4}\)\s|[A-Z]\d{0,2}\.\s|\d+(\.\d+)+\s|[-–•●▪◦*\p{Co}])/u
// A list marker with nothing after it: "16.", "(b)", "•".
const LONE = /^(\(?\d{1,3}[.)]|\(?[a-z][.)]|\(?[ivx]{1,4}\)|[-–•●▪◦*\p{Co}])$/u

/**
 * One page of the form as blocks in reading order: the page read by readPage (none for a blank page), the fields
 * on it (not dialogOnly ones) and the layout's elements on it (the admin's text; white-outs hide what they cover).
 * `page` = the form's page number, its original page (`source`) and size in points.
 */
export function pageFlow(
  read: PageRead | undefined,
  page: { page: number; source: number | null; width: number; height: number },
  fields: FieldDef[],
  elements: LayoutElement[] = [],
): FlowBlock[] {
  const { width: W, height: H } = page
  const boxOf = (p: { x: number; y: number; width: number; height: number }): Box => ({
    x0: p.x * W,
    y0: p.y * H,
    x1: (p.x + p.width) * W,
    y1: (p.y + p.height) * H,
  })
  const covers = elements.filter((e) => e.type !== 'line' && e.fill).map((e) => boxOf(e.position))
  const hidden = (x: number, y: number) => covers.some((b) => within(b, x, y))

  const items: Item[] = []
  for (const t of read?.items ?? [])
    if (!hidden(t.x + t.w / 2, t.base - t.pt / 3))
      items.push({ part: { ...t.run }, x: t.x, w: t.w, base: t.base, top: t.base - t.pt, pt: t.pt })
  for (const e of elements) {
    if (e.type !== 'text' || !e.text) continue
    const b = boxOf(e.position)
    const pt = e.fontSize ?? 11
    e.text.split('\n').forEach((line, i) => {
      if (!line.trim()) return
      const base = b.y0 + (i + 0.85) * pt * 1.2
      const run: FlowRun = { text: line }
      if (e.bold) run.bold = true
      if (e.italic) run.italic = true
      if (e.font && e.font !== 'sans') run.font = e.font
      if (e.color && !isInk(e.color)) run.color = e.color
      items.push({ part: run, x: b.x0, w: b.x1 - b.x0, base, top: base - pt, pt })
    })
  }
  // The body text's size (the size most characters have): fields and pictures are measured in it.
  const bySize = items.filter((i) => isText(i.part)).sort((a, b) => a.pt - b.pt)
  const chars = bySize.reduce((n, i) => n + (i.part as FlowRun).text.length, 0)
  let body = 10
  for (let n = 0, i = 0; i < bySize.length; i++)
    if ((n += (bySize[i].part as FlowRun).text.length) >= chars / 2) {
      body = bySize[i].pt
      break
    }

  const spots = fields.map((f) => boxOf(f.position))
  for (const it of items) {
    if (!isText(it.part) || !spots.some((b) => it.x < b.x1 && it.x + it.w > b.x0 && it.top < b.y1 && it.base > b.y0))
      continue
    it.part.text = it.part.text.replace(BOX, '').replace(BLANK, ' ')
  }
  const kept = items.filter((i) => !isText(i.part) || i.part.text.trim())
  fields.forEach((field, i) => {
    const b = spots[i]
    kept.push({
      part: { field, w: round((b.x1 - b.x0) / body), h: round((b.y1 - b.y0) / body) },
      x: b.x0,
      w: b.x1 - b.x0,
      base: b.y1,
      top: b.y0,
      pt: body,
    })
  })
  if (read && page.source)
    for (const im of read.images) {
      if (hidden(im.x + im.w / 2, im.y + im.h / 2)) continue
      const image = {
        source: page.source,
        x: im.x / read.width,
        y: im.y / read.height,
        width: im.w / read.width,
        height: im.h / read.height,
      }
      kept.push({ part: { image, w: round(im.w / body), h: round(im.h / body) }, x: im.x, w: im.w, base: im.y + im.h, top: im.y, pt: body })
    }

  // Each item goes to the smallest box around its middle, else to the page's free text.
  const boxes = read?.boxes ?? []
  const inBox = new Map<Box, Item[]>()
  const free: Item[] = []
  for (const it of kept) {
    const [x, y] = [it.x + it.w / 2, (it.top + it.base) / 2]
    let best: Box | undefined
    for (const b of boxes) if (within(b, x, y) && (!best || area(b) < area(best))) best = b
    if (best) inBox.set(best, [...(inBox.get(best) ?? []), it])
    else free.push(it)
  }
  for (const list of [...inBox.values(), free])
    if (!list.some((i) => isText(i.part)))
      for (const i of list) if ('field' in i.part) i.part = { ...i.part, caption: true }

  type Placed = FlowBlock & { top: number; bot: number }
  const blocks: Placed[] = []
  // The page's content, its tables and text together: what's laid out by position lines up across both.
  const left = Math.min(...boxes.map((b) => b.x0), ...free.map((i) => i.x))
  const span = Math.max(...boxes.map((b) => b.x1), ...free.map((i) => i.x + i.w)) - left || 1
  // Free text: paragraphs. A line with fields or with several things side by side, or indented, is laid out as on
  // the page (on a page with text: a column header can name its fields).
  const pieces = piecesOf(free)
  const paras = paragraphs(pieces, Math.min(...pieces.map((p) => p.x)), Math.max(...pieces.map((p) => p.end)), body)
  const written = free.some((i) => isText(i.part))
  for (let i = 0; i < paras.length; ) {
    let j = i + 1
    while (j < paras.length && Math.abs(paras[j].base - paras[i].base) < 0.4 * paras[i].pt) j++
    const row = paras.slice(i, j)
    i = j
    const fields = row.some((r) => r.ps.some((p) => p.parts.some((x) => 'field' in x.part)))
    const indent = !row[0].para.align && Math.min(...row[0].ps.map((p) => p.x)) - left > 2 * body
    blocks.push({
      page: page.page,
      y: 0,
      bottom: 0,
      top: Math.min(...row.map((r) => r.top)),
      bot: Math.max(...row.map((r) => r.bottom)),
      ...(written && (row.length > 1 || fields || indent)
        ? { line: true, cells: lineCells(row, left, span, body) }
        : { paras: row.map((r) => r.para) }),
    })
  }
  // Table rows: boxes starting at one height, left to right, as wide as on the page.
  if (boxes.length) {
    const byTop = [...boxes].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    for (let i = 0; i < byTop.length; ) {
      let j = i + 1
      while (j < byTop.length && byTop[j].y0 - byTop[i].y0 <= 2) j++
      const row = byTop.slice(i, j).sort((a, b) => a.x0 - b.x0)
      i = j
      let end = left
      const cells = row.map((b) => {
        const cell: FlowCell = {
          width: round((100 * (b.x1 - b.x0)) / span),
          offset: round((100 * Math.max(0, b.x0 - end)) / span),
          paras: paragraphs(piecesOf(inBox.get(b) ?? []), b.x0 + 1.5, b.x1 - 1.5, body, b.fill).map((p) => p.para),
        }
        if (b.fill) cell.fill = b.fill
        end = Math.max(end, b.x1)
        return cell
      })
      blocks.push({ page: page.page, y: 0, bottom: 0, top: row[0].y0, bot: Math.max(...row.map((b) => b.y1)), cells })
    }
  }
  blocks.sort((a, b) => a.top - b.top)
  return blocks.map(({ top, bot, ...b }, i) => ({
    ...b,
    y: round4(top / H),
    bottom: round4(bot / H),
    ...(i > 0 && top - blocks[i - 1].bot > 0.6 * body && { gap: true }),
  }))
}
const round4 = (n: number) => Math.round(n * 10000) / 10000

type FieldPart = Extract<FlowPart, { field: FieldDef }>

// A line of the page laid out by position: each of its paragraphs, and on a line with fields each run of text and
// each field, at its place in % of the page's content (`left`, `span`). Text has the room up to what comes next;
// a field is as wide as on the page. A field with no text on either side (a row of answer lines under column
// names) is captioned with its label, shown where the line wraps.
function lineCells(row: { ps: Piece[]; para: FlowPara }[], left: number, span: number, body: number): FlowCell[] {
  const slots: { x0: number; x1: number; para: FlowPara; field?: FieldPart }[] = []
  const x = (r: (typeof row)[number]) => Math.min(...r.ps.map((p) => p.x))
  // Paragraphs left to right; within a line its own order (a field around its label's text comes after it).
  for (const { ps, para } of [...row].sort((a, b) => x(a) - x(b))) {
    if (ps.length > 1 || !ps[0].parts.some((p) => 'field' in p.part)) {
      const x0 = Math.min(...ps.map((p) => p.x))
      slots.push({ x0, x1: Math.max(...ps.map((p) => p.end)), para: { parts: para.parts, size: para.size } })
      continue
    }
    let run: Piece['parts'] = []
    const flush = () => {
      if (!run.length) return
      const piece = { ...ps[0], parts: run, x: run[0].x, end: Math.max(...run.map((r) => r.end)) }
      slots.push({ x0: piece.x, x1: piece.end, para: finish([piece], piece.x, piece.end, body, '#ffffff') })
      run = []
    }
    for (const p of ps[0].parts)
      if ('field' in p.part) {
        flush()
        slots.push({ x0: p.x, x1: p.end, para: { parts: [p.part], size: 1 }, field: p.part })
      } else run.push(p)
    flush()
  }
  const text = (k: number) => !!slots[k] && !slots[k].field
  let end = left
  return slots.map((s, k) => {
    const x0 = Math.max(s.x0, end)
    const x1 = Math.max(x0 + 1, s.field ? s.x1 : Math.max(s.x1, slots[k + 1]?.x0 ?? left + span))
    const para = s.field && !text(k - 1) && !text(k + 1) ? { parts: [{ ...s.field, caption: true }], size: 1 } : s.para
    const cell = { width: round((100 * (x1 - x0)) / span), offset: round((100 * (x0 - end)) / span), paras: [para] }
    end = x1
    return cell
  })
}

// Lines: items on one baseline, split where a wide gap starts another column. A field or a small picture sits on
// the line of text its box overlaps (an answer line drawn just under its label's baseline, an icon in the text);
// a picture taller than a few lines is a block of its own.
function piecesOf(items: Item[]): Piece[] {
  const texts = items.filter((i) => isText(i.part))
  const placed = items.map((it) => {
    if (isText(it.part) || ('image' in it.part && it.base - it.top > 2.5 * it.pt)) return it
    const over = (t: Item) => Math.min(it.base, t.base + 0.25 * t.pt) - Math.max(it.top, t.base - 0.8 * t.pt)
    let best: Item | undefined
    for (const t of texts) if (over(t) > 0.3 * t.pt && (!best || over(t) > over(best))) best = t
    return best ? { ...it, base: best.base } : it
  })
  placed.sort((a, b) => a.base - b.base)
  const rows: Item[][] = []
  for (const it of placed) {
    const row = rows.at(-1)
    if (row && Math.abs(it.base - row[0].base) < 0.4 * Math.max(it.pt, row[0].pt)) row.push(it)
    else rows.push([it])
  }
  const out: Piece[] = []
  for (const row of rows) {
    // A field drawn around text on its line (an answer line under "Comments:") comes after that text.
    const at = (it: Item) =>
      isText(it.part)
        ? it.x
        : Math.max(it.x, ...row.filter((t) => isText(t.part) && t.x > it.x && t.x < it.x + it.w).map((t) => t.x + t.w))
    let last: Piece | undefined
    for (const it of row.sort((a, b) => at(a) - at(b))) {
      const gap = last ? it.x - last.end : Infinity
      const words = isText(it.part) && !!last && isText(last.parts[last.parts.length - 1].part)
      const part = { part: it.part, pt: it.pt, x: it.x, end: it.x + it.w }
      if (last && gap < (words ? 1.5 : 2.5) * Math.max(it.pt, last.pt)) {
        if (isText(it.part) && gap > 0.15 * it.pt && !/\s$/.test(textOf(last)))
          part.part = { ...it.part, text: ` ${it.part.text.trimStart()}` }
        last.parts.push(part)
        last.end = Math.max(last.end, it.x + it.w)
        last.top = Math.min(last.top, it.top)
      } else out.push((last = { parts: [part], x: it.x, end: it.x + it.w, base: it.base, top: it.top, pt: it.pt }))
    }
  }
  return out
}

// Lines carried on join one paragraph: the next line starts in lower case, or this one ran to the right edge
// mid-sentence; a list marker, a size change, a gap or a field starts a new one. A line joins the paragraph whose
// last line is right above it (two columns of text side by side stay apart), under its start or, after a list
// marker, under the item's text ("15. Training …" / "    identification …").
function paragraphs(pieces: Piece[], left: number, right: number, body: number, fill = '#ffffff') {
  const groups: Piece[][] = []
  for (const c of pieces) {
    const t = textOf(c)
    let into: Piece[] | undefined
    if (plain(c) && !MARKER.test(t))
      for (let g = groups.length - 1; g >= Math.max(0, groups.length - 6) && !into; g--) {
        const p = groups[g][groups[g].length - 1]
        if (
          plain(p) &&
          c.base - p.base > 0.4 * p.pt &&
          c.base - p.base < 1.7 * Math.max(p.pt, c.pt) &&
          Math.abs(c.pt - p.pt) < 0.15 * p.pt &&
          c.x - p.x < (MARKER.test(textOf(p)) ? 6 : 2) * p.pt &&
          c.x < p.end &&
          c.end > p.x &&
          (/^\p{Ll}/u.test(t) || (p.end > right - 2.5 * p.pt && !/[.:;?!]$/.test(textOf(p))))
        )
          into = groups[g]
      }
    if (into) into.push(c)
    else groups.push([c])
  }
  // A list marker alone on its line ("16." centred on its item's lines, in a column of its own) starts the
  // paragraph right beside it.
  for (let g = groups.length - 1; g >= 0; g--) {
    const [m] = groups[g]
    if (groups[g].length > 1 || !plain(m) || !LONE.test(textOf(m))) continue
    const into = groups.find(
      (o) => o !== groups[g] && o[0].x > m.x && o[0].x - m.end < 6 * m.pt && o[0].top < m.base && o.at(-1)!.base > m.top,
    )
    if (!into) continue
    const [first, ...rest] = into[0].parts
    const lead = isText(first.part) ? { ...first, part: { ...first.part, text: ` ${first.part.text.trimStart()}` } } : first
    into[0] = { ...into[0], x: m.x, parts: [...m.parts, lead, ...rest] }
    groups.splice(g, 1)
  }
  return groups.map((ps) => ({
    ps,
    para: finish(ps, left, right, body, fill),
    top: Math.min(...ps.map((p) => p.top)),
    bottom: ps[ps.length - 1].base + 0.25 * ps[ps.length - 1].pt,
    base: ps[0].base,
    pt: ps[0].pt,
  }))
}

const sameLook = (a: FlowRun, b: FlowRun) =>
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.font === b.font &&
  a.color === b.color &&
  a.bg === b.bg &&
  a.size === b.size

function finish(ps: Piece[], left: number, right: number, body: number, fill: string): FlowPara {
  const sizes = ps.flatMap((p) => p.parts.filter((x) => isText(x.part)).map((x) => x.pt))
  const pt = sizes.length ? Math.max(...sizes) : body
  const parts: FlowPart[] = []
  ps.forEach((p, i) =>
    p.parts.forEach(({ part, pt: size }, j) => {
      if (!isText(part)) return void parts.push(part)
      const run: FlowRun = { ...part, text: part.text.replace(/\p{Co}/gu, '•') }
      // The lines of a paragraph join with a space; a word hyphenated at the line's end joins without one.
      if (i > 0 && j === 0) run.text = (/\p{L}-$/u.test(textOf(ps[i - 1])) ? '' : ' ') + run.text.trimStart()
      // White text on a white page (its dark bar not found): drawn in the normal ink.
      if (run.color && Math.abs(lum(run.color) - lum(run.bg ?? fill)) < 0.25) delete run.color
      if (Math.abs(size / pt - 1) > 0.1) run.size = round(size / pt)
      // The space before underlined or highlighted words is not part of them.
      const lead = /^\s+/.exec(run.text)?.[0]
      if (lead && (run.underline || run.bg)) {
        run.text = run.text.slice(lead.length)
        const prev = parts[parts.length - 1]
        if (prev && isText(prev) && !prev.underline && !prev.bg) prev.text += lead
        else parts.push({ text: lead })
      }
      const last = parts[parts.length - 1]
      if (last && isText(last) && sameLook(last, run)) last.text += run.text
      else parts.push(run)
    }),
  )
  const first = parts[0]
  if (first && isText(first)) first.text = first.text.trimStart()
  // Centred or right-aligned as on the page: every line's gaps to the box's edges say so (an indented line of a
  // justified paragraph, gaps 35 and 3, is neither).
  const gaps = ps.map((p) => [p.x - left, right - p.end])
  const width = right - left
  const align =
    width > 4 * pt &&
    gaps.every(([l, r]) => l > 2 * pt && Math.abs(l - r) < Math.max(3, Math.min(0.08 * width, 0.3 * Math.max(l, r))))
      ? 'center'
      : gaps.every(([l, r]) => r < 1.5 * pt && l > Math.max(2 * pt, 0.15 * width))
        ? 'right'
        : undefined
  return { parts, size: round(pt / body), ...(align && { align }) }
}

const partsOf = (b: FlowBlock) => (b.cells?.flatMap((c) => c.paras) ?? b.paras ?? []).flatMap((p) => p.parts)

/** The flow's text, for search. */
export const flowText = (blocks: FlowBlock[]) =>
  blocks
    .flatMap((b) =>
      (b.cells?.flatMap((c) => c.paras) ?? b.paras ?? []).map((p) =>
        p.parts.map((x) => ('text' in x ? x.text : '')).join(''),
      ),
    )
    .join('\n')

/**
 * The flow cut where each numbered question ends (its fields under one `section`), else each question: a filter
 * showing a question shows its whole stretch, from the end of the one before, with all its text.
 */
export function flowSegments(blocks: FlowBlock[], questions: Question[]): FlowSegment[] {
  const at = new Map<string, number>()
  blocks.forEach((b, i) => {
    for (const p of partsOf(b)) if ('field' in p) at.set(p.field.id, i)
  })
  const ends: number[] = []
  const owner = new Map<number, string[]>()
  let key: string | undefined
  for (const q of questions) {
    const idx = q.parts.map((p) => at.get(p.field.id)).filter((i): i is number => i != null)
    if (!idx.length) continue
    const k = q.section ?? q.id
    if (k !== key) {
      ends.push(-1)
      key = k
    }
    ends[ends.length - 1] = Math.max(ends[ends.length - 1], ...idx)
    const first = Math.min(...idx)
    owner.set(first, [...(owner.get(first) ?? []), q.id])
  }
  const cuts = new Set(ends)
  const out: FlowSegment[] = []
  let cur: FlowSegment = { blocks: [], questions: [] }
  blocks.forEach((b, i) => {
    cur.blocks.push(b)
    cur.questions.push(...(owner.get(i) ?? []))
    if (cuts.has(i)) {
      out.push(cur)
      cur = { blocks: [], questions: [] }
    }
  })
  if (cur.blocks.length) out.push(cur)
  return out
}
