// A question's title from the document's own text: the question written on its line, a table's title and header
// row, the heading over a grid of boxes, and the text written beside boxes.

import type { FieldDef } from '../form-logic'
import type { TextLine } from '../layout'
import { bottom, colOf, COLUMN, left, norm, right, rowOf, top } from './question'

// The question written on the fields' line, left of them: the nearest column of text (not the item number or
// category columns further left), in reading order.
export function rowText(lines: TextLine[], fs: FieldDef[]) {
  const y0 = top(fs)
  const y1 = bottom(fs)
  const x = left(fs)
  // The fields' own names written beside them ("Yes ☐  No ☐") are not the question.
  const own = new Set(fs.map((f) => norm(f.label)))
  const beside = lines.filter(
    (l) =>
      l.y + l.height / 2 > y0 - 0.002 &&
      l.y + l.height / 2 < y1 + 0.002 &&
      l.x + l.width <= x + 0.005 &&
      !own.has(norm(l.text)),
  )
  if (!beside.length) return ''
  const nearest = beside.reduce((a, b) => (b.x + b.width > a.x + a.width ? b : a))
  return beside
    .filter((l) => l.x >= nearest.x - 0.02)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((l) => l.text.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
}

// A table's title: the nearest line above its first row that is at least half as wide as the row (a title or
// heading bar, not a single column header).
export function tableTitle(lines: TextLine[], first: FieldDef[]) {
  const y0 = top(first)
  const span = right(first) - left(first)
  const above = lines.filter((l) => l.y + l.height <= y0 + 0.002).sort((a, b) => b.y - a.y)
  let at: TextLine | undefined = above.find((l) => y0 - l.y < 0.15 && l.width >= 0.5 * span)
  // Up through the lines right above it (a note under the title runs on for lines): the block's first line.
  for (let cur = at; cur; cur = at) {
    const c: TextLine = cur
    at = above.find((l) => l.y < c.y - 0.001 && c.y - (l.y + l.height) < 0.6 * c.height) ?? c
    if (at === c) break
  }
  return at?.text.trim() ?? ''
}

// A grid of options ("Loading ☐  Discharging ☐ …"): lines of bare checkboxes named only by their own text. Its
// heading is the line right above the grid with no field on it ("OPERATIONS AT THE TIME OF INSPECTION:"), else
// the text left of the boxes on their line ("If the site was closed… ☐ Verified ☐ N/A").
// A " – " inside a name ("Log-24a (Job Orders – Wiring)") is part of the name when no two boxes share the part
// before it: a real "Row – Column" line repeats its row ("2.1.1 … – Y", "2.1.1 … – N").
export const isOptions = (line: FieldDef[]) => {
  const rows = line.map((f) => rowOf(f.label)).filter(Boolean)
  const shared = rows.length > 0 && (line.length < 2 || new Set(rows).size < rows.length)
  return (
    !shared &&
    line.every(
      (f) =>
        (f.type === 'checkbox' || f.type === 'radio') &&
        !COLUMN.test(f.label.trim()) &&
        !COLUMN.test(colOf(f.label).trim()),
    )
  )
}

export function heading(lines: TextLine[], line: FieldDef[], fields: FieldDef[]) {
  const y0 = top(line)
  const h = bottom(line) - y0
  const names = new Set(fields.map((f) => norm(f.label)))
  const free = (l: TextLine) => {
    const mid = l.y + l.height / 2
    return !names.has(norm(l.text)) && !fields.some((f) => mid > f.position.y && mid < f.position.y + f.position.height)
  }
  // The grid's width: its boxes and their names written beside them. A heading sits over it, not off to a side
  // ("Practical Guidelines" centred over a column of text is not the heading of boxes at the left edge).
  const own = new Set(line.map((f) => norm(f.label)))
  const named = lines.filter((l) => own.has(norm(l.text)) && l.y + l.height > y0 && l.y < y0 + h)
  const x0 = Math.min(left(line), ...named.map((l) => l.x))
  const x1 = Math.max(right(line), ...named.map((l) => l.x + l.width))
  // Text running on to the right of the boxes on their line ("☐ Human  The Inspector is expected to…"): the boxes
  // are a side column of a text block, not a grid of options.
  if (
    lines.some(
      (l) => !own.has(norm(l.text)) && l.x >= x1 - 0.002 && l.y + l.height / 2 > y0 && l.y + l.height / 2 < y0 + h,
    )
  )
    return null
  const upFrom = (y: number, gap: (l: TextLine) => number) =>
    lines
      .filter((l) => l.y + l.height <= y + 0.002 && y - (l.y + l.height) < gap(l) && l.x < x1 && l.x + l.width > x0)
      .sort((a, b) => b.y - a.y)[0]
  const above = upFrom(y0, (l) => 1.5 * Math.max(h, l.height))
  if (!above || !free(above)) return rowText(lines, line)
  // A heading of a few lines ("Qualifications" over "(tick all boxes that apply)"): the lines set tight above.
  const block = [above]
  for (let l = above; block.length < 3; ) {
    const up = upFrom(l.y, (u) => 0.6 * u.height)
    if (!up || !free(up)) break
    block.unshift((l = up))
  }
  return block.map((l) => l.text.trim()).join(' ')
}

// A table's header row: the line of text right above its first row, one name over each column ("Training
// Topic", "Name/Role", "Date"). Only when every column has its own name there; a single column's name is centred
// over it (the last line of a paragraph above starts at the margin instead).
export function headerRow(lines: TextLine[], first: FieldDef[]) {
  const y0 = top(first)
  const h = bottom(first) - y0
  const above = lines.filter((l) => l.y + l.height <= y0 + 0.002 && y0 - (l.y + l.height) < 1.5 * Math.max(h, l.height))
  const at = Math.max(...above.map((l) => l.y))
  const row = above.filter((l) => Math.abs(l.y - at) < 0.5 * l.height)
  const names = first.map((f) => {
    const over = row.filter((l) => {
      const mid = l.x + l.width / 2
      return mid > f.position.x && mid < f.position.x + f.position.width
    })
    const one = over.length === 1 ? over[0] : null
    const centred =
      one && Math.abs(one.x + one.width / 2 - (f.position.x + f.position.width / 2)) < 0.1 * f.position.width
    return one && (first.length > 1 || centred) ? one.text.trim() : ''
  })
  return names.every(Boolean) ? names : null
}

// The text written right of boxes on their line (their own names aside), and its lines wrapped under it, until
// the next box's line or a gap. A wrapped line may start in the boxes' column ("(tick as appropriate) certificates
// and…" read as one line across both columns): the part left of the text's column is cut off, at a word break.
export function sideText(lines: TextLine[], boxes: FieldDef[], fields: FieldDef[]) {
  const [y0, y1, x1] = [top(boxes), bottom(boxes), right(boxes)]
  const own = new Set(boxes.map((f) => norm(f.label)))
  const first = lines
    .filter((l) => l.x >= x1 - 0.002 && l.y + l.height / 2 > y0 && l.y + l.height / 2 < y1 && !own.has(norm(l.text)))
    .sort((a, b) => a.x - b.x)[0]
  if (!first) return ''
  const x = first.x
  const others = fields.filter((f) => !boxes.includes(f))
  const out = [first.text.trim()]
  for (let cur = first, k = 0; k < 5; k++) {
    const c = cur
    const next = lines.find(
      (l) =>
        l.y > c.y + c.height / 2 &&
        l.y - (c.y + c.height) < 0.6 * c.height &&
        l.x < x + 0.02 &&
        l.x + l.width > x + 0.02 &&
        !others.some((f) => f.position.y < l.y + l.height && f.position.y + f.position.height > l.y),
    )
    if (!next) break
    let t = next.text.trim()
    if (next.x < x - 0.01) {
      // Cut at the word break nearest to where the column starts, by the share of the line's width.
      const at = Math.round(((x - next.x) / next.width) * t.length)
      const breaks = [...t.matchAll(/ /g)].map((m) => m.index!)
      if (!breaks.length) break
      t = t.slice(breaks.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a)) + 1)
    }
    out.push(t)
    cur = next
  }
  return out.join(' ').replace(/\s+/g, ' ')
}
