// Auto-detect: suggested fields for every page of a PDF, no AI service needed.
//   page.ts      reads a pdf.js page: what it draws (shapes.ts) and its text
//   acroform.ts  a page with fillable fields of its own gets those, as they are
//   rules.ts     other pages are guessed from their drawing (checkboxes, table cells, answer lines…)
//   ../learn     what admins taught it before: pages set up before, labels changed, fields drawn by hand
// Suggestions get source 'ai' and a confidence, so the editor shows them as dashed boxes for the admin to check.

import type { FieldDef } from '../form-logic'
import { clashes } from '../coords'
import { keyFor, keyMaker } from '../fields'
import { toLines } from '../layout'
import { learnedFor, lessonFor as learnFrom, type EditSession, type Forget, type Lesson, type Suggestion as Made } from '../learn'
import { ownFields } from './acroform'
import { onDrawing, readDrawing, type PdfDoc } from './page'
import { detectFields } from './rules'
import type { Ops } from './shapes'

export { extractShapes, splitBoxChars, splitUnderscores, type Ops, type Rect, type Seg, type Shapes } from './shapes'
export { tableCells } from './tables'
export { detectFields, keyFor }

/**
 * What a save taught auto-detect (see learn.ts), or null when it taught nothing. `pdf`: the pdf.js document;
 * `pages`: the layout's pages (`source` = the page of the PDF, null = a blank page). `OPS`: pdf.js OPS, so a page
 * remembers which of its fields sit on its boxes and lines (a page whose boxes changed is then not taken for it).
 * `forgotten`: what the admin told auto-detect to forget in this session (left out). useFormEditor calls it after
 * each save (`onLesson`).
 */
export function lessonFor(
  pdf: PdfDoc,
  pages: { source: number | null }[],
  session: EditSession,
  { OPS, ...options }: { at?: number; OPS?: Ops; forgotten?: Forget } = {},
) {
  const drawing =
    OPS &&
    (async (source: number) => {
      const { shapes, typed, size } = await readDrawing(await pdf.getPage(source), OPS)
      return onDrawing(shapes, typed.rules, size)
    })
  return learnFrom(pdf, pages, session, { ...options, drawing })
}

/**
 * Suggested fields for every page of a layout (original pages only; blank pages have nothing to detect).
 * A page with fillable fields of its own (an AcroForm) gets those, as they are; other pages are detected from their
 * drawing. Runs page by page so the page stays responsive; `onProgress(done, total)`; stop early with `signal`.
 * New fields get ids and keys; existing fields are never duplicated.
 * `lessons`: what earlier saves taught (see learn.ts). A page set up before gets its fields back as they were
 * (confidence REMEMBERED), with their conditions and follow-ups, plus what auto-detect finds there now where the
 * admin kept or removed nothing; other suggestions get the admin's changes for their label, or are left out, and
 * fields the admin drew by hand next to a line in other forms are drawn there on pages not set up before
 * (confidence LEARNT).
 */
export async function detectDocument(
  pdf: PdfDoc,
  OPS: Ops,
  pages: { source: number | null; width: number; height: number }[],
  existing: FieldDef[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  lessons?: Lesson[],
): Promise<FieldDef[]> {
  const found: FieldDef[] = []
  // The suggestions that learning made, for the fields made of them.
  const from = new Map<FieldDef, Made>()
  const learned = lessons?.length
    ? await learnedFor(lessons, pdf, pages.flatMap((p) => (p.source ? [p.source] : [])), pages.length)
    : null
  let prevText = ''
  const keyOf = keyMaker(existing.map((f) => f.key))
  for (let i = 0; i < pages.length; i++) {
    if (signal?.aborted) break
    const p = pages[i]
    if (!p.source) prevText = ''
    else {
      const page = await pdf.getPage(p.source)
      const { drawn, shapes, typed, size } = await readDrawing(page, OPS)
      const all = [...existing, ...found]
      // Text on both sides of a column line is in two cells: "Tagged Role | Manager" is not one line.
      const lines = toLines(typed.items, page.view, undefined, drawn.vlines)
      const remembered = learned?.remembered(p.source, i + 1, onDrawing(shapes, typed.rules, size))
      const taken = all.filter((f) => f.position.page === i + 1).map((f) => f.position)
      const suggested: Made[] = []
      // A page set up before: its fields as they were (overlaps among them too), where nothing is placed yet.
      if (remembered) suggested.push(...remembered.fields.filter((s) => s.dialogOnly || !clashes(taken, s.position)))
      // What the admin decided on that page (kept, changed, removed) is not suggested again; what auto-detect finds
      // now and did not then still is.
      const decided = remembered ? [...remembered.fields.map((s) => s.position), ...remembered.removed] : []
      // A page with fillable fields of its own gets those; guessing from the drawing is for the other pages.
      const own = await ownFields(page, lines, i + 1)
      const made = own.length
        ? own.filter((s) => !clashes(taken, s.position))
        : detectFields(shapes, lines, size, i + 1, all, typed.rules, prevText)
      for (const s of made) {
        if (clashes(decided, s.position)) continue
        const t = learned ? learned.adjust(s) : s
        if (t) suggested.push(t)
      }
      // Fields drawn by hand elsewhere: not on a page set up before (where the admin drew what they wanted).
      if (learned && !remembered)
        suggested.push(...learned.drawn(p.source, i + 1, [...taken, ...suggested.map((s) => s.position)]))
      for (const s of suggested) {
        const { ref, why, ...field } = s
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `d${Date.now()}${Math.random()}`
        const key = keyOf(field.label, field.type)
        const f = { ...field, id, key, label: field.label || field.type }
        found.push(f)
        if (ref || why) from.set(f, s)
      }
      // The page's last lines, bottom up: a heading under a note ("PART 1 – SUMMARY" / "(concise overview…)").
      const bottom = [...lines].sort((a, b) => b.y - a.y).slice(0, 2)
      prevText = bottom.map((l) => l.text).find((t) => t.length <= 60 || /:\s*$/.test(t)) ?? ''
    }
    onProgress?.(i + 1, pages.length)
  }
  return learned ? learned.link(found, from) : found
}
