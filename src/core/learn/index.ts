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
//   patterns.ts   what admins do with boxes is learnt by the boxes' cues (cues.ts: what is around a box, measured
//                 against the page's own text), so it carries over to forms auto-detect has never seen: boxes like
//                 those admins kept are suggested (also kinds the rules never suggest), boxes like those they deleted
//                 are not, and suggestions get the type, required and grouping admins gave boxes like them
//                 (model.ts: logistic regression and counts, trained here from the lessons in milliseconds)
//   places.ts     where admins draw fields that nothing was proposed for, next to their label: tried next to every
//                 label shaped like it in any form, and judged by patterns.ts like any other box
// lesson.ts holds the JSON format and its check; knowledge.ts merges all lessons (after what was forgotten) and sums
// them up for the editor's Learnt tab.

import { clashes } from '../coords'
import type { FieldDef, Position } from '../form-logic'
import { renamed } from './conditions'
import type { Candidate, PageView } from './cues'
import { drawnFor, drawnOf } from './drawn'
import { knowledge } from './knowledge'
import { adjust, notesOf, voted } from './labels'
import { CONDITIONS, validateLesson, type EditSession, type Forget, type Lesson, type Score, type Suggestion } from './lesson'
import { memoryOf, pagesFor, touchedPages, type Drawing } from './pages'
import { examplesOf, patternsFor } from './patterns'
import { placesFor } from './places'
import { labelHash, type TextPdf } from './text'

export type { Candidate, PageView } from './cues'
export type { Place } from './places'
export { learnt, type Learnt } from './knowledge'
export { atPlaces } from './places'
export {
  addLesson,
  forgetting,
  LEARNT,
  REMEMBERED,
  validateLesson,
  type DrawnNote,
  type EditSession,
  type Example,
  type FieldSettings,
  type Forget,
  type LabelNote,
  type Lesson,
  type Mark,
  type PageMemory,
  type RememberedField,
  type Score,
  type SettingsChange,
  type Suggestion,
} from './lesson'

// A suggestion still in place: it shares this much of its box with the field saved (intersection over union).
const STAYED = 0.7

/** What the session did with auto-detect's suggestions (null when it had none, or the admin started again). */
function scoreOf({ before, suggested, saved }: EditSession): Score | null {
  const shown = suggested.filter((f) => !f.dialogOnly)
  const kept = new Map(saved.map((f) => [f.id, f]))
  if (!shown.length || (shown.length >= 10 && shown.every((f) => !kept.has(f.id)))) return null
  const given = new Set([...before, ...suggested].map((f) => f.id))
  const iou = (a: Position, b: Position) => {
    const i =
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
    return a.page === b.page ? i / (a.width * a.height + b.width * b.height - i) : 0
  }
  let deleted = 0
  let changed = 0
  for (const s of shown) {
    const f = kept.get(s.id)
    if (!f) deleted++
    else if (
      f.type !== s.type ||
      f.label !== s.label ||
      !!f.required !== !!s.required ||
      JSON.stringify(f.options ?? null) !== JSON.stringify(s.options ?? null) ||
      f.group?.mode !== s.group?.mode ||
      iou(f.position, s.position) < STAYED
    )
      changed++
  }
  const fields = saved.filter((f) => !f.dialogOnly)
  return { fields: fields.length, suggested: shown.length, deleted, changed, drawn: fields.filter((f) => !given.has(f.id)).length }
}

/**
 * What a save taught auto-detect, or null when it taught nothing. `pdf`: the pdf.js document; `pages`: the layout's
 * pages (`source` = the page of the PDF, null = a blank page). `drawing`: whether a box sits on a page's boxes and
 * lines; `forgotten`: what the admin told auto-detect to forget in this session (left out); `lessons`: the lessons
 * the session's detection used (what it did with the boxes they made it try is learnt too). Use the lessonFor of
 * detect.ts, which reads the drawing: useFormEditor calls it after each save (`onLesson`).
 */
