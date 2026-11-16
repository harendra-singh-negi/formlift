// Suggested fields for one page, from what it draws and the text around it:
//   1. small stroked squares (and "☐" typed as text)  → checkbox
//   2. empty cells of ruled tables                     → text area (or a text input when one line high)
//   3. dotted / solid answer lines and "____"          → text input (stacked lines → one text area)
//   4. "Label:" followed by empty space up to the border of its box
//   5. tables drawn with shading only: a shaded label cell followed by empty space
// Labels come from the text next to them (left of a line, beside a box, row + column headers of a cell). Sizes are
// measured against the page's own text height, never in absolute points, so the rules hold for any document.
// Everything here works in PDF points with the origin at the page's top left; results are page fractions.

import type { FieldDef, FieldType } from '../form-logic'
import { clashes, fitInPage, overlap } from '../coords'
import type { TextLine } from '../layout'
import { cleanLabel, GENERIC, LIST_ITEM, typeFor } from './labels'
import type { Rect, Seg, Shapes } from './shapes'
import { tableCells } from './tables'

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

const overlapArea = (r: Rect, c: { x0: number; y0: number; x1: number; y1: number }) =>
  overlap(r.x, r.x + r.w, c.x0, c.x1) * overlap(r.y, r.y + r.h, c.y0, c.y1)
// Grey, from light grey to black (not white): the shading of headings and bars, never of a place to write.
const isGrey = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return Math.max(...c) - Math.min(...c) < 10 && Math.min(...c) < 250
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
  // Painted grey: an empty heading row or a cell left blank on purpose (a place to write is never grey).
  const greyed = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    shapes.rects.some(
      (r) => r.filled && r.fill && isGrey(r.fill) && overlapArea(r, b) > 0.8 * (b.x1 - b.x0) * (b.y1 - b.y0),
    )
  // The numbered item a "Comments:" / "Remarks:" belongs to: the nearest "1.2.3 …" line above it.
  const itemAbove = (t: PtText) =>
    texts
      .filter((o) => o.y1 <= t.y0 + 1 && t.y0 - o.y1 < 400 && /^\d+(\.\d+)+[a-z]?\b/i.test(o.text))
      .sort((a, b) => b.y1 - a.y1)[0]

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
    // A wide box right under its own heading bar ("Suggestion / Feedback from Staff" over an empty box).
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
    if (greyed(c)) continue
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
    // A lone one-line box named right above it (where the box starts) or on its left, as web forms have it: an input.
    if (!label && lone && c.y1 - c.y0 > lineH * 1.2 && c.y1 - c.y0 <= lineH * 3 && c.x1 - c.x0 > em * 8) {
      const cy = (c.y0 + c.y1) / 2
      const name =
        texts
          .filter((t) => t.y1 <= c.y0 + 1 && c.y0 - t.y1 < lineH * 1.5 && Math.abs(t.x0 - c.x0) < em * 2)
          .sort((a, b) => b.y1 - a.y1)[0] ??
        texts.filter((t) => t.y0 < cy && t.y1 > cy && t.x1 <= c.x0 + 1 && c.x0 - t.x1 < em * 6).sort((a, b) => b.x1 - a.x1)[0]
      label = name ? cleanLabel(name.text) : ''
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
    // Text written on the rule itself (a dotted border under a line): a short label at its start ("Comments:")
    // has its answer after it; text on the first of stacked rules names the lines under it ("… details of actions
    // required:" over two dotted lines); any other text makes the rule that text's border, not an answer line.
    const on = texts.filter(
      (t) => first.y0 - t.y1 > -3 && first.y0 - t.y1 < 4 && overlap(t.x0, t.x1, first.x0, first.x1) > 2,
    )
    const multi = stack.length > 1
    const lead =
      on.length === 1 && (multi || (on[0].x0 < first.x0 + 2 * em && on[0].text.length <= 40)) ? on[0] : undefined
    if (on.length && !lead) continue
    const x0 = lead && !multi ? lead.x1 + 4 : first.x0
    if (x0 !== first.x0 && first.x1 - x0 < em * 5) continue
    // Label: text on the same line to the left, or just above-left for a block.
    // Label: text on the same line to the left (with no other answer line in between), plus a column header
    // right above when the rule sits in a row of rules (ROLE / NAME / SIGNATURE / DATE).
    const left =
      lead ??
      texts
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
    let label = [left, headAbove, head]
      .filter((t) => t)
      .map((t) => cleanLabel(t!.text))
      .filter(Boolean)
      .join(' – ')
    const item = lead && GENERIC.test(label) && itemAbove(lead)
    if (item) label = `${item.text.slice(0, 60).trim()} – ${label}`
    // An unnamed line across the page is a border (e.g. the bottom of a table), not an answer line.
    if (!label && first.x1 - first.x0 > 0.7 * W) continue
    // Top: about one line above the rule, but below any text above it.
    const above = texts
      .filter((t) => t.y1 <= first.y0 - 1 && overlap(t.x0, t.x1, x0, first.x1) > 2 && first.y0 - t.y1 < lineH)
      .reduce((m, t) => Math.max(m, t.y1), -Infinity)
    const top = lead && multi ? first.y0 : Math.max(first.y0 - lineH, above + 0.5)
    // The next row starts right under it, from its left end: a separator between rows, not an answer line.
    if (texts.some((t) => t.y0 - lastRule.y0 > -1 && t.y0 - lastRule.y0 < 4 && Math.abs(t.x0 - first.x0) < 8)) continue
    // No room to write above it (text right on top): a separator under a paragraph, not an answer line.
    if (lastRule.y0 - top < lineH * 0.6) continue
    out.push({
      type: multi ? 'textarea' : typeFor(label),
      label,
      x: x0,
      y: top,
      w: first.x1 - x0,
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
    // A line heading a list asks nothing: "A manifold connection is:" over "-Secured with …", "-Not fully bolted";
    // "A. Senior manager familiar with:" over "A1. Company MOC procedure?" (a numbered question with a note under
    // it does ask).
    const below: PtText[] = []
    for (let u = t; below.length < 2; ) {
      const next = texts.find(
        (o) => o.y0 - u.y1 > -2 && o.y0 - u.y1 < lineH * 0.6 && o.x0 > t.x0 - 2 && o.x0 < t.x1 && !/:\s*$/.test(o.text),
      )
      if (!next) break
      below.push((u = next))
    }
    const heads = below.length === 2 || LIST_ITEM.test(below[0]?.text ?? '')
    if (heads && !GENERIC.test(cleanLabel(t.text)) && !/^\(?\d/.test(t.text)) continue
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
    // Down to the next line written under it, the label's own column too ("Comments:" under "1.1.2 Permit number:").
    const bottom = Math.min(
      cell.y1 - 1.5,
      ...texts.filter((o) => o.y0 > t.y1 && overlap(o.x0, o.x1, t.x0, right) > 0).map((o) => o.y0 - 1),
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
      const item = itemAbove(t)
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
      if (greyed({ x0: p.a, y0, x1: p.b, y1 })) continue
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
    if (clashes(taken, position)) continue
    taken.push(position)
    result.push({ type: s.type, label: s.label, source: 'ai', confidence: s.confidence, position })
  }
  return result
}
