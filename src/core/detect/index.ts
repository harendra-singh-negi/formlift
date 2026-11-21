// Auto-detect: suggested fields for every page of a PDF, no AI service needed.
//   page.ts      reads a pdf.js page: what it draws (shapes.ts) and its text
//   acroform.ts  a page with fillable fields of its own gets those, as they are
//   rules.ts     other pages are guessed from their drawing (checkboxes, table cells, answer lines…)
//   candidates.ts  boxes the rules leave alone that learning suggests once admins kept boxes like them
//   ../learn     what admins taught it before: pages set up before, labels changed, fields drawn by hand, and
//                what they do with boxes, by the boxes' cues (in any form)
// Suggestions get source 'ai' and a confidence, so the editor shows them as dashed boxes for the admin to check.

import type { FieldDef, Position, RowSerial } from '../form-logic'
import { findSerial } from '../form-logic/serial'
import { clashes } from '../coords'
import { keyFor, keyMaker } from '../fields'
import { toLines, type TextLine } from '../layout'
import {
  atPlaces,
  learnedFor,
  lessonFor as learnFrom,
  type Candidate,
  type EditSession,
  type Forget,
  type Lesson,
  type PageView,
  type Place,
  type Suggestion as Made,
} from '../learn'
import { ownFields } from './acroform'
import { latent } from './candidates'
import { cleanLabel, PRINTED_CHOICES } from './labels'
import { onDrawing, readDrawing, type PdfDoc, type PdfPage } from './page'
import { detectFields, proposals } from './rules'
import type { Ops, Seg, Shapes } from './shapes'

export { extractShapes, splitBoxChars, splitUnderscores, type Ops, type Rect, type Seg, type Shapes } from './shapes'
export { tableCells } from './tables'
export { detectFields, keyFor }

/** What a page proposes: a page with fillable fields of its own gets those; the others what its rules find. */
async function proposed(
  page: PdfPage,
  read: Awaited<ReturnType<typeof readDrawing>>,
  lines: TextLine[],
  n: number,
  existing: FieldDef[],
  prevText: string,
) {
  const own = await ownFields(page, lines, n)
  const taken = existing.filter((f) => f.position.page === n).map((f) => f.position)
  if (own.length)
    return {
      found: own.filter((s) => !clashes(taken, s.position)).map((field): Candidate => ({ field, kind: 'acroform', prior: 1 })),
      cells: [],
      own: true,
    }
  return { ...proposals(read.shapes, lines, read.size, n, existing, read.typed.rules, prevText), own: false }
}

/**
 * A page as learning sees it: its text, drawing, and every box proposed on it (also those only learning suggests, and
 * those at the `places` where admins drew fields).
 */
function viewOf(
  read: { shapes: Shapes; typed: { rules: Seg[] }; size: { width: number; height: number } },
  lines: TextLine[],
  { found, cells, own }: { found: Candidate[]; cells: PageView['cells']; own: boolean },
  n: number,
  taken: Position[],
  places: Place[] = [],
): PageView {
  const view: Omit<PageView, 'candidates'> = {
    ...read.size,
    lines: lines.map((l) => ({
      text: l.text,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      ...(PRINTED_CHOICES.test(l.text) && { choices: true }),
    })),
    cells,
    rects: read.shapes.rects,
    rules: [...read.shapes.hlines.filter((l) => !l.hair), ...read.typed.rules],
  }
  if (own) return { ...view, candidates: found }
  const more = latent(view, n, [...taken, ...found.map((c) => c.field.position)])
  const placed = atPlaces(view, places, n, taken, [...found, ...more])
  return { ...view, candidates: [...found, ...more, ...placed] }
}

/**
 * What a save taught auto-detect (see learn.ts), or null when it taught nothing. `pdf`: the pdf.js document;
 * `pages`: the layout's pages (`source` = the page of the PDF, null = a blank page). `OPS`: pdf.js OPS, so a page
 * remembers which of its fields sit on its boxes and lines (a page whose boxes changed is then not taken for it).
 * `forgotten`: what the admin told auto-detect to forget in this session (left out). `lessons`: the lessons the
 * session's detection used, so that what the admin did with the boxes they made it suggest is learnt too.
 * useFormEditor calls it after each save (`onLesson`).
 */
