// Automatic field suggestions from a PDF page's drawing, no AI service needed:
//   - small stroked squares            → checkbox
//   - empty cells of ruled tables       → text area (or text when one line high)
//   - dotted / solid answer lines, "____" → text input (stacked lines → one text area)
// Labels come from the text next to them (left of a line, beside a box, row + column headers of a cell).
// Everything here works in PDF points with the origin at the page's top left; results are page fractions.
// Suggestions get source 'ai' + a confidence, so the editor shows them as dashed boxes for the admin to check.

import type { FieldDef, FieldType } from './form-logic'
import { fitInPage } from './coords'
import { keyFor } from './fields'
import { toLines, type TextLine } from './layout'

export interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  dashed: boolean
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
  stroked: boolean
  filled: boolean
  /** Drawn with curves (a circle or rounded box). */
  round?: boolean
}
export interface Shapes {
  hlines: Seg[]
  vlines: Seg[]
  rects: Rect[]
}

type Matrix = [number, number, number, number, number, number]
const mul = (m: Matrix, n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

/** The pdf.js operator codes this needs (pdfjs `OPS`). */
export interface Ops {
  save: number
  restore: number
  transform: number
  setDash: number
  constructPath: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
  stroke: number
  closeStroke: number
  fill: number
  eoFill: number
  fillStroke: number
  eoFillStroke: number
  closeFillStroke: number
  closeEOFillStroke: number
}
// pdf.js DrawOPS inside a constructPath's path data.
const MOVE = 0
const LINE = 1
const CURVE = 2
const CLOSE = 3

/**
 * Lines and rectangles a page draws, in points from the top left, from pdf.js `page.getOperatorList()`.
 * Follows the transform stack (save / restore / cm / form XObjects) and the dash state.
 */
export function extractShapes(fnArray: number[], argsArray: unknown[][], OPS: Ops, viewBox: number[]): Shapes {
  const [vx0, , , vy1] = viewBox
  const out: Shapes = { hlines: [], vlines: [], rects: [] }
  let state = { ctm: [1, 0, 0, 1, 0, 0] as Matrix, dashed: false }
  const stack: (typeof state)[] = []
  const strokeOps = new Set([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ])
  const fillOps = new Set([
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ])

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i]
    if (fn === OPS.save) stack.push(state)
    else if (fn === OPS.restore) state = stack.pop() ?? state
    else if (fn === OPS.transform) state = { ...state, ctm: mul(state.ctm, args as number[]) }
    else if (fn === OPS.setDash)
      state = { ...state, dashed: Array.isArray(args[0]) && (args[0] as number[]).length > 0 }
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(state)
      if (Array.isArray(args[0])) state = { ...state, ctm: mul(state.ctm, args[0] as number[]) }
    } else if (fn === OPS.paintFormXObjectEnd) state = stack.pop() ?? state
    else if (fn === OPS.constructPath) {
      const op = args[0] as number
      const path = (args[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined
      const stroked = strokeOps.has(op)
      const filled = fillOps.has(op)
      if ((!stroked && !filled) || !path || typeof path.length !== 'number') continue
      const m = state.ctm
      const pt = (x: number, y: number) => [m[0] * x + m[2] * y + m[4] - vx0, vy1 - (m[1] * x + m[3] * y + m[5])] // Split into sub-paths of points. A sub-path with curves is only kept as its box: a dot (part of a dotted
      // line) or a small round box (radio button / round checkbox).
      const subs: number[][][] = []
      const curved: number[][][] = []
      let cur: number[][] = []
      let isCurved = false
      const end = () => {
        if (cur.length) (isCurved ? curved : subs).push(cur)
        cur = []
        isCurved = false
      }
      for (let k = 0; k < path.length;) {
        const code = path[k++]
        if (code === MOVE) {
          end()
          cur = [pt(path[k++], path[k++])]
        } else if (code === LINE) cur.push(pt(path[k++], path[k++]))
        else if (code === CURVE) {
          cur.push(pt(path[k++], path[k++]), pt(path[k++], path[k++]), pt(path[k++], path[k++]))
          isCurved = true
        } else if (code === CLOSE) {
          if (cur.length) cur.push(cur[0])
        } else break
      }
      end()
      for (const c of curved) {
        const xs = c.map((p) => p[0])
        const ys = c.map((p) => p[1])
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        out.rects.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, stroked, filled, round: true })
      }
      for (const s of subs) {
        const xs = s.map((p) => p[0])
        const ys = s.map((p) => p[1])
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        const w = Math.max(...xs) - x
        const h = Math.max(...ys) - y
        const axisAligned = s.every(
          (p, j) => j === 0 || Math.abs(p[0] - s[j - 1][0]) < 0.5 || Math.abs(p[1] - s[j - 1][1]) < 0.5,
        )
        if (s.length >= 4 && axisAligned && w > 0.5 && h > 0.5) {
          // A thin filled rectangle is how some tools draw a rule.
          if (filled && !stroked && h < 2 && w > 10)
            out.hlines.push({ x0: x, y0: y + h / 2, x1: x + w, y1: y + h / 2, dashed: false })
          else if (filled && !stroked && w < 2 && h > 10)
            out.vlines.push({ x0: x + w / 2, y0: y, x1: x + w / 2, y1: y + h, dashed: false })
          else out.rects.push({ x, y, w, h, stroked, filled })
          // (Not for checkbox-sized squares; a flat table row of 15 pt still counts.)
          if (stroked && (w > 16 || h > 16)) {
            // A stroked box's edges are rules too (table outlines).
            out.hlines.push(
              { x0: x, y0: y, x1: x + w, y1: y, dashed: state.dashed },
              { x0: x, y0: y + h, x1: x + w, y1: y + h, dashed: state.dashed },
            )
            out.vlines.push(
              { x0: x, y0: y, x1: x, y1: y + h, dashed: state.dashed },
              { x0: x + w, y0: y, x1: x + w, y1: y + h, dashed: state.dashed },
            )
          }
          continue
        }
        if (!stroked) continue
        for (let j = 1; j < s.length; j++) {
          const [ax, ay] = s[j - 1]
          const [bx, by] = s[j]
          if (Math.abs(ay - by) < 0.5 && Math.abs(bx - ax) > 1)
            out.hlines.push({ x0: Math.min(ax, bx), y0: ay, x1: Math.max(ax, bx), y1: ay, dashed: state.dashed })
          else if (Math.abs(ax - bx) < 0.5 && Math.abs(by - ay) > 1)
            out.vlines.push({ x0: ax, y0: Math.min(ay, by), x1: ax, y1: Math.max(ay, by), dashed: state.dashed })
        }
      }
    }
  }
  return withDottedLines(out)
}

