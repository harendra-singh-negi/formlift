// Auto-detect that learns from the admin's corrections. No AI service, and nothing is sent anywhere.
// When the admin saves, the editor compares what auto-detect suggested with what was saved and writes it down as a
// Lesson: plain JSON that your app stores (its database, a JSON file on its server, or localStorage) and passes
// back, with every lesson before it, to the next detection. Detection then
//   - puts back the fields of a page the admin set up before: the same page in a new revision of a form, or a page
//     that many forms share (a cover page). Each field moves with the line of text nearest to it, so a page whose
//     text moved a little still fits;
//   - applies what the admin changed about a suggestion (type, label, options, required…) to every suggestion with
//     the same label, in any form;
//   - leaves out a suggestion that the admin deleted in the last two forms that had it.
// A page is known again by the lines only it has in its document. They are kept as hashes, so a lesson holds no
// page text.

import { fitInPage } from './coords'
import { newId } from './fields'
import {
  FIELD_TYPES,
  resolveLimits,
  validateFields,
  type FieldDef,
  type FieldGroup,
  type Limits,
  type Position,
} from './form-logic'
import { toLines, type PdfTextItem } from './layout'

// What a lesson keeps of a field: its own settings, with their kinds (checked when a lesson comes in). Not its id or
// key (new every time), and not conditions or follow-ups: those point at other fields by key.
const KINDS = {
  type: 'string',
  label: 'string',
  placeholder: 'string',
  helpText: 'string',
  defaultValue: 'string',
  required: 'boolean',
  readOnly: 'boolean',
  hidden: 'boolean',
  minLength: 'number',
  maxLength: 'number',
  min: 'number',
  max: 'number',
  pattern: 'string',
  errorMessage: 'string',
  requiredMessage: 'string',
  rules: 'list',
  options: 'list',
  currency: 'string',
  decimals: 'number',
  step: 'number',
  comments: 'boolean',
} as const satisfies Partial<Record<keyof FieldDef, 'string' | 'boolean' | 'number' | 'list'>>
type Setting = keyof typeof KINDS
const SETTINGS = Object.keys(KINDS) as Setting[]

/** A field's own settings. */
export type FieldSettings = Pick<FieldDef, Setting>
/** Settings the admin changed: the new value, or null where they cleared one. */
export type SettingsChange = { [K in Setting]?: FieldDef[K] | null }
/** A line of a page's text: a hash of the text, and where the line starts (page fractions from the top left). */
export type Mark = [hash: string, x: number, y: number]

/** What the admin did with the suggestions of one label (normalised) in one session. */
export interface LabelNote {
  label: string
  /** How many they kept (changed or not, or drew by hand with this label), and how many they deleted. */
  kept: number
  deleted: number
  /** The value they gave every kept one, where some had another (null = cleared). */
  change?: SettingsChange
}

/** A page as the admin set it up: its own lines (to know it again) and its fields. */
export interface PageMemory {
  text: Mark[]
  fields: {
    settings: FieldSettings
    /** x, y, width, height in page fractions. */
    box: [number, number, number, number]
    /** The line nearest to the field: the field moves with it. */
    anchor?: Mark
    group?: FieldGroup
  }[]
}

/**
 * What one editing session taught auto-detect. Plain JSON: store it as it is, in place of the lesson with the same
 * `id` (the same session saved again), and pass all of them back as `lessons`.
 */
export interface Lesson {
  version: 1
  id: string
  /** When it was learnt (ms since 1970). Newer lessons win. */
  at: number
  labels: LabelNote[]
  pages: PageMemory[]
}

/** One editing session: the fields it started with, the suggestions auto-detect added and the fields saved. */
export interface EditSession {
  /** The same for every save of the session, so its lesson replaces the one before. */
  id: string
  before: FieldDef[]
  suggested: FieldDef[]
  saved: FieldDef[]
}

/** The confidence of a field put back from a page set up before. */
export const REMEMBERED = 0.99
// A page needs this many lines of its own to be known again, and a page memory this much of them in common
// (Dice: 1 = the same lines).
const MIN_OWN = 3
const SAME_PAGE = 0.8
const MAX_MARKS = 5000

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
/**
 * A label as lessons know it ("Date:" and "DATE" are one), or "" for a label that says nothing about the field:
 * none, no letter in it ("1"), or what auto-detect calls a box it found no label for ("checkbox", "Text").
 */
const labelKey = (s: string) =>
  (FIELD_TYPES as readonly string[]).includes(s) || s === 'Text' || !/\p{L}/u.test(s)
    ? ''
    : norm(s).replace(/[\s:.*]+$/, '')
