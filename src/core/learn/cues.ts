// What learning knows a box by: its cues. A cue is a short string about the box and what is around it, measured
// against the page's own text size, so the same kind of box in another form has the same cues even when its words,
// size and place differ:
//   k=cell rt=text    what proposed it (a rule of auto-detect, or a box it suggests only once taught), as what type
//   w3 h1 sq          its width and height in letters and lines of the page; square like a checkbox
//   cell-blank        in a table cell with nothing else written in it; also framed, rule (on an answer line), fill-…
//   t:yes t-choices   what is printed in it ("Yes/No/NA": answers printed in place of boxes)
//   l:expiry l-colon  the label before it ("Expiry:"; l^ its first word, l$ its last, l~ the end of a long word);
//                     r:… the text after it ("☐ Yes"; r-long: a sentence, as after a bullet); a:… the line over it;
//                     c:… the header of its column
//   row3 col5         how many boxes like it share its row (Y / N / NA) and its column
// The same function gives the cues of a box auto-detect proposes and of a field an admin drew, so what is learnt
// from one applies to the other. Lessons keep cues only as hashes: never the page's words.

import { overlap } from '../coords'
import type { FieldDef, FieldType, Position } from '../form-logic'

/** A page as learning sees it: its text, its drawing and the boxes auto-detect proposes on it. */
export interface PageView {
  /** Points. */
  width: number
  height: number
  /** Lines of text, in page fractions. `choices`: answers printed in place of boxes ("Yes/No/NA"). */
  lines: { text: string; x: number; y: number; width: number; height: number; choices?: boolean }[]
  /** Cells of ruled tables, in points from the top left. */
  cells: { x0: number; y0: number; x1: number; y1: number }[]
  /** Rectangles it draws, in points (`fill`: '#rrggbb'). */
  rects: { x: number; y: number; w: number; h: number; stroked: boolean; filled: boolean; fill?: string }[]
  /** Horizontal rules and typed "____", in points. */
  rules: { x0: number; x1: number; y0: number; dashed: boolean }[]
  /** What auto-detect proposes on the page. */
  candidates: Candidate[]
}

/** A box auto-detect proposes: what a rule suggests, or a box it suggests only once admins kept such boxes. */
export interface Candidate {
  field: Omit<FieldDef, 'id' | 'key'>
  /** What proposed it: checkbox, cell, line, colon, shade, acroform (rules), choice, fill, blank, space (taught). */
  kind: string
  /** How likely it is a field before anything is learnt (a rule's confidence; low for the taught kinds). */
  prior: number
}

// Words that say nothing about a field.
const STOP = new Set(
  'a an the of in on at to for by and or is are was were be been has have had do does did it its this that these those with from as if any all no not your you our we they he she his her their there which what when where who how than then also per via please'.split(
    ' ',
  ),
)