/** Dotted lines drawn as rows of tiny dots or squares become one dashed line. */
function withDottedLines(shapes: Shapes): Shapes {
  const isDot = (r: Rect) => r.w <= 2.5 && r.h <= 2.5
  const dots = shapes.rects.filter(isDot).sort((a, b) => a.y - b.y || a.x - b.x)
  if (dots.length < 5) return shapes
  const hlines = [...shapes.hlines]
  let run: Rect[] = []
  const flush = () => {
    if (run.length >= 5) {
      const y = run[0].y + run[0].h / 2
      hlines.push({ x0: run[0].x, x1: run[run.length - 1].x + run[run.length - 1].w, y0: y, y1: y, dashed: true })
    }
    run = []
  }
  for (const d of dots) {
    const last = run[run.length - 1]
    if (last && Math.abs(d.y - last.y) < 0.6 && d.x - (last.x + last.w) < 6) run.push(d)
    else {
      flush()
      run = [d]
    }
  }
  flush()
  return { ...shapes, hlines, rects: shapes.rects.filter((r) => !isDot(r)) }
}

// Characters fonts use for an empty / ticked box. Word and other tools often type them instead of drawing.
const BOX_CHARS = /[\u2610\u2611\u2612\u25A1\u25A2\u25FB\u25FD\u274F\u2750\u2751\u2752]/

/**
 * Splits checkbox characters (☐ ☑ □ ❏ …) out of pdf.js text items: each becomes a box, and the item keeps only
 * the rest of its text (shifted right), so "☐ Loading" gives a box and the label "Loading".
 */
export function splitBoxChars<T extends { str: string; transform: number[]; width: number }>(
  items: T[],
  viewBox: number[],
): { items: T[]; boxes: Rect[] } {
  const [x0, , , y1] = viewBox
  const boxes: Rect[] = []
  const out: T[] = []
  for (const i of items) {
    if (!BOX_CHARS.test(i.str)) {
      out.push(i)
      continue
    }
    const chars = [...i.str]
    const per = i.width / Math.max(1, chars.length)
    const size = Math.hypot(i.transform[2], i.transform[3]) || 10
    let rest = ''
    let restStart = -1
    const flush = (end: number) => {
      if (rest.trim()) {
        const t = [...i.transform]
        t[4] += per * restStart
        out.push({ ...i, str: rest, width: per * (end - restStart), transform: t })
      }
      rest = ''
      restStart = -1
    }
    chars.forEach((ch, k) => {
      if (BOX_CHARS.test(ch)) {
        flush(k)
        const side = Math.min(per, size) * 0.85
        boxes.push({
          x: i.transform[4] - x0 + per * k + (per - side) / 2,
          y: y1 - i.transform[5] - size * 0.78,
          w: side,
          h: side,
          stroked: true,
          filled: false,
        })
      } else {
        if (restStart < 0) restStart = k
        rest += ch
      }
    })
    flush(chars.length)
  }
  return { items: out, boxes }
}

// ---------- detection ----------

/** A text line in points (top-left origin). */
interface PtText {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}
interface Suggestion {
  type: FieldType
  label: string
  x: number
  y: number
  w: number
  h: number
  confidence: number
}

const cluster = (values: number[], tol: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) if (!out.length || v - out[out.length - 1] > tol) out.push(v)
  return out
}
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
// Labels that say little on their own ("Comments:" under an item); named after the item above them.
const GENERIC = /^(comments?|remarks?|notes?|observations?|findings?)$/i
// A label is short; a long sentence next to a line is prose, not the line's name. One that ends in ":" is a
// label whatever its length (shortened).
const cleanLabel = (s: string) => {
  const t = s
    .replace(/[:.\s_]+$/, '')
    .replace(/^[\s•▪\-–☐☑☒□]+/, '')
    .trim()
  if (t.length <= 60) return t
  return /:\s*$/.test(s) ? t.slice(0, 57).trimEnd() + '…' : ''
}

function typeFor(label: string): FieldType {
  if (/\bsign(ature)?\b/i.test(label)) return 'signature'
  if (/\bdate\b|\bfrom\b|\bto\b|\bdob\b/i.test(label)) return 'date'
  if (/e-?mail/i.test(label)) return 'email'
  if (/phone|mobile|\btel\b|contact no/i.test(label)) return 'phone'
  return 'text'
}

/**
 * Collinear pieces of one border joined into one line. Word draws a table's borders cell by cell and leaves
 * gaps of 2–3 pt where rows meet, so a column wall would otherwise never cover a whole row.
 */
function joinSegs(lines: Seg[], vertical: boolean): Seg[] {
  const at = (l: Seg) => (vertical ? l.x0 : l.y0)
  const from = (l: Seg) => (vertical ? l.y0 : l.x0)
  const to = (l: Seg) => (vertical ? l.y1 : l.x1)
  const sorted = [...lines].sort((a, b) => at(a) - at(b) || from(a) - from(b))
  const out: Seg[] = []
  for (const l of sorted) {
    const last = out.find((o) => Math.abs(at(o) - at(l)) < 1 && from(l) <= to(o) + 3 && to(l) >= from(o))
    if (!last) out.push({ ...l })
    else if (vertical) last.y1 = Math.max(last.y1, l.y1)
    else last.x1 = Math.max(last.x1, l.x1)
  }
  return out
}

