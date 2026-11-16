// Fields drawn by hand next to a line of text (their label): once an admin has drawn one next to the same line twice,
// it is drawn there in every form, where there is room for it.

import { clashes, fitInPage, overlap } from '../coords'
import { validateFields, type FieldDef, type Position } from '../form-logic'
import { applyChange, verdict, type Vote } from './labels'
import { LEARNT, settingsOf, type DrawnNote, type EditSession, type Suggestion } from './lesson'
import { labelKey, r1, textOf, type Line, type PageText, type TextPdf } from './text'

// A field drawn by hand next to the same line this many times (on pages of one form or in several) is drawn there
// in every form.
export const DRAWN_TIMES = 2

/** How many times the admin drew a field next to a line, over its notes. */
export const timesOf = (notes: { note: DrawnNote }[]) => notes.reduce((n, { note }) => n + (note.times ?? 1), 0)

/** Fields drawn by hand next to a line of text (their label): on the line's row after it, or right under it. */
export async function drawnOf(
  pdf: TextPdf,
  pages: { source: number | null }[],
  s: EditSession,
  used: Set<FieldDef>,
): Promise<DrawnNote[]> {
  const given = new Set([...s.before, ...s.suggested].map((f) => f.id))
  const sourceOf = (f: FieldDef) => pages[f.position.page - 1]?.source
  const drawn = s.saved.filter((f) => !given.has(f.id) && !f.dialogOnly && !used.has(f) && sourceOf(f))
  if (!drawn.length) return []
  const texts = await textOf(pdf, [...new Set(drawn.map((f) => sourceOf(f)!))])
  const out = new Map<string, DrawnNote>()
  for (const d of drawn) {
    const { lines, width: W, height: H } = texts.get(sourceOf(d)!)!
    const pts = (p: Position) => [p.x * W, p.y * H, (p.x + p.width) * W, (p.y + p.height) * H]
    const [x0, y0, x1, y1] = pts(d.position)
    const boxes = lines.map((l) => ({ l, b: [l.x * W, l.y * H, (l.x + l.w) * W, (l.y + l.ht) * H] }))
    const row = boxes
      .filter(
        ({ b }) =>
          b[2] <= x0 + 2 && x0 - b[2] <= W / 2 && overlap(b[1], b[3], y0, y1) >= 0.5 * Math.min(b[3] - b[1], y1 - y0),
      )
      .sort((a, b) => b.b[2] - a.b[2])[0]
    // A label over a field starts where the field starts.
    const above = boxes
      .filter(({ b }) => b[3] <= y0 + 2 && y0 - b[3] <= 3 * (b[3] - b[1]) && Math.abs(b[0] - x0) <= 15)
      .sort((a, b) => b.b[3] - a.b[3])[0]
    // Its label: the line right before it on its row, else the one over it, else a line further along its row (a
    // question with its answer at the far end; but not another column's line when the field has one over it).
    const close = row && x0 - row.b[2] <= 3 * (row.b[3] - row.b[1])
    const at = close ? row : (above ?? row)
    if (!at || at.l.text.trim().length > 80 || !/\p{L}/u.test(at.l.text)) continue
    const side = at === row ? 'right' : 'below'
    const [lx0, ly0, lx1, ly1] = at.b
    // Another field between the line and this one: the line names that one.
    const between = s.saved
      .filter((f) => f !== d && f.position.page === d.position.page && !f.dialogOnly)
      .map((f) => pts(f.position))
      .some((o) =>
        side === 'right'
          ? o[0] >= lx1 - 2 && o[2] <= x0 + 2 && overlap(o[1], o[3], y0, y1) > 0
          : o[1] >= ly1 - 2 && o[3] <= y0 + 2 && overlap(o[0], o[2], x0, x1) > 0,
      )
    if (between) continue
    // Drawn next to this line before in this session (another page of the form): once more.
    const again = out.get(at.l.h)
    if (again) {
      again.times = (again.times ?? 1) + 1
      continue
    }
    const covers = boxes.filter(({ l, b }) => {
      const [cx, cy] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
      return l !== at.l && cx > x0 && cx < x1 && cy > y0 && cy < y1
    }).length
    out.set(at.l.h, {
      line: at.l.h,
      side,
      box: [r1(side === 'right' ? x0 - lx1 : x0 - lx0), r1(side === 'right' ? y0 - ly0 : y0 - ly1), r1(x1 - x0), r1(y1 - y0)],
      settings: settingsOf(d),
      ...(covers > 0 && { covers }),
    })
  }
  return [...out.values()]
}

/**
 * Fields drawn by hand (`notes`, per line) ready for the pages `sources` of `pdf`: `drawn` draws them next to the same
 * lines, once an admin drew them there DRAWN_TIMES times, with what was learnt about their label (`votes`).
 */
export async function drawnFor(
  notes: Map<string, { at: number; note: DrawnNote }[]>,
  votes: Map<string, Vote[]>,
  pdf: TextPdf,
  sources: number[],
  pageCount: number,
) {
  const drawnHere = new Map([...notes].filter(([, n]) => timesOf(n) >= DRAWN_TIMES))
  const texts = drawnHere.size ? await textOf(pdf, sources) : new Map<number, PageText>()
  return {
    /** Fields the admin drew by hand next to a line of this page in other forms, where there is room for them. */
    drawn(source: number, page: number, taken: Position[]): Suggestion[] {
      const t = texts.get(source)
      if (!t || !drawnHere.size) return []
      const { lines, width: W, height: H } = t
      const out: Suggestion[] = []
      for (const l of lines) {
        const notes = drawnHere.get(l.h)
        if (!notes) continue
        const { side, box, settings, covers = 0 } = notes[notes.length - 1].note
        const [dx, dy, w, h] = box
        const x = side === 'right' ? (l.x + l.w) * W + dx : l.x * W + dx
        const y = side === 'right' ? l.y * H + dy : (l.y + l.ht) * H + dy
        // As wide as there is room for: up to the next text on its row, or the page's edge. (Text at its start, like
        // a code printed in its box, is counted below instead.)
        const room =
          Math.min(
            W,
            ...lines
              .filter((o) => o !== l && o.x * W > x + 0.4 * w && overlap(o.y * H, (o.y + o.ht) * H, y, y + h) > 0)
              .map((o) => o.x * W - 3),
          ) - x
        const width = Math.min(w, room)
        if (width < Math.max(10, 0.4 * w) || x < 0 || y < 0 || y + h > H) continue
        // More text inside it than where it was drawn: this form uses that place for something else.
        const inside = (o: Line) => {
          const [cx, cy] = [(o.x + o.w / 2) * W, (o.y + o.ht / 2) * H]
          return cx > x && cx < x + width && cy > y && cy < y + h
        }
        if (lines.filter((o) => o !== l && inside(o)).length > covers) continue
        const position = fitInPage({ page, x: x / W, y: y / H, width: width / W, height: h / H })
        if (clashes(taken, position)) continue
        // Named by the admin, or after its line.
        const label = labelKey(settings.label) ? settings.label : l.text.replace(/[\s:.*_]+$/, '').trim().slice(0, 255)
        const v = verdict(votes, label)
        if (v.drop) continue
        const s = applyChange({ ...settings, label, source: 'ai', confidence: LEARNT, position }, v.change)
        if (validateFields([{ ...s, id: 'x', key: 'x' }], pageCount).length) continue
        taken.push(position)
        out.push({ ...s, why: { drawn: [l.h], ...(v.keys.length > 0 && { labels: v.keys }) } })
      }
      return out
    },
  }
}