/** The words of a text as cues use them: lower case, no little words, "comments" and "comment" alike. */
export function words(s: string, keepShort = false): string[] {
  const out: string[] = []
  for (const m of s.normalize('NFKC').toLowerCase().matchAll(/\p{L}[\p{L}\p{N}']*/gu)) {
    let w = m[0].replace(/'s$/, '')
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
    if ((w.length < 2 && !keepShort) || (!keepShort && STOP.has(w))) continue
    if (!out.includes(w)) out.push(w)
  }
  return out
}

const bucket = (v: number, steps: number[]) => {
  let i = 0
  while (i < steps.length && v >= steps[i]) i++
  return i
}

interface PtLine {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  choices?: boolean
}
interface Prepared {
  lines: PtLine[]
  lineH: number
  em: number
}
const prepared = new WeakMap<PageView, Prepared>()
function prepare(view: PageView): Prepared {
  let p = prepared.get(view)
  if (p) return p
  const { width: W, height: H } = view
  const lines = view.lines.map((l) => ({
    text: l.text,
    x0: l.x * W,
    y0: l.y * H,
    x1: (l.x + l.width) * W,
    y1: (l.y + l.height) * H,
    ...(l.choices && { choices: true }),
  }))
  // The page's typical line height (as detection measures it): sizes are told in lines and letters of the page.
  const heights = lines.map((l) => l.y1 - l.y0).sort((a, b) => a - b)
  const lineH = Math.min(30, Math.max(9, (heights[heights.length >> 1] ?? 11.8) * 1.1))
  prepared.set(view, (p = { lines, lineH, em: lineH / 1.3 }))
  return p
}

// A fill's tone: a white or light box is a place to write in some forms; a grey or dark band a heading.
function tone(hex = '#000000') {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const grey = Math.max(r, g, b) - Math.min(r, g, b) < 10
  return grey ? (light > 0.97 ? 'white' : light > 0.85 ? 'light' : 'dark') : light > 0.85 ? 'tint' : 'color'
}

/** The cues of a box (page fractions) that `kind` proposed as a `type` (or 'none': drawn by hand) on a page. */
export function cuesOf(box: Position, kind: string, view: PageView, type?: FieldType): string[] {
  const { lines, lineH, em } = prepare(view)
  const { width: W, height: H } = view
  const x0 = box.x * W
  const y0 = box.y * H
  const x1 = (box.x + box.width) * W
  const y1 = (box.y + box.height) * H
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const out = [`k=${kind}`, `w${bucket(w / em, [2, 4, 8, 16, 32])}`, `h${bucket(h / lineH, [0.8, 1.6, 3, 6])}`]
  if (type) out.push(`rt=${type}`)
  if (Math.abs(w - h) < 0.25 * Math.max(w, h) && w < 2.5 * em) out.push('sq')
  const centred = (l: PtLine) => {
    const [mx, my] = [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2]
    return mx > x0 && mx < x1 && my > y0 && my < y1
  }

  // What it sits in or on.
  const cell = view.cells.find((c) => cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1)
  if (cell) {
    out.push('cell')
    const inCell = lines.filter((l) => {
      const [mx, my] = [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2]
      return mx > cell.x0 && mx < cell.x1 && my > cell.y0 && my < cell.y1 && !centred(l)
    })
    out.push(inCell.length ? 'cell-text' : 'cell-blank')
    const shared = overlap(x0, x1, cell.x0, cell.x1) * overlap(y0, y1, cell.y0, cell.y1)
    if (shared > 0.6 * (cell.x1 - cell.x0) * (cell.y1 - cell.y0)) out.push('cell-fit')
  } else out.push('free')
  const rule = view.rules.find((r) => Math.abs(r.y0 - y1) < 3 && overlap(r.x0, r.x1, x0, x1) > 0.5 * w)
  if (rule) out.push(rule.dashed ? 'rule-dashed' : 'rule')
  const near = (a: number, b: number) => Math.abs(a - b) < 3
  if (view.rects.some((r) => r.stroked && near(r.x, x0) && near(r.y, y0) && near(r.x + r.w, x1) && near(r.y + r.h, y1)))
    out.push('framed')
  const fill = view.rects.find(
    (r) => r.filled && overlap(r.x, r.x + r.w, x0, x1) * overlap(r.y, r.y + r.h, y0, y1) > 0.8 * w * h,
  )
  if (fill) out.push(`fill-${tone(fill.fill)}`)

  // What is written in it.
  const inside = lines.filter(centred)
  out.push(`tn${Math.min(inside.length, 2)}`)
  for (const t of words(inside.map((l) => l.text).join(' '), true).slice(0, 4)) out.push(`t:${t}`)
  if (inside.length && inside.every((l) => l.choices)) out.push('t-choices')

  // Its label: the text before it on its row, else the line over it.
  const row = (l: PtLine) => overlap(l.y0, l.y1, y0, y1) > 0.5 * Math.min(l.y1 - l.y0, h, lineH)
  const left = lines
    .filter((l) => !centred(l) && row(l) && l.x1 <= x0 + 2 && x0 - l.x1 < 0.35 * W)
    .sort((a, b) => b.x1 - a.x1)[0]
  const said = (prefix: string, l: PtLine) => {
    const t = l.text.trim()
    const ws = words(t)
    if (t.length > 40) out.push(`${prefix}-long`)
    else if (ws.length) {
      for (const word of ws.slice(0, 4)) {
        out.push(`${prefix}:${word}`)
        // The end of a long word: "countersigned" and "signed" share it.
        if (word.length >= 6) out.push(`${prefix}~${word.slice(-5)}`)
      }
      // Its first and last word: "Number of crew" (a count) is not "Permit number" (an identifier).
      out.push(`${prefix}^${ws[0]}`, `${prefix}$${ws[ws.length - 1]}`)
    }
    if (/:\s*$/.test(t)) out.push(`${prefix}-colon`)
    if (l.choices) out.push(`${prefix}-choices`)
  }
  if (left) {
    out.push(`lg${bucket((x0 - left.x1) / em, [1, 3, 8])}`)
    said('l', left)
    if (/^\(?\d+(\.\d+)*[.)]?(\s|$)/.test(left.text.trim())) out.push('l-num')
  } else out.push('l-none')
  const right = lines
    .filter((l) => !centred(l) && row(l) && l.x0 >= x1 - 2 && l.x0 - x1 < 3 * em)
    .sort((a, b) => a.x0 - b.x0)[0]
  if (right) said('r', right)
  const above = lines
    .filter((l) => !centred(l) && l.y1 <= y0 + 1 && y0 - l.y1 < 2.5 * lineH && overlap(l.x0, l.x1, x0, x1) > 0)
    .sort((a, b) => b.y1 - a.y1)[0]
  if (above) said('a', above)
  else out.push('a-none')

  // The header of its column: the first cell with text straight above it in the same column.
  if (cell) {
    let up = cell
    for (let k = 0; k < 60; k++) {
      const next = view.cells.find(
        (c) => Math.abs(c.x0 - cell.x0) < 2 && Math.abs(c.x1 - cell.x1) < 2 && Math.abs(c.y1 - up.y0) < 2.5 && c.y0 < up.y0 - 1,
      )
      if (!next) break
      const heading = lines.filter((l) => {
        const [mx, my] = [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2]
        return mx > next.x0 && mx < next.x1 && my > next.y0 && my < next.y1
      })
      if (heading.length && !heading.every((l) => l.choices)) {
        for (const word of words(heading.map((l) => l.text).join(' '), true).slice(0, 4)) out.push(`c:${word}`)
        break
      }
      up = next
    }
  }

  // Boxes like it beside it (Y / N / NA) and under one another (a column of answers).
  if (kind !== 'none') {
    const alike = view.candidates.filter((c) => c.kind === kind)
    const mid = (p: Position) => [(p.x + p.width / 2) * W, (p.y + p.height / 2) * H]
    const inRow = alike.filter((c) => Math.abs(mid(c.field.position)[1] - cy) < 0.5 * lineH).length
    const inCol = alike.filter((c) => Math.abs(mid(c.field.position)[0] - cx) < 3).length
    out.push(`row${Math.min(inRow, 4)}`, `col${inCol >= 5 ? 5 : inCol >= 2 ? 2 : 1}`)
  }

  // What the kind of box says together with its other cues ("a box of rule cell under a Comments header").
  for (const c of out.slice(1)) if (/^(c:|t-choices|l-colon|fill-|h\d|sq|cell-|framed|rule)/.test(c)) out.push(`${out[0]}|${c}`)
  return out
}