const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// cyrb53 (public domain): a 53-bit hash, in base 36.
function hash(s: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** A page's lines as marks. `items`: pdf.js getTextContent() items; `view`: the page's view box. */
function pageMarks(items: unknown[], view: number[]): Mark[] {
  const out: Mark[] = []
  for (const l of toLines(items as PdfTextItem[], view)) {
    const t = norm(l.text)
    // Lines on the page (or just off it): text hidden far outside the page is nothing to know it by.
    if (/[\p{L}\p{N}]/u.test(t) && [l.x, l.y].every((n) => n > -0.5 && n < 1.5)) out.push([hash(t), r4(l.x), r4(l.y)])
  }
  return out
}

/** What reading a page's text needs from a pdf.js document. */
interface TextPdf {
  getPage(n: number): Promise<{ view: number[]; getTextContent(): Promise<{ items: unknown[] }> }>
}
// Marks per page, read once per document: the detection and the lessons after it share them.
const read = new WeakMap<object, Map<number, Mark[]>>()
async function marksOf(pdf: TextPdf, sources: number[]) {
  let known = read.get(pdf)
  if (!known) read.set(pdf, (known = new Map()))
  for (const n of sources)
    if (!known.has(n)) {
      const page = await pdf.getPage(n)
      known.set(n, pageMarks((await page.getTextContent()).items, page.view))
    }
  return known
}

/** A page's own lines: those that appear once in the whole document (once on this page, on no other). */
function ownMarks(marks: Map<number, Mark[]>, sources: number[]) {
  const count = new Map<string, number>()
  for (const n of new Set(sources)) for (const m of marks.get(n) ?? []) count.set(m[0], (count.get(m[0]) ?? 0) + 1)
  return (n: number) => (marks.get(n) ?? []).filter((m) => count.get(m[0]) === 1)
}

/** The lines that appear once on a page, by hash: they tell where a field went. */
function uniqueOn(marks: Mark[]) {
  const count = new Map<string, number>()
  for (const m of marks) count.set(m[0], (count.get(m[0]) ?? 0) + 1)
  return new Map(marks.filter((m) => count.get(m[0]) === 1).map((m) => [m[0], m]))
}

/**
 * How a page's lines moved since a memory of it: the shift that most of them share. undefined when fewer than half
 * moved alike: the same text in another layout (another font size, page size or style), not the same page.
 */
function steady(text: Mark[], here: Map<string, Mark>) {
  const moves = text.flatMap((t) => {
    const h = here.get(t[0])
    return h ? [[h[1] - t[1], h[2] - t[2]]] : []
  })
  if (!moves.length) return
  const mid = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]
  const shift = [mid(moves.map((d) => d[0])), mid(moves.map((d) => d[1]))]
  const alike = moves.filter((d) => Math.abs(d[0] - shift[0]) <= 0.01 && Math.abs(d[1] - shift[1]) <= 0.01).length
  return alike >= Math.max(MIN_OWN, moves.length / 2) ? shift : undefined
}

/** The line nearest to a box (distance 0 inside it): mostly the field's own label. */
function nearest(marks: Iterable<Mark>, p: Position) {
  const gap = (m: Mark) =>
    Math.hypot(Math.max(p.x - m[1], 0, m[1] - p.x - p.width), Math.max(p.y - m[2], 0, m[2] - p.y - p.height))
  let best: Mark | undefined
  for (const m of marks) if (!best || gap(m) < gap(best)) best = m
  return best
}

const settingsOf = (f: FieldDef) =>
  Object.fromEntries(SETTINGS.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])) as FieldSettings

const area = (p: Position) => p.width * p.height
function overlapShare(a: Position, b: Position) {
  if (a.page !== b.page) return 0
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  const inter = w > 0 && h > 0 ? w * h : 0
  return inter / (area(a) + area(b) - inter)
}