/** Cells of ruled tables: regions between solid lines that are closed on every side. */
function tableCells(h: Seg[], v: Seg[], lastTextY = Infinity) {
  const TOL = 2
  const vs = joinSegs(
    v.filter((l) => !l.dashed && l.y1 - l.y0 > 8),
    true,
  )
  // A dotted line is an answer line, except where the table's walls end on it with nothing written below: the
  // open edge of a table that goes on to the next page.
  // (Walls that also start on it make it a dotted border between rows, which stays an answer line.)
  const across = (w: Seg, l: Seg) => w.x0 > l.x0 - TOL && w.x0 < l.x1 + TOL
  const edge = (l: Seg) =>
    l.y0 > lastTextY &&
    vs.filter((w) => across(w, l) && Math.abs(w.y1 - l.y0) < 1.5).length >= 2 &&
    !vs.some((w) => across(w, l) && Math.abs(w.y0 - l.y0) < 3)
  const hs = joinSegs(
    h.filter((l) => (!l.dashed || edge(l)) && l.x1 - l.x0 > 8),
    false,
  )
  if (hs.length < 2 || vs.length < 2) return []
  const xs = cluster(
    vs.map((l) => l.x0),
    TOL,
  )
  const ys = cluster(
    hs.map((l) => l.y0),
    TOL,
  )
  if (xs.length < 2 || ys.length < 2 || xs.length * ys.length > 20000) return []
  const covered = (lines: Seg[], at: number, from: number, to: number, horizontal: boolean) =>
    lines.some((l) =>
      horizontal
        ? Math.abs(l.y0 - at) <= TOL && l.x0 <= from + TOL && l.x1 >= to - TOL
        : Math.abs(l.x0 - at) <= TOL && l.y0 <= from + TOL && l.y1 >= to - TOL,
    )
  const C = xs.length - 1
  const R = ys.length - 1
  // Walls between neighbouring grid cells; union cells with no wall between them.
  const parent = Array.from({ length: C * R }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const id = (c: number, r: number) => r * C + c
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (c + 1 < C && !covered(vs, xs[c + 1], ys[r], ys[r + 1], false)) parent[find(id(c, r))] = find(id(c + 1, r))
      if (r + 1 < R && !covered(hs, ys[r + 1], xs[c], xs[c + 1], true)) parent[find(id(c, r))] = find(id(c, r + 1))
    }
  const groups = new Map<number, { c0: number; c1: number; r0: number; r1: number; n: number }>()
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const g = groups.get(find(id(c, r)))
      if (!g) groups.set(find(id(c, r)), { c0: c, c1: c, r0: r, r1: r, n: 1 })
      else
        Object.assign(g, {
          c0: Math.min(g.c0, c),
          c1: Math.max(g.c1, c),
          r0: Math.min(g.r0, r),
          r1: Math.max(g.r1, r),
          n: g.n + 1,
        })
    }
  const cells: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const g of groups.values()) {
    if (g.n !== (g.c1 - g.c0 + 1) * (g.r1 - g.r0 + 1)) continue // not a rectangle
    const x0 = xs[g.c0]
    const x1 = xs[g.c1 + 1]
    const y0 = ys[g.r0]
    const y1 = ys[g.r1 + 1]
    // Closed on all four sides, or it is the space around / between tables.
    if (
      covered(hs, y0, x0, x1, true) &&
      covered(hs, y1, x0, x1, true) &&
      covered(vs, x0, y0, y1, false) &&
      covered(vs, x1, y0, y1, false)
    )
      cells.push({ x0, y0, x1, y1 })
  }
  return cells
}

/**
 * Suggested fields for one page. `lines` = the page's text lines (utils/layout toLines, page fractions),
 * `underscores` = text runs of "____" (points), `existing` = fields already on the page (no duplicates),
 * `prevText` = the previous page's heading-like last line (names a box that starts this page).
 */