export function lessonFor(
  pdf: PdfDoc,
  pages: { source: number | null }[],
  session: EditSession,
  { OPS, ...options }: { at?: number; OPS?: Ops; forgotten?: Forget; lessons?: Lesson[] } = {},
) {
  const drawing =
    OPS &&
    (async (source: number) => {
      const { shapes, typed, size } = await readDrawing(await pdf.getPage(source), OPS)
      return onDrawing(shapes, typed.rules, size)
    })
  // A page the admin changed, as detection sees it on a blank form: what boxes teach is learnt from it.
  const view =
    OPS &&
    (async (source: number, n: number) => {
      const page = await pdf.getPage(source)
      const read = await readDrawing(page, OPS)
      const lines = toLines(read.typed.items, page.view, undefined, read.drawn.vlines)
      return viewOf(read, lines, await proposed(page, read, lines, n, [], ''), n, [])
    })
  return learnFrom(pdf, pages, session, { ...options, drawing, view })
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
 * (confidence LEARNT). Where admins taught what they do with boxes, a box is suggested, left out, typed and grouped
 * as they did with boxes like it in any form (confidence: how likely it is a field).
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
      const read = await readDrawing(page, OPS)
      const { drawn, shapes, typed, size } = read
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
      const made = await proposed(page, read, lines, i + 1, all, prevText)
      if (!learned) suggested.push(...made.found.map((c) => c.field))
      else {
        const view = learned.patterns ? viewOf(read, lines, made, i + 1, taken, learned.places) : null
        suggested.push(...learned.review(made.found, view, decided))
      }
      // Fields drawn by hand elsewhere: not on a page set up before (where the admin drew what they wanted).
      if (learned && !remembered)
        suggested.push(...learned.drawn(p.source, i + 1, [...taken, ...suggested.map((s) => s.position)]))
      for (const s of suggested) {
        const { ref, why, taught, ...field } = s
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `d${Date.now()}${Math.random()}`
        const key = keyOf(field.label, field.type)
        const f = { ...field, id, key, label: field.label || field.type }
        found.push(f)
        if (ref || why || taught) from.set(f, s)
      }
      // The page's last lines, bottom up: a heading under a note ("PART 1 – SUMMARY" / "(concise overview…)").
      const bottom = [...lines].sort((a, b) => b.y - a.y).slice(0, 2)
      prevText = bottom.map((l) => l.text).find((t) => t.length <= 60 || /:\s*$/.test(t)) ?? ''
    }
    onProgress?.(i + 1, pages.length)
  }
  return learned ? learned.link(found, from) : found
}

/**
 * The label for a box placed at `at` on layout page `n` (PDF page `source`): what auto-detect would call a box
 * there (a table cell: "Row – Column"), else the text on its left on the same line, else the text right above it.
 * '' when nothing names it. The editor names a pasted field with it.
 */
export async function labelAt(pdf: PdfDoc, OPS: Ops, source: number, n: number, at: Position): Promise<string> {
  const page = await pdf.getPage(source)
  const read = await readDrawing(page, OPS)
  const lines = toLines(read.typed.items, page.view, undefined, read.drawn.vlines)
  const { found } = await proposed(page, read, lines, n, [], '')
  return nameAt(at, found.map((c) => c.field), lines)
}

/**
 * The serial printed in a repeatable row ("10.", "(c)", "iv)") whose fields are at `row` on PDF page `source`, or
 * null (none, or a scanned page with no text). The editor stores it on the row (RepeatRow.serial).
 */
export async function serialAt(pdf: PdfDoc, OPS: Ops, source: number, row: Position[]): Promise<RowSerial | null> {
  const page = await pdf.getPage(source)
  const read = await readDrawing(page, OPS)
  return findSerial(row, toLines(read.typed.items, page.view, undefined, read.drawn.vlines))
}

/** labelAt for a page already read: its proposed boxes and its text lines. */
export function nameAt(at: Position, proposed: Pick<FieldDef, 'label' | 'position'>[], lines: TextLine[]): string {
  const over = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const area = Math.max(1e-9, at.width * at.height);
  const best = proposed
    .map((f) => {
      const p = f.position;
      return { f, share: (over(at.x, at.x + at.width, p.x, p.x + p.width) * over(at.y, at.y + at.height, p.y, p.y + p.height)) / area };
    })
    .filter((x) => x.share > 0.3 && x.f.label)
    .sort((a, b) => b.share - a.share)[0];
  if (best) return best.f.label;
  // The nearest words on its left on the same line, then the nearest ones above it (within three lines).
  const left = lines
    .filter((l) => l.x + l.width <= at.x + 0.01 && over(l.y, l.y + l.height, at.y, at.y + at.height) > 0.4 * l.height)
    .sort((a, b) => b.x + b.width - (a.x + a.width))[0];
  const above = lines
    .filter(
      (l) =>
        l.y + l.height <= at.y + 0.005 &&
        at.y - (l.y + l.height) < 3 * l.height &&
        over(l.x, l.x + l.width, at.x, at.x + at.width) > 0,
    )
    .sort((a, b) => b.y - a.y)[0];
  return cleanLabel((left ?? above)?.text ?? '');
}