/** What the admin did with the suggestions of each label. */
function notesOf({ before, suggested, saved }: EditSession): LabelNote[] {
  const byId = new Map(saved.map((f) => [f.id, f]))
  // Every suggestion deleted, and many of them: the admin started again, which says nothing about each one.
  if (suggested.length >= 10 && suggested.every((s) => !byId.has(s.id))) return []
  const given = new Set([...before, ...suggested].map((f) => f.id))
  const drawn = saved.filter((f) => !given.has(f.id))
  const labels = new Map<string, { kept: [FieldDef, FieldDef][]; byHand: number; deleted: number }>()
  const of = (label: string) => {
    let l = labels.get(label)
    if (!l) labels.set(label, (l = { kept: [], byHand: 0, deleted: 0 }))
    return l
  }
  const used = new Set<FieldDef>()
  for (const s of suggested) {
    const label = labelKey(s.label)
    if (!label || label.length > 255) continue
    const kept = byId.get(s.id)
    // Deleted and drawn again in its place (as another type, say) is a change, not a wrong suggestion. A drawn
    // field still called by its type ("Date") was not named by the admin: it keeps the suggestion's label.
    const instead = kept ? undefined : drawn.find((d) => !used.has(d) && overlapShare(d.position, s.position) >= 0.5)
    if (instead) used.add(instead)
    if (kept) of(label).kept.push([s, kept])
    else if (instead) of(label).kept.push([s, norm(instead.label) === instead.type ? { ...instead, label: s.label } : instead])
    else of(label).deleted++
  }
  // A field drawn by hand and named by the admin: that label is wanted (a label no longer suggested comes back).
  for (const d of drawn) {
    const label = labelKey(d.label)
    if (label && label.length <= 255 && !used.has(d) && norm(d.label) !== d.type) of(label).byHand++
  }
  return [...labels].map(([label, { kept, byHand, deleted }]) => {
    // A setting is learnt when the admin left every kept one with the same value and some had another before.
    const change: Record<string, unknown> = {}
    for (const k of SETTINGS) {
      const to = kept.map(([, f]) => f[k] ?? null)
      if (to.every((v) => same(v, to[0])) && kept.some(([s]) => !same(s[k], to[0]))) change[k] = to[0]
    }
    const note = { label, kept: kept.length + byHand, deleted }
    return Object.keys(change).length ? { ...note, change: change as SettingsChange } : note
  })
}

// A page's fields as the admin sees them (not ids or keys: those change by themselves).
const pageState = (fields: FieldDef[], page: number) =>
  fields
    .filter((f) => f.position.page === page && !f.dialogOnly)
    .map((f) => JSON.stringify([settingsOf(f), f.position, f.group ?? null]))
    .sort()
    .join('\n')

/** The pages the admin changed in this session, as they are saved now. */
async function memoryOf(pdf: TextPdf, pages: { source: number | null }[], s: EditSession): Promise<PageMemory[]> {
  const given = [...s.before, ...s.suggested]
  const changed = pages.flatMap((p, i) => (p.source && pageState(given, i + 1) !== pageState(s.saved, i + 1) ? [i + 1] : []))
  if (!changed.length) return []
  const sources = pages.flatMap((p) => (p.source ? [p.source] : []))
  const marks = await marksOf(pdf, sources)
  const own = ownMarks(marks, sources)
  const out: PageMemory[] = []
  for (const n of changed) {
    const source = pages[n - 1].source!
    const text = own(source)
    const fields = s.saved.filter((f) => f.position.page === n && !f.dialogOnly)
    // Too little text of its own (a scan, a page like many others): it could not be known again. A page left
    // without fields may just not be done yet: it keeps getting suggestions (and loses wrong ones label by label).
    if (text.length < MIN_OWN || !fields.length) continue
    const anchors = [...uniqueOn(marks.get(source) ?? []).values()]
    out.push({
      text,
      fields: fields.map((f) => {
        const p = f.position
        const anchor = nearest(anchors, p)
        return {
          settings: settingsOf(f),
          box: [r4(p.x), r4(p.y), r4(p.width), r4(p.height)] as PageMemory['fields'][number]['box'],
          ...(anchor && { anchor }),
          ...(f.group && { group: f.group }),
        }
      }),
    })
  }
  return out
}

/**
 * What a save taught auto-detect, or null when it taught nothing. `pdf`: the pdf.js document; `pages`: the layout's
 * pages (`source` = the page of the PDF, null = a blank page). useFormEditor calls it after each save (`onLesson`).
 */
export async function lessonFor(
  pdf: TextPdf,
  pages: { source: number | null }[],
  session: EditSession,
  at = Date.now(),
): Promise<Lesson | null> {
  const labels = notesOf(session)
  const memory = await memoryOf(pdf, pages, session)
  return labels.length || memory.length ? { version: 1, id: session.id, at, labels, pages: memory } : null
}

/**
 * `lessons` with `lesson` in place of the one with its id (or added), oldest first, keeping the newest `max`.
 * The same on your server and in the browser.
 */