export function detectFields(
  shapes: Shapes,
  lines: TextLine[],
  size: { width: number; height: number },
  page: number,
  existing: FieldDef[] = [],
  underscores: Seg[] = [],
  prevText = '',
): Omit<FieldDef, 'id' | 'key'>[] {
  const W = size.width
  const H = size.height
  const texts: PtText[] = lines.map((l) => ({
    text: l.text,
    x0: l.x * W,
    y0: l.y * H,
    x1: (l.x + l.width) * W,
    y1: (l.y + l.height) * H,
  }))
  // Sizes follow the page's own text: its typical line height (a form in 7 pt text has smaller boxes than one
  // in 14 pt). Without text, 10 pt type is assumed.
  const heights = texts.map((t) => t.y1 - t.y0).sort((a, b) => a - b)
  const lineH = Math.min(30, Math.max(9, (heights[Math.floor(heights.length / 2)] ?? 11.8) * 1.1))
  const em = lineH / 1.3
  const out: Suggestion[] = []
  const textIn = (x0: number, y0: number, x1: number, y1: number) =>
    texts.filter((t) => {
      const cx = (t.x0 + t.x1) / 2
      const cy = (t.y0 + t.y1) / 2
      return cx > x0 && cx < x1 && cy > y0 && cy < y1 && !/^_+$/.test(t.text)
    })

  // Ruled tables first: cells name the checkboxes and answer boxes inside them.
  const cells = tableCells(
    shapes.hlines,
    shapes.vlines,
    texts.filter((t) => !/^page \d+/i.test(t.text)).reduce((m, t) => Math.max(m, t.y1), 0), // footer aside
  )
  type Cell = (typeof cells)[number]
  const textCells = cells.filter((c) => textIn(c.x0, c.y0, c.x1, c.y1).length)
  const cellText = (c: Cell) =>
    cleanLabel(
      textIn(c.x0, c.y0, c.x1, c.y1)
        .map((t) => t.text)
        .join(' '),
    )
  // "Row – Column": the nearest text cell on the left in the same row, and the table's header row (the topmost
  // text cell in the unbroken run of cells straight above, so another table above never names the column).
  // A header exactly as wide as the column wins over wider cells above it (the form's own header block, e.g.
  // "Number of Observations" above a "No." column).
  // `longRow`: a long row name (a question) is shortened instead of dropped (checkboxes in Y / N / NA columns).
  const headersOf = (c: Cell, longRow = false) => {
    const colHead: Cell[] = []
    const sameCol = (t: Cell) => Math.abs(t.x0 - c.x0) < 2 && Math.abs(t.x1 - c.x1) < 2
    let emptyAbove = 0 // answer cells of the same column above (a section bar may cut the column)
    for (let up = c; ;) {
      const next = cells.find(
        (t) =>
          t.y0 < up.y0 - 1 && // strictly above: a cell under 2.5 pt tall would otherwise find itself forever
          Math.abs(t.y1 - up.y0) < 2.5 &&
          overlap(t.x0, t.x1, c.x0, c.x1) > 0.6 * Math.min(t.x1 - t.x0, c.x1 - c.x0),
      )
      if (!next) break
      if (textCells.includes(next)) colHead.push(next)
      else if (sameCol(next) && !colHead.some(sameCol)) emptyAbove++ // only between the cell and its header
      up = next
    }
    const rowHead = textCells
      .filter((t) => t.x1 <= c.x0 + 2 && overlap(t.y0, t.y1, c.y0, c.y1) > 0.6 * Math.min(t.y1 - t.y0, c.y1 - c.y0))
      .sort((a, b) => b.x1 - a.x1)
    // Only in a list (3+ empty rows stacked in the column); a lone blank cell keeps the old, stricter naming.
    let run = 1
    for (const down of [false, true])
      for (let cur = c; ;) {
        const n = cells.find(
          (t) =>
            sameCol(t) &&
            !textCells.includes(t) &&
            (down ? t.y0 > cur.y0 + 1 : t.y0 < cur.y0 - 1) &&
            Math.abs(down ? t.y0 - cur.y1 : cur.y0 - t.y1) < 2.5,
        )
        if (!n) break
        run++
        cur = n
      }
    const list = run >= 3 || emptyAbove >= 2
    const own = list ? colHead.filter((t) => sameCol(t) && cellText(t)) : []
    // A wide box right under its own heading bar ("Suggestion / Feedback from Crew" over an empty box).
    const bar = colHead[0]
    const underBar =
      bar && !rowHead.length && sameCol(bar) && Math.abs(bar.y1 - c.y0) < 2.5 && c.x1 - c.x0 > 0.5 * W && cellText(bar)
    const top = underBar ? bar : (own[0] ?? colHead[colHead.length - 1])
    const col = top ? cellText(top) : ''
    const rowRaw = rowHead.length
      ? textIn(rowHead[0].x0, rowHead[0].y0, rowHead[0].x1, rowHead[0].y1)
          .map((t) => t.text)
          .join(' ')
      : ''
    const row = cleanLabel(rowRaw) || (longRow && rowRaw ? rowRaw.slice(0, 57).trimEnd() + '…' : '')
    return [row, col].filter(Boolean).join(' – ')
  }
  const cellAt = (x: number, y: number) => cells.find((c) => x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1)
  const proseRight = (c: Cell) =>
    textCells.some(
      (t) =>
        t.x0 >= c.x1 - 2 &&
        overlap(t.y0, t.y1, c.y0, c.y1) > 0.6 * (c.y1 - c.y0) &&
        textIn(t.x0, t.y0, t.x1, t.y1).reduce((n, x) => n + x.text.length, 0) > 80,
    )

  // 1. Checkboxes: small square outlines, named by the text beside them or, in a grid, by row and column.
  const minBox = Math.max(4, em * 0.45)
  const maxBox = Math.max(16, em * 1.8)
  const boxes = shapes.rects.filter(
    (r) =>
      r.stroked &&
      r.w >= minBox &&
      r.w <= maxBox &&
      r.h >= minBox &&
      r.h <= maxBox &&
      Math.abs(r.w - r.h) < Math.max(2.5, r.w * 0.2),
  )
  for (const b of boxes) {
    const cy = b.y + b.h / 2
    // In a ruled table only the box's own cell can name it (not the question in the cell beside it).
    const own = cellAt(b.x + b.w / 2, cy)
    const near = texts
      .filter((t) => cy > t.y0 - 2 && cy < t.y1 + 2)
      .filter((t) => !own || ((t.x0 + t.x1) / 2 > own.x0 && (t.x0 + t.x1) / 2 < own.x1))
      .map((t) => ({ t, gap: t.x0 >= b.x + b.w - 1 ? t.x0 - (b.x + b.w) : b.x - t.x1 }))
      .filter((n) => n.gap > -2 && n.gap < 40)
      .sort((p, q) => p.gap - q.gap)[0]
    const cell = near ? undefined : cellAt(b.x + b.w / 2, cy)
    out.push({
      type: 'checkbox',
      label: near ? cleanLabel(near.t.text) : cell ? headersOf(cell, true) : '',
      x: b.x - 1,
      y: b.y - 1,
      w: b.w + 2,
      h: b.h + 2,
      confidence: 0.9,
    })
  }

  // 2. Table cells without text, named by row and column.
  const fieldCells: Cell[] = []
  for (const c of cells) {
    if (c.x1 - c.x0 <= 20 || c.y1 - c.y0 <= 10 || textIn(c.x0, c.y0, c.x1, c.y1).length) continue
    if (boxes.some((b) => b.x > c.x0 && b.x < c.x1 && b.y > c.y0 && b.y < c.y1)) continue // a cell holding checkboxes
    // A blank cell in a column of checkboxes (Y / N / NA; a row continued from the previous page) is not a text box.
    const boxCells = cells.filter(
      (t) =>
        Math.abs(t.x0 - c.x0) < 2 &&
        Math.abs(t.x1 - c.x1) < 2 &&
        boxes.some((b) => b.x > t.x0 && b.x < t.x1 && b.y > t.y0 && b.y < t.y1),
    )
    if (boxCells.length >= 2) continue
    let label = headersOf(c)
    // A lone empty box (no table around it) a few lines tall is a free-text answer, named by the text right above
    // it, or by the end of the previous page when it starts the page ("PART 1 – SUMMARY" ... next page: the box).
    const lone = !cells.some(
      (t) =>
        t !== c &&
        ((overlap(t.x0, t.x1, c.x0, c.x1) > 2 && (Math.abs(t.y1 - c.y0) < 2.5 || Math.abs(t.y0 - c.y1) < 2.5)) ||
          (overlap(t.y0, t.y1, c.y0, c.y1) > 2 && (Math.abs(t.x1 - c.x0) < 2.5 || Math.abs(t.x0 - c.x1) < 2.5))),
    )
    if (!label && lone && c.y1 - c.y0 > lineH * 3 && c.x1 - c.x0 > em * 15) {
      const above = texts
        .filter((t) => t.y1 <= c.y0 + 1 && c.y0 - t.y1 < lineH * 4 && overlap(t.x0, t.x1, c.x0, c.x1) > 0)
        .sort((a, b) => b.y1 - a.y1)[0]
      const atTop = !texts.some((t) => t.y1 <= c.y0 + 1)
      label = above ? cleanLabel(above.text) : atTop ? cleanLabel(prevText) : ''
      if (!label && !atTop) continue
      label ||= 'Text'
    }
    // A row of answer cells (every cell in it blank) under a header too long to be a name ("OPEN ITEMS, MEMORANDA,
    // … (Where Class records …)"): the header's start names it.
    const head = cells.find(
      (t) =>
        textCells.includes(t) && Math.abs(t.y1 - c.y0) < 2.5 && Math.abs(t.x0 - c.x0) < 2 && Math.abs(t.x1 - c.x1) < 2,
    )
    const mates = cells.filter((t) => t !== c && Math.abs(t.y0 - c.y0) < 2 && Math.abs(t.y1 - c.y1) < 2)
    if (!label && head && mates.length && !mates.some((t) => textCells.includes(t))) {
      const raw = textIn(head.x0, head.y0, head.x1, head.y1)
        .map((t) => t.text)
        .join(' ')
        .replace(/\s*\(.*$/, '') // the note in brackets
      label =
        cleanLabel(raw) ||
        raw
          .slice(0, 58)
          .replace(/\s+\S*$/, '')
          .replace(/[,;:\s]+$/, '') + '…'
    }
    // A blank cell beside a block of instructions is layout, not an answer box.
    const besideProse = textCells.some(
      (t) => t.x0 >= c.x1 - 2 && overlap(t.y0, t.y1, c.y0, c.y1) > 0.6 * (c.y1 - c.y0) && cellText(t).length === 0,
    )
    // A cell with no row or column name is spacing in the layout (beside headings, instructions), not an answer box.
    if (!label || besideProse || proseRight(c)) continue
    fieldCells.push(c)
    const tall = c.y1 - c.y0 > lineH * 2.2
    const pad = 1.5
    out.push({
      type: tall ? 'textarea' : typeFor(label),
      label,
      x: c.x0 + pad,
      y: c.y0 + pad,
      w: c.x1 - c.x0 - 2 * pad,
      h: c.y1 - c.y0 - 2 * pad,
      confidence: 0.75,
    })
  }

  // 3. Answer lines: dotted / solid rules with free space above, and "____" text (not inside a cell that is
  // already an answer box; a box with a question in it can still hold answer lines).
  const inAnyCell = (x: number, y: number) =>
    fieldCells.some((c) => x > c.x0 + 1 && x < c.x1 - 1 && y > c.y0 + 1 && y < c.y1 - 1)
  const isWall = (l: Seg) =>
    cells.some((c) => (Math.abs(l.y0 - c.y0) < 2 || Math.abs(l.y0 - c.y1) < 2) && l.x0 < c.x1 && l.x1 > c.x0)
  let rules = [...shapes.hlines, ...underscores]
    .filter((l) => l.x1 - l.x0 >= 25 && !isWall(l) && !inAnyCell((l.x0 + l.x1) / 2, l.y0))
    // Underlined words: text sits right on top of a solid rule (dotted rules are always answer lines).
    .filter(
      (l) =>
        l.dashed ||
        !texts.some(
          (t) => l.y0 - t.y1 > -3 && l.y0 - t.y1 < 4 && overlap(t.x0, t.x1, l.x0, l.x1) > 0.3 * (l.x1 - l.x0),
        ),
    )
    // A rule that crosses an inner column line of a table is a row border (some tables use dotted ones).
    .filter((l) => !shapes.vlines.some((v) => v.x0 > l.x0 + 4 && v.x0 < l.x1 - 4 && v.y0 < l.y0 + 1 && v.y1 > l.y0 - 1))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  // Pieces of one rule (dotted lines drawn in parts) join up.
  const joined: Seg[] = []
  for (const l of rules) {
    const last = joined.find((j) => Math.abs(j.y0 - l.y0) < 1 && l.x0 - j.x1 < 4 && l.x1 > j.x0)
    if (last) last.x1 = Math.max(last.x1, l.x1)
    else joined.push({ ...l })
  }
  rules = joined
  // Rules stacked under each other with the same width and nothing written between = one text area. Rules that
  // share their row with other rules are a grid (NAME / SIGNATURE / DATE rows): each row stays its own field.
  const inGrid = (l: Seg) => rules.some((r) => r !== l && Math.abs(r.y0 - l.y0) < 2)
  const used = new Set<Seg>()
  for (const l of rules) {
    if (used.has(l)) continue
    const stack = [l]
    for (const m of inGrid(l) ? [] : rules) {
      const last = stack[stack.length - 1]
      if (used.has(m) || stack.includes(m)) continue
      const gap = m.y0 - last.y0
      if (
        gap > 4 &&
        gap < lineH * 1.9 &&
        Math.abs(m.x0 - last.x0) < 4 &&
        Math.abs(m.x1 - last.x1) < 4 &&
        !textIn(m.x0, last.y0 + 1, m.x1, m.y0 - 1).length
      )
        stack.push(m)
    }
    stack.forEach((s) => used.add(s))
    const first = stack[0]
    const lastRule = stack[stack.length - 1]
    // Label: text on the same line to the left, or just above-left for a block.
    // Label: text on the same line to the left (with no other answer line in between), plus a column header
    // right above when the rule sits in a row of rules (RANK / NAME / SIGNATURE / DATE).
    const left = texts
      .filter((t) => t.x1 <= first.x0 + 6 && first.x0 - t.x1 < 220 && first.y0 >= t.y0 - 2 && first.y0 - t.y1 < 10)
      .filter(
        (t) =>
          !rules.some((r) => r !== first && Math.abs(r.y0 - first.y0) < 2 && r.x0 >= t.x1 - 1 && r.x1 <= first.x0 + 1),
      )
      .sort((a, b) => b.x1 - a.x1)[0]
    const rowOfRules = rules.filter((r) => Math.abs(r.y0 - first.y0) < 2).length >= 3
    // A solid rule across most of the page is a separator unless a "Label:" right before it names it; dotted
    // rules are always answer lines.
    const wide = !first.dashed && first.x1 - first.x0 > 0.7 * W
    if (wide && !/:\s*$/.test(left?.text ?? '')) continue
    const header =
      (rowOfRules || !left) && !wide
        ? texts
            .filter((t) => t.y1 <= first.y0 - 2 && first.y0 - t.y1 < (rowOfRules ? 250 : 90))
            .filter(
              (t) =>
                (t.x0 + t.x1) / 2 > first.x0 &&
                (t.x0 + t.x1) / 2 < first.x1 &&
                t.x1 - t.x0 < (first.x1 - first.x0) * 1.2,
            )
            .sort((a, b) => b.y1 - a.y1)
        : []
    // A header written on two lines ("DATE" over "(Reviewed)") is read as one.
    const head = header[0]
    const headAbove = head && header.find((t) => t !== head && head.y0 - t.y1 < 6 && head.y0 >= t.y1 - 1)
    const label = [left, headAbove, head]
      .filter((t) => t)
      .map((t) => cleanLabel(t!.text))
      .filter(Boolean)
      .join(' – ')
    // An unnamed line across the page is a border (e.g. the bottom of a table), not an answer line.
    if (!label && first.x1 - first.x0 > 0.7 * W) continue
    // Top: about one line above the rule, but below any text above it.
    const above = texts
      .filter((t) => t.y1 <= first.y0 - 1 && overlap(t.x0, t.x1, first.x0, first.x1) > 2 && first.y0 - t.y1 < lineH)
      .reduce((m, t) => Math.max(m, t.y1), -Infinity)
    const top = Math.max(first.y0 - lineH, above + 0.5)
    // The next row starts right under it, from its left end: a separator between rows, not an answer line.
    if (texts.some((t) => t.y0 - lastRule.y0 > -1 && t.y0 - lastRule.y0 < 4 && Math.abs(t.x0 - first.x0) < 8)) continue
    // No room to write above it (text right on top): a separator under a paragraph, not an answer line.    if (lastRule.y0 - top < lineH * 0.6) continue
    const multi = stack.length > 1
    out.push({
      type: multi ? 'textarea' : typeFor(label),
      label,
      x: first.x0,
      y: top,
      w: first.x1 - first.x0,
      h: lastRule.y0 - top,
      confidence: label ? 0.8 : 0.5,
    })
  }

  // 4. "Label:" followed by empty space up to the border of the ruled box it is in. Outside a box a line
  // ending in ":" is usually a heading ("Steps:", "Result:"), so it is left alone.
  // A box with only "Finding" / "Remarks" / "Comments" written in it (no ":"), taller than two lines, is an answer
  // box too, unless it heads a column of blank cells (a table's "Remarks" column header).
  const soleWord = (t: PtText) => {
    if (!GENERIC.test(cleanLabel(t.text))) return false
    const midY = (t.y0 + t.y1) / 2
    const cell = cells.find((c) => t.x0 > c.x0 - 1 && t.x1 < c.x1 + 1 && midY > c.y0 && midY < c.y1)
    if (!cell || cell.y1 - cell.y0 < lineH * 2.2 || textIn(cell.x0, cell.y0, cell.x1, cell.y1).length !== 1)
      return false
    return !cells.some(
      (b) =>
        Math.abs(b.y0 - cell.y1) < 2.5 &&
        Math.abs(b.x0 - cell.x0) < 2 &&
        Math.abs(b.x1 - cell.x1) < 2 &&
        !textIn(b.x0, b.y0, b.x1, b.y1).length,
    )
  }
  for (const t of texts) {
    if (!(/:\s*$/.test(t.text) || soleWord(t)) || t.text.length > 40) continue
    // The last line of a wrapped label ("Structural concerns / and Class Survey / File:") is not a label of its own.
    const prev = texts.find(
      (o) => o !== t && Math.abs(o.x0 - t.x0) < 2 && t.y0 - o.y1 > -2 && t.y0 - o.y1 < lineH * 0.6,
    )
    if (prev && !/:\s*$/.test(prev.text) && !GENERIC.test(cleanLabel(t.text))) continue
    const midY = (t.y0 + t.y1) / 2
    if (out.some((o) => midY > o.y - 2 && midY < o.y + o.h + 2 && o.x >= t.x1 - 4 && o.x - t.x1 < 250)) continue
    const cell = cells.find((c) => t.x0 > c.x0 - 1 && t.x1 < c.x1 + 1 && midY > c.y0 && midY < c.y1)
    if (!cell) continue
    // A box full of prose (a list of guidance or findings) holds no questions: "… including:" is a sentence.
    // ("Comments:" under an item is a real answer place however long the item.)
    const prose = textIn(cell.x0, cell.y0, cell.x1, cell.y1).filter((o) => o.text.length > 60).length >= 3
    if (prose && !GENERIC.test(cleanLabel(t.text))) continue
    const right = Math.min(
      cell.x1 - 2,
      ...texts.filter((o) => o !== t && o.x0 > t.x1 && overlap(o.y0, o.y1, t.y0, t.y1) > 0).map((o) => o.x0 - 4),
      ...shapes.vlines.filter((v) => v.x0 > t.x1 + 2 && v.y0 < midY && v.y1 > midY).map((v) => v.x0 - 2),
    )
    const top = Math.max(cell.y0 + 1.5, t.y0 - 2)
    const bottom = Math.min(
      cell.y1 - 1.5,
      ...texts.filter((o) => o.y0 > t.y1 && overlap(o.x0, o.x1, t.x1, right) > 0).map((o) => o.y0 - 1),
    )
    const x = t.x1 + 4
    if (right - x < em * 5 || bottom - top < lineH * 0.6 || textIn(x, top, right, bottom).length) continue
    // A heading bar (label on a filled band) is not a question.
    if (
      shapes.rects.some(
        (r) =>
          r.filled && !r.stroked && r.x <= t.x0 && r.x + r.w >= right - 2 && r.y <= t.y0 + 1 && r.y + r.h >= t.y1 - 1,
      )
    )
      continue
    let label = cleanLabel(t.text)
    // "Comments:" / "Remarks:" say little on their own: name them after the numbered item above them.
    if (GENERIC.test(label)) {
      const item = texts
        .filter((o) => o.y1 <= t.y0 + 1 && t.y0 - o.y1 < 400 && /^\d+(\.\d+)+[a-z]?\b/i.test(o.text))
        .sort((a, b) => b.y1 - a.y1)[0]
      // A box with only "Finding" in it: the block it closes, when a box right above starts with a short heading
      // ("HW", "PR", "HF"): one Finding box per block, each with its own name.
      let tag = ''
      for (let y = cell.y0, k = /:\s*$/.test(t.text) ? 3 : 0; k < 3 && !tag; k++) {
        const block = cells.find((c) => Math.abs(c.y1 - y) < 2.5 && t.x0 > c.x0 - 1 && t.x0 < c.x1)
        if (!block) break
        const head = textIn(block.x0, block.y0, block.x1, block.y1).sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0)[0]
        if (head && head.text.trim().length <= 12 && head.y0 - block.y0 < lineH * 1.5) tag = head.text.trim()
        y = block.y0
      }
      if (item) label = `${item.text.slice(0, 60).trim()}${tag ? ` – ${tag}` : ''} – ${label}`
    }
    out.push({
      type: bottom - top > lineH * 2.2 ? 'textarea' : typeFor(label),
      label,
      x,
      y: top,
      w: right - x,
      h: bottom - top,
      confidence: 0.65,
    })
  }

  // 5. Tables drawn with shading only (Word tables without borders): a shaded label cell followed by empty space
  // in its row is an answer box, split by the shaded column headers above it ("Signature:" / "Date:").
  const shade = shapes.rects
    .filter((r) => r.filled && !r.stroked && !r.round && r.h >= lineH * 0.8 && r.h <= lineH * 4 && r.w > em * 2)
    // Word paints a cell and its paragraph: keep the outer one (and one of exact duplicates).
    .filter(
      (r, i, all) =>
        !all.some(
          (o, j) =>
            j !== i &&
            o.x <= r.x + 0.5 &&
            o.y <= r.y + 0.5 &&
            o.x + o.w >= r.x + r.w - 0.5 &&
            o.y + o.h >= r.y + r.h - 0.5 &&
            (o.w * o.h > r.w * r.h + 1 || j < i),
        ),
    )
  const shadeText = (r: Rect) => textIn(r.x, r.y, r.x + r.w, r.y + r.h)
  const labelled = shade.filter((r) => shadeText(r).length)
  for (const L of labelled) {
    const label = cleanLabel(
      shadeText(L)
        .map((t) => t.text)
        .join(' '),
    )
    if (!label) continue
    const y0 = L.y
    const y1 = L.y + L.h
    const x0 = L.x + L.w
    const inRow = (a0: number, a1: number) => overlap(a0, a1, y0, y1) > 0.5 * Math.min(a1 - a0, L.h)
    // Up to the next label / text / checkbox in the row, else the right edge of the shaded block around it (the
    // shaded rects joined to it, row by row; a lone shaded title has no block).
    const block = [L]
    for (let k = 0; k < block.length; k++) {
      const s = block[k]
      for (const r of shade)
        if (
          !block.includes(r) &&
          overlap(r.x, r.x + r.w, s.x, s.x + s.w) > 0 &&
          (Math.abs(r.y - (s.y + s.h)) < 3 || Math.abs(s.y - (r.y + r.h)) < 3)
        )
          block.push(r)
        else if (!block.includes(r) && Math.abs(r.y - s.y) < 2 && Math.abs(r.h - s.h) < 2) block.push(r) // same row
    }
    const end = Math.min(
      Math.max(x0, ...block.map((r) => r.x + r.w)),
      ...labelled.filter((r) => r !== L && r.x >= x0 - 1 && inRow(r.y, r.y + r.h)).map((r) => r.x),
      ...texts.filter((t) => t.x0 >= x0 - 1 && inRow(t.y0, t.y1)).map((t) => t.x0 - 4),
      ...boxes.filter((b) => b.x >= x0 - 1 && inRow(b.y, b.y + b.h)).map((b) => b.x - 4),
    )
    if (end - x0 < em * 4) continue
    const heads = labelled.filter(
      (r) => r.y + r.h <= y0 + 1 && y0 - (r.y + r.h) < 120 && r.x >= x0 - 2 && r.x + r.w <= end + 2,
    )
    const headY = Math.max(...heads.map((r) => r.y + r.h))
    const cols = heads.filter((r) => Math.abs(r.y + r.h - headY) < 2).sort((a, b) => a.x - b.x)
    const split = cols.length && cols.reduce((n, r) => n + r.w, 0) > 0.8 * (end - x0)
    const parts = split
      ? cols.map((r) => ({
          a: Math.max(x0, r.x),
          b: Math.min(end, r.x + r.w),
          name: cleanLabel(
            shadeText(r)
              .map((t) => t.text)
              .join(' '),
          ),
        }))
      : [{ a: x0, b: end, name: '' }]
    for (const p of parts) {
      const name = [label, p.name].filter(Boolean).join(' – ')
      out.push({
        type: y1 - y0 > lineH * 2.2 ? 'textarea' : typeFor(p.name || label),
        label: name,
        x: p.a + 1.5,
        y: y0 + 1,
        w: p.b - p.a - 3,
        h: y1 - y0 - 2,
        confidence: 0.6,
      })
    }
  }

  // Page fractions; skip what overlaps an existing field or an earlier suggestion.
  const taken = existing.filter((f) => f.position.page === page).map((f) => f.position)
  const result: Omit<FieldDef, 'id' | 'key'>[] = []
  for (const s of out) {
    if (s.w < 4 || s.h < 4) continue
    const position = fitInPage({ page, x: s.x / W, y: s.y / H, width: s.w / W, height: s.h / H })
    const clash = taken.some((p) => {
      const inter =
        overlap(p.x, p.x + p.width, position.x, position.x + position.width) *
        overlap(p.y, p.y + p.height, position.y, position.y + position.height)
      return inter > 0.3 * Math.min(p.width * p.height, position.width * position.height)
    })
    if (clash) continue
    taken.push(position)
    result.push({ type: s.type, label: s.label, source: 'ai', confidence: s.confidence, position })
  }
  return result
}

