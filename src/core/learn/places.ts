// Places: where admins draw fields that auto-detect proposed nothing for, next to a line of text (after it on its
// row, or under it), measured in the page's own letters and lines. At detection every place is tried next to every
// line of every page, where there is room, as a box of kind 'drawn'; pattern learning (patterns.ts) suggests the
// boxes like those admins drew and leaves out the others, so a field drawn under "Describe the work carried out:"
// in one form is suggested under "Give details of the incident:" in another. The lines where admins drew nothing
// are its examples of where not to. (A field drawn next to the same line twice is also put back there as it was
// drawn, with its settings: drawn.ts.)

import { clashes, fitInPage, overlap } from '../coords'
import { cleanLabel, typeFor } from '../detect/labels'
import type { Position } from '../form-logic'
import { prepare, type Candidate, type PageView, type PtLine } from './cues'

/**
 * A place, next to a line of text: on its row after it ('r') or under it ('b'); how far from the line's end (r) or
 * start (b) and from its top (r) or bottom (b), in letters and lines of the page; its width in letters (0: up to the
 * next text, the cell's edge or the margin) and its height in lines; and the shape of the line (see shapeOf): it is
 * tried next to lines of that shape only.
 */
export type Place = [side: 'r' | 'b', dx: number, dy: number, w: number, h: number, line: number]

// The shape of a line a field is drawn next to: ends with ":" (1), is short (2), is the first text on its row (4).
// "Remarks:" alone on its row is not "Page 1 of 52", "B3" or a question in a table's second column.
// ponytail: three bits; let the model weigh the line's cues instead once lessons hold real pages' negatives.
const shapeOf = (l: PtLine, lines: PtLine[]) =>
  (/:\s*$/.test(l.text) ? 1 : 0) |
  (l.text.trim().length <= 40 ? 2 : 0) |
  (lines.some((o) => o !== l && o.x1 <= l.x0 + 2 && overlap(o.y0, o.y1, l.y0, l.y1) > 0.5 * (l.y1 - l.y0)) ? 0 : 4)

// How likely a box at a place is a field before admins taught anything: below every kind the rules leave alone.
const PRIOR = 0.1
// The places detection tries, the most taught first.
// ponytail: a fixed cap keeps a long form fast (lines × places boxes a page); rank by the model's weights if 8 is short.
const MAX_PLACES = 8

const round = (v: number, step: number) => Math.round(v / step) * step
const named = (l: PtLine) => !l.choices && l.text.trim().length <= 80 && /\p{L}/u.test(l.text)

/** Where the room for a box starting at x (from y to bottom) ends: the next text on its rows, its cell's edge, the margin. */
function roomEnd(view: Omit<PageView, 'candidates'>, lines: PtLine[], x: number, y: number, bottom: number) {
  const W = view.width
  const cell = view.cells.find((c) => x + 1 > c.x0 && x + 1 < c.x1 && (y + bottom) / 2 > c.y0 && (y + bottom) / 2 < c.y1)
  const next = lines.filter((l) => l.x0 > x + 2 && overlap(l.y0, l.y1, y, bottom) > 0).map((l) => l.x0 - 3)
  return { end: Math.min(cell ? cell.x1 - 1.5 : W - Math.min(36, W * 0.06), ...next), cell }
}

/**
 * The places of fields drawn by hand (`drawn`) on a page, next to their label: the line just before one on its row,
 * else the line just over it (where it starts). Not when another field (`fields`) sits between the two.
 */
export function placesOf(view: Omit<PageView, 'candidates'>, drawn: Position[], fields: Position[]): Place[] {
  const { lines, lineH, em } = prepare(view)
  const { width: W, height: H } = view
  const pts = (p: Position) => [p.x * W, p.y * H, (p.x + p.width) * W, (p.y + p.height) * H]
  const out: Place[] = []
  for (const p of drawn) {
    const [x0, y0, x1, y1] = pts(p)
    const row = lines
      .filter((l) => l.x1 <= x0 + 2 && x0 - l.x1 <= 3 * lineH && overlap(l.y0, l.y1, y0, y1) >= 0.5 * Math.min(l.y1 - l.y0, y1 - y0))
      .sort((a, b) => b.x1 - a.x1)[0]
    const above = lines
      .filter((l) => l.y1 <= y0 + 2 && y0 - l.y1 <= 3 * lineH && Math.abs(l.x0 - x0) <= 2 * em)
      .sort((a, b) => b.y1 - a.y1)[0]
    const at = row ?? above
    if (!at || !named(at)) continue
    const side = at === row ? 'r' : 'b'
    const between = fields
      .filter((f) => f !== p)
      .map(pts)
      .some((o) =>
        side === 'r'
          ? o[0] >= at.x1 - 2 && o[2] <= x0 + 2 && overlap(o[1], o[3], y0, y1) > 0
          : o[1] >= at.y1 - 2 && o[3] <= y0 + 2 && overlap(o[0], o[2], x0, x1) > 0,
      )
    if (between) continue
    const { end } = roomEnd(view, lines.filter((l) => l !== at), x0, y0, y1)
    out.push([
      side,
      round((x0 - (side === 'r' ? at.x1 : at.x0)) / em, 0.5),
      round((y0 - (side === 'r' ? at.y0 : at.y1)) / lineH, 0.25),
      x1 >= end - em ? 0 : Math.max(1, Math.round((x1 - x0) / em)),
      Math.max(0.5, round((y1 - y0) / lineH, 0.25)),
      shapeOf(at, lines),
    ])
  }
  return out
}

