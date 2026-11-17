// Categories ("HW", "PR": a code heading blocks of questions), sections (the numbered question a block belongs
// to) and tags ("Area: Engine") that the List view filters by.

import type { FieldDef } from '../form-logic'
import type { TextLine } from '../layout'
import { bottom, COLUMN, norm, type PageText, type Question, top } from './question'

// A category code written as a heading of its own over blocks of questions ("HW" / "PR" / "HF").
export const CODE = /^[A-Z]{2,4}$/

// Codes first on their line, with no other code after them (a header row "ROLE NAME DATE" is not), and not a
// running header or footer (same text at the same height on 3+ pages). The form has categories when at
// least two codes come back at least twice each; a question takes the last one above it, across page breaks.
export function setCategories(out: Question[], fields: FieldDef[], textOf: PageText, code: RegExp) {
  const last = Math.max(0, ...fields.map((f) => f.position.page))
  const found: { page: number; y: number; code: string }[] = []
  const isCode = (t: string) => code.test(t.trim()) && !COLUMN.test(t.trim())
  for (let page = 1; page <= last; page++) {
    const lines = textOf(page) ?? []
    for (const l of lines) {
      if (!isCode(l.text)) continue
      const beside = lines.filter((o) => o !== l && o.y < l.y + l.height && o.y + o.height > l.y)
      if (beside.some((o) => o.x < l.x || isCode(o.text))) continue
      found.push({ page, y: l.y, code: l.text.trim() })
    }
  }
  const marks = found.filter(
    (m) => found.filter((o) => o.page !== m.page && o.code === m.code && Math.abs(o.y - m.y) < 0.003).length < 2,
  )
  const times = new Map<string, number>()
  for (const m of marks) times.set(m.code, (times.get(m.code) ?? 0) + 1)
  if ([...times.values()].filter((t) => t >= 2).length < 2) return
  for (const q of out) q.category = lastAbove(q, marks)?.code
}

// The last mark (in document order) above a question, by its middle: a cell's answer boxes are centred in it,
// the first one may start above the heading.
export function lastAbove<T extends { page: number; y: number }>(q: Question, marks: T[]) {
  const own = q.parts.map((p) => p.field).filter((f) => f.position.page === q.page)
  const y = (top(own) + bottom(own)) / 2
  return marks.filter((m) => m.page < q.page || (m.page === q.page && m.y <= y)).at(-1)
}

// A numbered heading: "2.1.1 Maintenance of statutory Certificates" (two levels at least: "1. Site free…" is an
// item inside a question; "5.9.2 / 5.10.2" is an index).
export const NUMBERED = /^\d+(\.\d+)+\.?\s+\p{L}/u

