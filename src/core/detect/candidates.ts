// Boxes the rules leave alone that may still be fields:
//   choice  answers printed in place of boxes ("Yes/No/NA"): the cell they are in, as a dropdown of them
//   fill    a light filled box with nothing written in it (a web-style input box)
//   blank   a blank table cell the rules found no name for
//   space   the empty space after a short label on its row
// Auto-detect never suggests them on its own (their prior is low): pattern learning does, once admins kept boxes
// like them, in any form (see ../learn/patterns.ts).

import { clashes, fitInPage, overlap } from '../coords'
import type { FieldDef, Position } from '../form-logic'
import type { Candidate, PageView } from '../learn'
import { cleanLabel, typeFor } from './labels'

// How likely each is a field before admins taught anything.
const PRIOR = { choice: 0.3, fill: 0.25, blank: 0.2, space: 0.15 }

/** The boxes only learning suggests on a page, where nothing is `taken` yet (fields, the rules' suggestions). */
export function latent(view: Omit<PageView, 'candidates'>, page: number, taken: Position[]): Candidate[] {
  const { width: W, height: H } = view
  const lines = view.lines.map((l) => ({
    ...l,
    x0: l.x * W,
    y0: l.y * H,
    x1: (l.x + l.width) * W,
    y1: (l.y + l.height) * H,
  }))
  const heights = lines.map((l) => l.y1 - l.y0).sort((a, b) => a - b)
  const lineH = Math.min(30, Math.max(9, (heights[heights.length >> 1] ?? 11.8) * 1.1))
  const em = lineH / 1.3
  const busy = [...taken]
  const out: Candidate[] = []
  const cellAt = (x: number, y: number) => view.cells.find((c) => x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1)
  const inside = (x0: number, y0: number, x1: number, y1: number) =>
    lines.filter((l) => {
      const [mx, my] = [(l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2]
      return mx > x0 && mx < x1 && my > y0 && my < y1
    })
  // What names a box: the text before it on its row, else the line just over it.
  const nameOf = (x0: number, y0: number, x1: number, y1: number) => {
    const row = lines
      .filter((l) => l.x1 <= x0 + 2 && x0 - l.x1 < W * 0.35 && overlap(l.y0, l.y1, y0, y1) > 0.5 * Math.min(l.y1 - l.y0, y1 - y0))
      .sort((a, b) => b.x1 - a.x1)[0]
    const above = lines
      .filter((l) => l.y1 <= y0 + 1 && y0 - l.y1 < lineH * 2 && overlap(l.x0, l.x1, x0, x1) > 0)
      .sort((a, b) => b.y1 - a.y1)[0]
    return cleanLabel(row?.text ?? '') || cleanLabel(above?.text ?? '')
  }
  const add = (kind: keyof typeof PRIOR, field: Pick<FieldDef, 'type' | 'label' | 'options'>, x0: number, y0: number, x1: number, y1: number) => {
    if (x1 - x0 < 4 || y1 - y0 < 4) return
    const position = fitInPage({ page, x: x0 / W, y: y0 / H, width: (x1 - x0) / W, height: (y1 - y0) / H })
    if (clashes(busy, position)) return
    busy.push(position)
    const prior = PRIOR[kind]
    out.push({ field: { ...field, source: 'ai', confidence: prior, position }, kind, prior })
  }

  for (const l of lines) {
    if (!l.choices) continue
    const cell = cellAt((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2)
    const [x0, y0, x1, y1] = cell ? [cell.x0 + 1.5, cell.y0 + 1.5, cell.x1 - 1.5, cell.y1 - 1.5] : [l.x0 - 2, l.y0 - 2, l.x1 + 2, l.y1 + 2]
    const options = l.text.split(/[/|]/).map((o) => o.trim()).filter(Boolean)
    add('choice', { type: 'dropdown', label: nameOf(x0, y0, x1, y1) || options.join(' / '), options }, x0, y0, x1, y1)
  }
  for (const r of view.rects) {
    if (!r.filled || r.stroked || r.w < em * 4 || r.w > W * 0.95 || r.h < lineH * 0.8 || r.h > lineH * 8) continue
    if (inside(r.x, r.y, r.x + r.w, r.y + r.h).length) continue
    const label = nameOf(r.x, r.y, r.x + r.w, r.y + r.h)
    add('fill', { type: r.h > lineH * 2.2 ? 'textarea' : typeFor(label), label }, r.x, r.y, r.x + r.w, r.y + r.h)
  }
  for (const c of view.cells) {
    const [w, h] = [c.x1 - c.x0, c.y1 - c.y0]
    if (w <= 20 || h <= 10 || w > W * 0.95 || inside(c.x0, c.y0, c.x1, c.y1).length) continue
    const label = nameOf(c.x0, c.y0, c.x1, c.y1)
    add('blank', { type: h > lineH * 2.2 ? 'textarea' : typeFor(label), label }, c.x0 + 1.5, c.y0 + 1.5, c.x1 - 1.5, c.y1 - 1.5)
  }
  for (const l of lines) {
    const t = l.text.trim()
    if (l.choices || t.length > 40 || !/\p{L}/u.test(t)) continue
    const cell = cellAt((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2)
    const next = lines.filter((o) => o !== l && o.x0 > l.x1 && overlap(o.y0, o.y1, l.y0, l.y1) > 0).map((o) => o.x0 - 4)
    const end = Math.min(cell ? cell.x1 - 2 : W - Math.min(36, W * 0.06), ...next)
    if (end - (l.x1 + 4) < em * 6) continue
    add('space', { type: typeFor(t), label: cleanLabel(t) }, l.x1 + 4, l.y0 - 1, end, l.y1 + 1)
  }
  return out
}