/**
 * "____" runs inside text items, as answer lines (points, top-left origin), and the items without them, so
 * "Signature: ______" gives the line and the label "Signature:". Assumes even character widths.
 */
export function splitUnderscores<T extends { str: string; transform: number[]; width: number }>(
  items: T[],
  viewBox: number[],
): { items: T[]; rules: Seg[] } {
  const [x0, , , y1] = viewBox
  const rules: Seg[] = []
  const out: T[] = []
  for (const i of items) {
    if (!i.str.includes('____')) {
      out.push(i)
      continue
    }
    const per = i.width / i.str.length
    let from = 0
    for (const m of i.str.matchAll(/_{4,}/g)) {
      const at = m.index ?? 0
      const start = i.transform[4] - x0 + per * at
      const y = y1 - i.transform[5] + 1
      // Typed, so treated like a dotted line (never an underline under words).
      rules.push({ x0: start, x1: start + per * m[0].length, y0: y, y1: y, dashed: true })
      const piece = i.str.slice(from, at)
      if (piece.trim()) {
        const t = [...i.transform]
        t[4] += per * from
        out.push({ ...i, str: piece, width: per * piece.length, transform: t })
      }
      from = at + m[0].length
    }
    const tail = i.str.slice(from)
    if (tail.trim()) {
      const t = [...i.transform]
      t[4] += per * from
      out.push({ ...i, str: tail, width: per * tail.length, transform: t })
    }
  }
  return { items: out, rules }
}

