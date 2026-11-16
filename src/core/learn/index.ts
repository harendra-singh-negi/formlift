// Auto-detect that learns from the admin's corrections. No AI service, and nothing is sent anywhere.
// When the admin saves, the editor compares what auto-detect suggested with what was saved and writes it down as a
// Lesson: plain JSON that your app stores (its database, a JSON file on its server, or localStorage) and passes
// back, with every lesson before it, to the next detection. Each kind of learning is one module that makes its part
// of a lesson from a session (…Of) and applies what all lessons know at detection (…For):
//   pages.ts      a page the admin set up comes back as saved: in a new revision of the form, or in any form that has
//                 the same page (text.ts: a page's text, kept as hashes; picture.ts: a scan, known by its ink)
//   labels.ts     what the admin changed about a label's suggestions (type, settings) applies to that label in every
//                 form, and a label deleted in the last two forms that had it is left out
//   drawn.ts      a field drawn by hand next to a line of text twice is drawn next to that line in every form
//   conditions.ts conditions and follow-ups come back with their page, pointing at the fields they were set up with
// lesson.ts holds the JSON format and its check; knowledge.ts merges all lessons (after what was forgotten) and sums
// them up for the editor's Learnt tab.

import type { FieldDef } from '../form-logic'
import { renamed } from './conditions'
import { drawnFor, drawnOf } from './drawn'
import { knowledge } from './knowledge'
import { adjust, notesOf } from './labels'
import { CONDITIONS, validateLesson, type EditSession, type Forget, type Lesson, type Suggestion } from './lesson'
import { memoryOf, pagesFor, touchedPages, type Drawing } from './pages'
import { labelHash, type TextPdf } from './text'

export { learnt, type Learnt } from './knowledge'
export {
  addLesson,
  forgetting,
  LEARNT,
  REMEMBERED,
  validateLesson,
  type DrawnNote,
  type EditSession,
  type FieldSettings,
  type Forget,
  type LabelNote,
  type Lesson,
  type Mark,
  type PageMemory,
  type RememberedField,
  type SettingsChange,
  type Suggestion,
} from './lesson'

/**
 * What a save taught auto-detect, or null when it taught nothing. `pdf`: the pdf.js document; `pages`: the layout's
 * pages (`source` = the page of the PDF, null = a blank page). `drawing`: whether a box sits on a page's boxes and
 * lines; `forgotten`: what the admin told auto-detect to forget in this session (left out). Use the lessonFor of
 * detect.ts, which reads the drawing: useFormEditor calls it after each save (`onLesson`).
 */
export async function lessonFor(
  pdf: TextPdf,
  pages: { source: number | null }[],
  session: EditSession,
  { at = Date.now(), drawing, forgotten }: { at?: number; drawing?: Drawing; forgotten?: Forget } = {},
): Promise<Lesson | null> {
  const { notes, kept, used } = notesOf(session, touchedPages(session))
  const memory = await memoryOf(pdf, pages, session, drawing)
  const forgot = new Set([...(forgotten?.labels ?? []), ...(forgotten?.drawn ?? [])])
  const labels = notes.filter((n) => !forgot.has(labelHash(n.label)))
  const keep = kept.filter((h) => !forgot.has(h))
  const drawn = (await drawnOf(pdf, pages, session, used)).filter((d) => !forgot.has(d.line))
  if (!labels.length && !keep.length && !memory.length && !drawn.length) return null
  return {
    version: 1,
    id: session.id,
    at,
    labels,
    ...(keep.length > 0 && { kept: keep }),
    pages: memory,
    ...(drawn.length > 0 && { drawn }),
  }
}

// Why learning made each field of a detection: what to forget to undo it. Only for this session's fields.
const whys = new WeakMap<FieldDef, Forget>()
/** What learning did to make a field auto-detect suggested in this session (what to forget to undo it). */
export const whyLearnt = (field: FieldDef) => whys.get(field)

/**
 * The lessons, ready for one detection run over `pdf` (its pages `sources`; `pageCount` pages in the layout).
 * null when there is nothing to learn from.
 */
export async function learnedFor(lessons: Lesson[] | undefined, pdf: TextPdf, sources: number[], pageCount: number) {
  // Skips lessons it cannot use. Size limits are for your server (validateLesson with your limits), not for this.
  const unlimited = { maxFields: Infinity, maxPages: Infinity }
  const valid = (lessons ?? []).filter((l) => !validateLesson(l, unlimited).length)
  if (!valid.length) return null
  const { votes, drawn: notes, memories } = knowledge(valid)
  const pages = await pagesFor(memories, pdf, sources)
  const hand = await drawnFor(notes, votes, pdf, sources, pageCount)
  return {
    /**
     * The fields of a page set up before, placed on layout page `page`, and where the admin removed fields; null
     * when the page is new.
     */
    remembered: pages.remembered,
    /** `s` with what the admin changed for its label, or null to leave it out. */
    adjust: (s: Suggestion) => adjust(votes, s, pageCount),
    /** Fields the admin drew by hand next to a line of this page in other forms, where there is room for them. */
    drawn: hand.drawn,
    link,
  }
}

/**
 * The fields of a detection (`from`: the suggestion each was made of), with the conditions and follow-ups of
 * pages set up before pointing at the fields they were set up with. One whose fields did not all come back is
 * left out, and so is a follow-up's question nobody asks any more.
 */
function link(found: FieldDef[], from: Map<FieldDef, Suggestion>): FieldDef[] {
  const keyOf = new Map<string, string>()
  for (const [f, s] of from) if (s.ref) keyOf.set(s.ref, f.key)
  const to = (ref: string) => keyOf.get(ref)
  const out = found.map((f) => {
    if (!from.get(f)?.ref) return f
    const g: FieldDef = { ...f }
    for (const k of CONDITIONS)
      if (g[k]) {
        const c = renamed(g[k], to)
        if (c) g[k] = c
        else delete g[k]
      }
    if (g.followUp) {
      const when = renamed(g.followUp.when, to)
      const fields = g.followUp.fields.flatMap((k) => to(k) ?? [])
      if (when && fields.length) g.followUp = { ...g.followUp, when, fields }
      else delete g.followUp
    }
    return g
  })
  const asked = new Set(out.flatMap((f) => f.followUp?.fields ?? []))
  return out.filter((g, i) => {
    const s = from.get(found[i])
    if (g.dialogOnly && s?.ref && !asked.has(g.key)) return false
    if (s?.why) whys.set(g, s.why)
    return true
  })
}