// Numbered headings first on their line, with no field on it (a line with fields is a question itself): each
// question shows the heading it answers, carried over page breaks.
export function setSections(out: Question[], fields: FieldDef[], textOf: PageText) {
  const last = Math.max(0, ...fields.map((f) => f.position.page))
  const marks: { page: number; y: number; text: string }[] = []
  for (let page = 1; page <= last; page++) {
    const lines = textOf(page) ?? []
    const boxes = fields.filter((f) => f.position.page === page)
    const edge = Math.max(0, ...lines.map((o) => o.x + o.width))
    for (const l of lines) {
      const text = l.text.trim().replace(/\s+/g, ' ')
      if (!NUMBERED.test(text)) continue
      const across = (y: number, h: number) => y < l.y + l.height && y + h > l.y
      if (lines.some((o) => o !== l && o.x < l.x && across(o.y, o.height))) continue
      const free = (t: TextLine) =>
        !boxes.some((f) => f.position.y < t.y + t.height && f.position.y + f.position.height > t.y)
      if (!free(l)) continue
      // A heading wrapped onto the lines set tight under it: a line that ran to the text's right edge without
      // ending its sentence, or one the next line carries on in lower case (not a "Note:" after the heading).
      // Only lines in the heading's own text size: a picture's caption or watermark ("Sampl") is not part of it.
      // A heading cut by a picture or a box ("…was it free of" [photo] "any areas for concern?") carries on in the
      // first line of its size at its x under it, when that line starts in lower case and no field comes between.
      const parts = [text]
      const same = (o: TextLine) => Math.abs(o.height - l.height) < 0.3 * l.height
      for (let cur = l, k = 0; k < 4; k++) {
        const c = cur
        if (/[?.:!)]$/.test(c.text.trim())) break
        let next = lines.find(
          (o) =>
            o.y > c.y &&
            o.y - (c.y + c.height) < 0.5 * c.height &&
            o.x >= l.x - 0.01 &&
            o.x < l.x + l.width &&
            same(o) &&
            !NUMBERED.test(o.text.trim()) &&
            free(o),
        )
        if (next && !/^\p{Ll}/u.test(next.text.trim()) && c.x + c.width < l.x + 0.85 * (edge - l.x)) break
        if (!next) {
          const below = lines
            .filter((o) => o.y > c.y + c.height && Math.abs(o.x - l.x) < 0.01 && same(o))
            .sort((a, b) => a.y - b.y)[0]
          const between = boxes.some((f) => f.position.y > c.y && f.position.y < (below?.y ?? 0))
          if (below && /^\p{Ll}/u.test(below.text.trim()) && free(below) && !between) next = below
        }
        if (!next) break
        parts.push(next.text.trim())
        cur = next
      }
      marks.push({ page, y: l.y, text: parts.join(' ').replace(/\s+/g, ' ') })
    }
  }
  // A numbered question's tags line (anywhere under its heading) applies to all of its questions. Only keys that
  // come back in two numbered questions or more are kept: a one-off "Name: …, Date: …" line is not a filter.
  const tagged = new Map<(typeof marks)[number], Record<string, string>>()
  for (let page = 1; page <= last; page++)
    for (const l of textOf(page) ?? []) {
      const tags = tagsOf(l.text)
      const mark = tags && marks.filter((m) => m.page < page || (m.page === page && m.y < l.y)).at(-1)
      if (mark) tagged.set(mark, { ...tagged.get(mark), ...tags })
    }
  const seen = new Map<string, number>()
  for (const t of tagged.values()) for (const k of Object.keys(t)) seen.set(k, (seen.get(k) ?? 0) + 1)
  for (const q of out) {
    const mark = lastAbove(q, marks)
    q.section = mark?.text
    if (q.section && !q.rows && !q.columns) pieceTitle(q, q.section, textOf(q.page) ?? [])
    const tags = Object.entries((mark && tagged.get(mark)) ?? {}).filter(([k]) => seen.get(k)! >= 2)
    if (tags.length) q.tags = Object.fromEntries(tags)
  }
}

// A card titled by a piece of its numbered question ("any areas for concern?", or the question cut short in a
// label): the question is in the heading over it, so the card is named by what its box is, the "Comments:" written
// on the box's line, else its part's name.
export function pieceTitle(q: Question, section: string, lines: TextLine[]) {
  const title = norm(q.title).replace(/[…]+$/, '')
  if (!title || !norm(section).includes(title)) return
  const f = q.parts[0].field
  const label = lines.find(
    (l) =>
      /^[^:]{1,30}:$/.test(l.text.trim()) && l.y < f.position.y + f.position.height && l.y + l.height > f.position.y,
  )
  const name = label?.text.trim().slice(0, -1) || (q.parts.length === 1 ? q.parts[0].name : '')
  if (!name) return
  q.title = name
  if (q.parts.length === 1 && norm(q.parts[0].name) === norm(name)) q.parts = [{ ...q.parts[0], name: '' }]
}

// "Key: Value , Key: Value": two pairs at least, short keys (up to 3 words) and values.
export const PAIR = /^\s*(\p{L}[\p{L} ]{0,24}?)\s*:\s*([^,:]{1,40}?)\s*$/u
export function tagsOf(text: string) {
  const parts = text.split(',')
  if (parts.length < 2) return null
  const pairs = parts.map((p) => PAIR.exec(p))
  if (pairs.some((m) => !m || m[1].trim().split(/\s+/).length > 3)) return null
  return Object.fromEntries(pairs.map((m) => [m![1].trim(), m![2].trim()]))
}