// ---------- whole document ----------

export { keyFor }

/** What detection needs from a pdf.js document (PDFDocumentProxy). */
interface PdfDoc {
  getPage(n: number): Promise<{
    view: number[]
    getOperatorList(o?: { intent?: string }): Promise<{ fnArray: number[]; argsArray: unknown[] }>
    getTextContent(): Promise<{ items: unknown[] }>
  }>
}

/**
 * Suggested fields for every page of a layout (original pages only; blank pages have nothing to detect).
 * Runs page by page so the page stays responsive; `onProgress(done, total)`; stop early with `signal`.
 * New fields get ids and keys; existing fields are never duplicated.
 */
export async function detectDocument(
  pdf: PdfDoc,
  OPS: Ops,
  pages: { source: number | null; width: number; height: number }[],
  existing: FieldDef[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<FieldDef[]> {
  const found: FieldDef[] = []
  let prevText = ''
  for (let i = 0; i < pages.length; i++) {
    if (signal?.aborted) break
    const p = pages[i]
    if (!p.source) prevText = ''
    else {
      const page = await pdf.getPage(p.source)
      // 'print' intent: its operator list is not the one the canvas renderer caches and rewrites.
      const ops = await page.getOperatorList({ intent: 'print' })
      const text = await page.getTextContent()
      const split = splitBoxChars(text.items as { str: string; transform: number[]; width: number }[], page.view)
      const typed = splitUnderscores(split.items, page.view)
      const items = typed.items
      const drawn = extractShapes(ops.fnArray, ops.argsArray as unknown[][], OPS, page.view)
      const shapes = { ...drawn, rects: [...drawn.rects, ...split.boxes] }
      const size = { width: page.view[2] - page.view[0], height: page.view[3] - page.view[1] }
      const all = [...existing, ...found]
      const lines = toLines(items, page.view)
      for (const s of detectFields(shapes, lines, size, i + 1, all, typed.rules, prevText)) {
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `d${Date.now()}${Math.random()}`
        found.push({ ...s, id, key: keyFor(s.label, s.type, [...existing, ...found]), label: s.label || s.type })
      }
      // The page's last lines, bottom up: a heading under a note ("PART 1 – SUMMARY" / "(concise overview…)").
      const bottom = [...lines].sort((a, b) => b.y - a.y).slice(0, 2)
      prevText = bottom.map((l) => l.text).find((t) => t.length <= 60 || /:\s*$/.test(t)) ?? ''
    }
    onProgress?.(i + 1, pages.length)
  }
  return found
}
