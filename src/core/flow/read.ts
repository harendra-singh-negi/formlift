// Reading a page from pdf.js: its text runs with their look (bold, italic, underline, colour, highlight, font,
// size), its ruled cells and shaded boxes with their fill, and its pictures.

import { type Shapes, tableCells } from '../detect'
import type { PdfTextItem } from '../layout'
import type { FlowRun, PageRead } from './types'

export type Box = PageRead['boxes'][number]

export const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
export const lum = (hex: string) => {
  const [r, g, b] = rgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
// Black and near-black is the text's normal ink (drawn in the list's own colour); white is the paper.
export const isInk = (hex: string) => {
  const c = rgb(hex)
  return Math.max(...c) < 0.28 && Math.max(...c) - Math.min(...c) < 0.1
}
export const isPaper = (hex: string) => lum(hex) > 0.985
export const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0)
export const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
export const within = (b: Box, x: number, y: number) => x >= b.x0 - 0.5 && x <= b.x1 + 0.5 && y >= b.y0 - 0.5 && y <= b.y1 + 0.5

export const BOLD = /bold|black|heavy|semibold|demi/i
export const ITALIC = /italic|oblique/i
export const MONO = /mono|courier|consol/i
export const SERIF = /serif|times|georgia|garamond|cambria|palatino|antiqua|minion/i

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