export function addLesson(lessons: Lesson[], lesson: Lesson, max = 1000): Lesson[] {
  // ponytail: keeps a count, not a size; a store that must stay small prunes old lessons itself.
  return [...lessons.filter((l) => l.id !== lesson.id), lesson].sort((a, b) => a.at - b.at).slice(-max)
}

const isMark = (m: unknown): m is Mark =>
  Array.isArray(m) &&
  m.length === 3 &&
  typeof m[0] === 'string' &&
  m[0].length <= 16 &&
  [m[1], m[2]].every((n) => typeof n === 'number' && n >= -1 && n <= 2)

function okValue(k: string, v: unknown) {
  const kind = (KINDS as Record<string, string>)[k]
  if (!kind) return false
  if (v === null) return k !== 'type' && k !== 'label'
  if (kind === 'list')
    return Array.isArray(v) && v.length <= 10_000 && v.every((x) => typeof x === 'string' && x.length <= 1000)
  if (kind === 'string')
    return typeof v === 'string' && v.length <= 10_000 && (k !== 'type' || (FIELD_TYPES as readonly string[]).includes(v))
  return typeof v === kind && (kind !== 'number' || Number.isFinite(v))
}
const okSettings = (o: unknown, nulls: boolean) =>
  !!o && typeof o === 'object' && !Array.isArray(o) && Object.entries(o).every(([k, v]) => (nulls || v !== null) && okValue(k, v))

/**
 * Problems with a lesson ([] = fine), with the same limits as validateFields. Run it on your server before you
 * store a lesson that a browser sent. Detection also skips a lesson that fails it.
 */
export function validateLesson(lesson: unknown, limits?: Partial<Limits>): string[] {
  const { maxFields, maxPages } = resolveLimits(limits)
  const l = lesson as Partial<Lesson> | null
  if (!l || typeof l !== 'object' || Array.isArray(l)) return ['A lesson must be an object']
  const errors: string[] = []
  if (l.version !== 1) errors.push('version must be 1')
  if (typeof l.id !== 'string' || !l.id || l.id.length > 100) errors.push('id must be text of 1 to 100 characters')
  if (typeof l.at !== 'number' || !Number.isFinite(l.at)) errors.push('at must be a time in milliseconds')
  if (!Array.isArray(l.labels) || l.labels.length > maxFields) errors.push(`labels must be a list of at most ${maxFields}`)
  else if (
    !l.labels.every(
      (n) =>
        !!n &&
        typeof n.label === 'string' &&
        n.label.length <= 255 &&
        [n.kept, n.deleted].every((c) => Number.isInteger(c) && c >= 0) &&
        (n.change == null || okSettings(n.change, true)),
    )
  )
    errors.push('Every label needs a label (text), kept and deleted (counts) and only known settings in change')
  if (!Array.isArray(l.pages) || l.pages.length > maxPages) errors.push(`pages must be a list of at most ${maxPages}`)
  else
    for (const [i, p] of l.pages.entries()) {
      const fields = p?.fields
      if (
        !p ||
        !Array.isArray(p.text) ||
        p.text.length > MAX_MARKS ||
        !p.text.every(isMark) ||
        !Array.isArray(fields) ||
        fields.length > maxFields ||
        !fields.every(
          (f) =>
            !!f &&
            okSettings(f.settings, false) &&
            Array.isArray(f.box) &&
            f.box.length === 4 &&
            (f.anchor == null || isMark(f.anchor)),
        )
      ) {
        errors.push(`Page ${i + 1}: needs text (marks) and fields (settings, box)`)
        break
      }
      // The fields as a form of one page: the checks every saved form passes.
      const asForm = fields.map((f, j) => ({
        ...f.settings,
        id: `f${j}`,
        key: `f${j}`,
        source: 'ai',
        position: { page: 1, x: f.box[0], y: f.box[1], width: f.box[2], height: f.box[3] },
        ...(f.group != null && { group: f.group }),
      }))
      const e = validateFields(asForm, 1, limits)
      if (e.length) {
        errors.push(`Page ${i + 1}: ${e[0]}`)
        break
      }
    }
  return errors
}

interface Vote {
  at: number
  keep: boolean
  change?: SettingsChange
}

/** Per label, a vote of each lesson (oldest first): kept some or deleted them all, and what it changed. */
function votesOf(lessons: Lesson[]) {
  const votes = new Map<string, Vote[]>()
  for (const l of lessons)
    for (const n of l.labels) {
      const vote = { at: l.at, keep: n.kept > 0, ...(n.change && { change: n.change }) }
      const all = votes.get(n.label)
      if (all) all.push(vote)
      else votes.set(n.label, [vote])
    }
  return votes
}