/** The places most taught (by how many lessons have each), as detection tries them. */
export function placesFor(taught: Place[][]): Place[] {
  const count = new Map<string, { place: Place; n: number }>()
  for (const list of taught)
    for (const key of new Set(list.map((p) => JSON.stringify(p)))) {
      const c = count.get(key)
      if (c) c.n++
      else count.set(key, { place: JSON.parse(key) as Place, n: 1 })
    }
  return [...count.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_PLACES)
    .map((c) => c.place)
}

// Boxes proposed only for learning to judge: they do not answer a line the way the rules' boxes do.
const TRIED = new Set(['choice', 'fill', 'blank', 'space', 'drawn'])

/**
 * The boxes at `places` next to the lines of a page, where nothing is yet: no field (`taken`), no box `proposed`. Not
 * next to a line that a field or a rule's box already answers (on its row, in it or right after it): a label names
 * one field.
 */
export function atPlaces(
  view: Omit<PageView, 'candidates'>,
  places: Place[],
  page: number,
  taken: Position[],
  proposed: Candidate[],
): Candidate[] {
  if (!places.length) return []
  const { lines, lineH, em } = prepare(view)
  const { width: W, height: H } = view
  const busy = [...taken, ...proposed.map((c) => c.field.position)]
  const answers = [...taken, ...proposed.filter((c) => !TRIED.has(c.kind)).map((c) => c.field.position)]
    .filter((p) => p.page === page)
    .map((p) => [p.x * W, p.y * H, (p.x + p.width) * W, (p.y + p.height) * H])
  const out: Candidate[] = []
  for (const l of lines) {
    if (!named(l)) continue
    const others = lines.filter((o) => o !== l)
    // Answered: a box on its row, in it or after it, before the next text there.
    const row = (y0: number, y1: number) => overlap(y0, y1, l.y0, l.y1) > 0.5 * (l.y1 - l.y0)
    const next = Math.min(...others.filter((o) => o.x0 >= l.x1 - 2 && row(o.y0, o.y1)).map((o) => o.x0), l.x1 + 0.35 * W)
    if (answers.some(([x0, y0, x1, y1]) => row(y0, y1) && x1 > l.x0 && x0 < next)) continue
    const [mx, my] = [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2]
    const home = view.cells.find((c) => mx > c.x0 && mx < c.x1 && my > c.y0 && my < c.y1)
    const shape = shapeOf(l, lines)
    for (const [side, dx, dy, w, h, line] of places) {
      if (line !== shape) continue
      const x = (side === 'r' ? l.x1 : l.x0) + dx * em
      const y = (side === 'r' ? l.y0 : l.y1) + dy * lineH
      const { end, cell } = roomEnd(view, others, x, y, y + h * lineH)
      // Under a line in a table's cell: in that cell (not under the table).
      if (side === 'b' && home && cell !== home) continue
      // In a cell: no further than its bottom; not in the page's bottom margin.
      const bottom = Math.min(y + h * lineH, cell ? cell.y1 - 1.5 : H - Math.min(36, H * 0.05))
      const width = w ? Math.min(w * em, end - x) : end - x
      if (x < 0 || y < 0 || bottom - y < 0.6 * h * lineH || width < Math.max(10, w ? 0.4 * w * em : 2 * em)) continue
      // Text in it: this form has something else there.
      if (others.some((o) => overlap(o.x0, o.x1, x, x + width) * overlap(o.y0, o.y1, y, bottom) > 0.2 * (o.x1 - o.x0) * (o.y1 - o.y0)))
        continue
      const position = fitInPage({ page, x: x / W, y: y / H, width: width / W, height: (bottom - y) / H })
      if (clashes(busy, position)) continue
      busy.push(position)
      const label = cleanLabel(l.text)
      const type = bottom - y > 2.2 * lineH ? 'textarea' : typeFor(label)
      out.push({ field: { type, label, source: 'ai', confidence: PRIOR, position }, kind: 'drawn', prior: PRIOR })
    }
  }
  return out
}

/** Whether a place is one: what a lesson that comes in may hold. */
export const okPlace = (p: unknown) =>
  Array.isArray(p) &&
  p.length === 6 &&
  (p[0] === 'r' || p[0] === 'b') &&
  p.slice(1).every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  Number.isInteger(p[5]) &&
  p[5] >= 0 &&
  p[5] <= 7 &&
  Math.abs(p[1]) <= 500 &&
  Math.abs(p[2]) <= 100 &&
  p[3] >= 0 &&
  p[3] <= 1000 &&
  p[4] > 0 &&
  p[4] <= 200