export async function lessonFor(
  pdf: TextPdf,
  pages: { source: number | null }[],
  session: EditSession,
  {
    at = Date.now(),
    drawing,
    view,
    forgotten,
    lessons,
  }: {
    at?: number
    drawing?: Drawing
    view?: (source: number, page: number) => Promise<PageView>
    forgotten?: Forget
    lessons?: Lesson[]
  } = {},
): Promise<Lesson | null> {
  const touched = touchedPages(session)
  const { notes, kept, used } = notesOf(session, touched)
  const memory = await memoryOf(pdf, pages, session, drawing)
  const forgot = new Set([...(forgotten?.labels ?? []), ...(forgotten?.drawn ?? [])])
  const labels = notes.filter((n) => !forgot.has(labelHash(n.label)))
  const keep = kept.filter((h) => !forgot.has(h))
  // The pages it changed as auto-detect sees them, for what boxes teach (not when it was told to forget that).
  const views = new Map<number, PageView>()
  if (view && !forgotten?.patterns)
    for (const n of [...touched].sort((a, b) => a - b)) {
      const source = pages[n - 1]?.source
      if (source) views.set(n, await view(source, n))
    }
  const earlier = views.size && lessons?.length ? placesFor(knowledge(valid(lessons)).places) : []
  const { taught, placed, places } = examplesOf(views, session, touched, earlier)
  // A field drawn in the place of a box auto-detect proposes is learnt from by its box (in any form), not also by the
  // line next to it (only where that line is).
  const drawn = (await drawnOf(pdf, pages, session, new Set([...used, ...placed]))).filter((d) => !forgot.has(d.line))
  const score = scoreOf(session)
  if (!labels.length && !keep.length && !memory.length && !drawn.length && !taught && !score) return null
  return {
    version: 1,
    id: session.id,
    at,
    labels,
    ...(keep.length > 0 && { kept: keep }),
    pages: memory,
    ...(drawn.length > 0 && { drawn }),
    ...(taught && { cues: taught.cues, examples: taught.examples }),
    ...(places.length > 0 && { places }),
    ...(score && { score }),
  }
}

// Skips lessons it cannot use. Size limits are for your server (validateLesson with your limits), not for this.
const valid = (lessons: Lesson[] | undefined) =>
  (lessons ?? []).filter((l) => !validateLesson(l, { maxFields: Infinity, maxPages: Infinity }).length)

// Why learning made each field of a detection: what to forget to undo it. Only for this session's fields.
const whys = new WeakMap<FieldDef, Forget>()
// What the lessons' boxes taught at the last detection, and which lessons they were.
let trained: { key: string; patterns: ReturnType<typeof patternsFor> } | undefined
const taughtFor = new WeakMap<FieldDef, string[]>()
/** What learning did to make a field auto-detect suggested in this session (what to forget to undo it). */
export const whyLearnt = (field: FieldDef) => whys.get(field)
/**
 * For a field pattern learning suggested in this session (or gave its type, required or group): the cues of the boxes
 * admins kept that made it so ("t:yes", "c:comment", "k=choice"…), for the editor to say why.
 */
export const taughtBy = (field: FieldDef) => taughtFor.get(field)

/**
 * The lessons, ready for one detection run over `pdf` (its pages `sources`; `pageCount` pages in the layout).
 * null when there is nothing to learn from.
 */
export async function learnedFor(lessons: Lesson[] | undefined, pdf: TextPdf, sources: number[], pageCount: number) {
  const usable = valid(lessons)
  if (!usable.length) return null
  const { votes, drawn: notes, memories, taught, places } = knowledge(usable)
  const pages = await pagesFor(memories, pdf, sources)
  const hand = await drawnFor(notes, votes, pdf, sources, pageCount)
  // The same lessons as the last run (an app may add to its list in place): what boxes taught is not trained again.
  const key = usable.map((l) => `${l.id}@${l.at}`).join()
  if (trained?.key !== key) trained = { key, patterns: patternsFor(taught) }
  const { patterns } = trained
  return {
    /** Whether boxes taught something: then detection proposes the boxes only learning suggests (`review`). */
    patterns: !!patterns,
    /** Where admins drew fields that nothing was proposed for: tried next to every line (places.ts). */
    places: patterns ? placesFor(places) : [],
    /**
     * The fields of a page set up before, placed on layout page `page`, and where the admin removed fields; null
     * when the page is new.
     */
    remembered: pages.remembered,
    /** `s` with what the admin changed for its label, or null to leave it out. */
    adjust: (s: Suggestion) => adjust(votes, s, pageCount),
    /**
     * The suggestions of a page from what its rules propose (`found`), not where the admin decided before
     * (`decided`), with what was learnt about their labels and, where boxes taught something (`view`: the page with
     * every box proposed on it), about boxes like them.
     */
    review(found: Candidate[], view: PageView | null, decided: Position[]): Suggestion[] {
      const adjusted = new Map<Candidate, Suggestion | null>()
      for (const c of found) adjusted.set(c, clashes(decided, c.field.position) ? null : adjust(votes, c.field, pageCount))
      if (!patterns || !view) return found.flatMap((c) => adjusted.get(c) ?? [])
      return patterns.review(view, adjusted, (label) => voted(votes, label), decided, pageCount)
    },
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
    if (s?.taught) taughtFor.set(g, s.taught)
    return true
  })
}