/** What the lessons say about a suggestion's label: leave it out, or change these settings. */
function verdict(votes: Map<string, Vote[]>, label: string) {
  const all: Vote[] = []
  for (let k = labelKey(label), seen = new Set<string>(); k && !seen.has(k); ) {
    seen.add(k)
    const vs = votes.get(k) ?? []
    all.push(...vs)
    // Renamed by the admin: what was learnt under the new name counts too.
    let to = ''
    for (const v of vs) to = v.change?.label ?? to
    k = to && labelKey(to)
  }
  all.sort((a, b) => a.at - b.at)
  const last = all.slice(-2)
  return {
    drop: last.length === 2 && !last[0].keep && !last[1].keep,
    change: Object.assign({}, ...all.map((v) => v.change)) as SettingsChange,
  }
}

type Suggestion = Omit<FieldDef, 'id' | 'key'>

function applyChange(s: Suggestion, change: SettingsChange): Suggestion {
  const out: Record<string, unknown> = { ...s }
  for (const k of SETTINGS) {
    const v = change[k]
    if (v === null) delete out[k]
    else if (v !== undefined) out[k] = v
  }
  return out as Suggestion
}

/**
 * The lessons, ready for one detection run over `pdf` (its pages `sources`; `pageCount` pages in the layout).
 * null when there is nothing to learn from.
 */
export async function learnedFor(lessons: Lesson[] | undefined, pdf: TextPdf, sources: number[], pageCount: number) {
  // Skips lessons it cannot use. Size limits are for your server (validateLesson with your limits), not for this.
  const unlimited = { maxFields: Infinity, maxPages: Infinity }
  const valid = (lessons ?? []).filter((l) => !validateLesson(l, unlimited).length).sort((a, b) => a.at - b.at)
  if (!valid.length) return null
  const votes = votesOf(valid)
  const memories = valid.flatMap((l) => l.pages.map((m) => ({ at: l.at, id: l.id, m, text: new Set(m.text.map((t) => t[0])) })))
  const index = new Map<string, number[]>()
  for (const [i, x] of memories.entries())
    for (const h of x.text) {
      const at = index.get(h)
      if (at) at.push(i)
      else index.set(h, [i])
    }
  const marks = memories.length ? await marksOf(pdf, sources) : new Map<number, Mark[]>()
  const own = ownMarks(marks, sources)
  const groups = new Map<string, string>()

  return {
    /** The fields of a page set up before, placed on layout page `page`; null when the page is new. */
    remembered(source: number, page: number): Suggestion[] | null {
      const mine = own(source)
      if (mine.length < MIN_OWN) return null
      const here = uniqueOn(marks.get(source) ?? [])
      const hits = new Map<number, number>()
      for (const [h] of mine) for (const i of index.get(h) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1)
      let best: (typeof memories)[number] | undefined
      let bestScore = 0
      let pageShift: number[] = []
      for (const [i, n] of hits) {
        const score = (2 * n) / (mine.length + memories[i].text.size)
        if (score < SAME_PAGE || score < bestScore || (score === bestScore && memories[i].at < best!.at)) continue
        const shift = steady(memories[i].m.text, here)
        if (shift) [best, bestScore, pageShift] = [memories[i], score, shift]
      }
      if (!best) return null
      const { id, m } = best
      // Each field moves as the line nearest to it moved; without that line, as most of the page's lines did.
      const moved = (a: Mark) => {
        const b = here.get(a[0])
        return b && [b[1] - a[1], b[2] - a[2]]
      }
      return m.fields.map((f) => {
        const [dx, dy] = (f.anchor && moved(f.anchor)) || pageShift
        const [x, y, width, height] = f.box
        let group = f.group
        if (group) {
          const was = `${id}:${group.id}`
          if (!groups.has(was)) groups.set(was, newId())
          group = { ...group, id: groups.get(was)! }
        }
        return {
          ...f.settings,
          ...(group && { group }),
          source: 'ai',
          confidence: REMEMBERED,
          position: fitInPage({ page, x: x + dx, y: y + dy, width, height }),
        }
      })
    },
    /** `s` with what the admin changed for its label, or null to leave it out. */
    adjust(s: Suggestion): Suggestion | null {
      const v = verdict(votes, s.label)
      if (v.drop) return null
      if (!Object.keys(v.change).length) return s
      const changed = applyChange(s, v.change)
      // A change that makes no valid field here (a list type without options) is not applied.
      return validateFields([{ ...changed, id: 'x', key: 'x' }], pageCount).length ? s : changed
    },
  }
}
