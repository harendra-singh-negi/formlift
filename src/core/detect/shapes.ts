// What a page draws, read from pdf.js's operator list: lines (solid, dashed, dotted), rectangles (stroked, filled,
// round) and pictures, in PDF points from the page's top left. Also the boxes and answer lines that some tools type
// as text instead of drawing them ("☐ Yes", "Signature: ____").

export interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  dashed: boolean
  /** Filled thinner than half a point: a table's wall (Word draws them so), never an answer line. */
  hair?: boolean
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
  /** Fill colour (#rrggbb) when filled. */
  fill?: string
}
export interface Shapes {
  hlines: Seg[]
  vlines: Seg[]
  rects: Rect[]
  /** Pictures drawn on the page: their boxes. */
  images?: { x: number; y: number; w: number; h: number }[]
  /** The page's text as drawn, glyph by glyph (no spaces), with its fill colour and advance width (font units). */
  ink?: { ch: string; color: string; w: number }[]
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
  // Colours, text and pictures (for the list view's flow); pdf.js OPS has them all.
  setFillRGBColor?: number
  showText?: number
  paintImageXObject?: number
  paintInlineImageXObject?: number
  paintImageMaskXObject?: number
}
// pdf.js DrawOPS inside a constructPath's path data.
const MOVE = 0
const LINE = 1
const CURVE = 2
const CLOSE = 3

// pdf.js 5+ passes a fill colour as '#rrggbb'; older builds as r, g, b (0–255).
const hexOf = (args: unknown[]) =>
  typeof args[0] === 'string'
    ? args[0]
    : `#${args
        .slice(0, 3)
        .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0'))
        .join('')}`

/**
 * Lines and rectangles a page draws, in points from the top left, from pdf.js `page.getOperatorList()`, with
 * their fill colours, the pictures it paints and the colour of every glyph of its text.
 * Follows the transform stack (save / restore / cm / form XObjects), the dash state and the fill colour.
 */
export function extractShapes(fnArray: number[], argsArray: unknown[][], OPS: Ops, viewBox: number[]): Shapes {
  const [vx0, , , vy1] = viewBox
  const out: Required<Shapes> = { hlines: [], vlines: [], rects: [], images: [], ink: [] }
  let state = { ctm: [1, 0, 0, 1, 0, 0] as Matrix, dashed: false, fill: '#000000' }
  const pictures = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject])
  pictures.delete(undefined)
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
    else if (fn === OPS.setFillRGBColor) state = { ...state, fill: hexOf(args) }
    else if (fn === OPS.showText) {
      for (const g of (args[0] as unknown[] | undefined) ?? []) {
        const glyph = g as { unicode?: string; width?: number } | null
        // Ligatures as getTextContent writes them ("ﬁ" → "fi"), sharing the glyph's width.
        const chars = [...(glyph?.unicode?.replace(/[\uFB00-\uFB06]/g, (c) => c.normalize('NFKC')) ?? '')]
        for (const ch of chars)
          if (ch.trim()) out.ink.push({ ch, color: state.fill, w: (Number(glyph?.width) || 0) / chars.length })
      }
    } else if (pictures.has(fn)) {
      // A picture fills the unit square of its transform.
      const m = state.ctm
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]].map((x) => x - vx0)
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]].map((y) => vy1 - y)
      const [x, y] = [Math.min(...xs), Math.min(...ys)]
      out.images.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
    }
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
        out.rects.push({
          x,
          y,
          w: Math.max(...xs) - x,
          h: Math.max(...ys) - y,
          stroked,
          filled,
          round: true,
          ...(filled && { fill: state.fill }),
        })
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
        // A rule filled as a rectangle thinner than half a point (Word's 0.48 pt table borders): a fill paints every
        // pixel it touches, so it prints as a hairline. (A path with no area at all is left out.)
        if (filled && !stroked && axisAligned && s.length >= 4 && Math.min(w, h) > 0 && Math.min(w, h) <= 0.5 && Math.max(w, h) > 10) {
          if (w > h) out.hlines.push({ x0: x, y0: y + h / 2, x1: x + w, y1: y + h / 2, dashed: false, hair: true })
          else out.vlines.push({ x0: x + w / 2, y0: y, x1: x + w / 2, y1: y + h, dashed: false, hair: true })
          continue
        }
        if (s.length >= 4 && axisAligned && w > 0.5 && h > 0.5) {
          // A thin filled rectangle is how some tools draw a rule.
          if (filled && !stroked && h < 2 && w > 10)
            out.hlines.push({ x0: x, y0: y + h / 2, x1: x + w, y1: y + h / 2, dashed: false })
          else if (filled && !stroked && w < 2 && h > 10)
            out.vlines.push({ x0: x + w / 2, y0: y, x1: x + w / 2, y1: y + h, dashed: false })
          else out.rects.push({ x, y, w, h, stroked, filled, ...(filled && { fill: state.fill }) })
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
