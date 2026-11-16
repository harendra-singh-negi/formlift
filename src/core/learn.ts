// Auto-detect that learns from the admin's corrections. No AI service, and nothing is sent anywhere.
// When the admin saves, the editor compares what auto-detect suggested with what was saved and writes it down as a
// Lesson: plain JSON that your app stores (its database, a JSON file on its server, or localStorage) and passes
// back, with every lesson before it, to the next detection. Detection then
//   - puts back the fields of a page the admin set up before, with their conditions and follow-up questions: the
//     same page in a new revision of a form, or a page that many forms share (a cover page). Each field moves with
//     the line of text nearest to it, so a page whose text moved a little still fits. A page without text (a scan)
//     is known by where its ink is; a page whose boxes and lines changed is not taken for the one set up before;
//   - applies what the admin changed about a suggestion (type, label, options, required…) to every suggestion with
//     the same label, in any form, and leaves out a suggestion the admin deleted in the last two forms that had it;
//   - draws a field next to a line of text where the admin drew one by hand twice (in one form or in two).
// The editor shows what was learnt, and the admin can forget any of it: a lesson that says what to forget.
// Pages are known again by the lines only they have in their document, kept as hashes: a lesson holds no page text.

import { clashes, fitInPage, overlap } from './coords'
import { newId } from './fields'
import {
  FIELD_TYPES,
  resolveLimits,
  validateFields,
  type Condition,
  type FieldDef,
  type FieldGroup,
  type FollowUp,
  type Limits,
  type Position,
  type Rule,
} from './form-logic'
import { toLines, type PdfTextItem } from './layout'

// What a lesson keeps of a field: its own settings, with their kinds (checked when a lesson comes in). Not its id or
// key: those are new every time.
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
const CONDITIONS = ['visibleWhen', 'requiredWhen', 'readOnlyWhen'] as const

/** A field's own settings. */
export type FieldSettings = Pick<FieldDef, Setting>
/** Settings the admin changed: the new value, or null where they cleared one. */
export type SettingsChange = { [K in Setting]?: FieldDef[K] | null }
/** A line of a page's text: a hash of the text, and where the line starts (page fractions from the top left). */
export type Mark = [hash: string, x: number, y: number]

/** What the admin did with the suggestions of one label in one session: deleted them all, or changed them. */
export interface LabelNote {
  /** The label as suggested ("Date:" and "DATE" are one label). */
  label: string
  /** How many they kept (changed or not, or drew by hand with this label), and how many they deleted. */
  kept: number
  deleted: number
  /** The value they gave every kept one, where some had another (null = cleared). */
  change?: SettingsChange
}

/** A field the admin drew by hand next to a line of text. Drawn twice, it is suggested in every form. */
export interface DrawnNote {
  /** The line: a hash of its text. */
  line: string
  /** On the line's row, after it; or under it. */
  side: 'right' | 'below'
  /** Points: from the line's end (right) or from its start and bottom (below); then the field's width and height. */
  box: [dx: number, dy: number, width: number, height: number]
  settings: FieldSettings
  /** How many times the session drew it there (once when left out). */
  times?: number
  /** Lines of text the field covered (a code printed in its box): as many may be inside it in other forms. */
  covers?: number
}

/** A field of a page set up before. */
export interface RememberedField {
  settings: FieldSettings
  /** x, y, width, height in page fractions. */
  box: [number, number, number, number]
  /** The line nearest to the field (index in the page's anchors): the field moves with it. */
  anchor?: number
  group?: FieldGroup
  dialogOnly?: true
  /** Conditions and follow-up. The fields they use are p<page>_<field>: indexes in the lesson's pages and fields. */
  visibleWhen?: Condition
  requiredWhen?: Condition
  readOnlyWhen?: Condition
  followUp?: FollowUp
}

/** A page as the admin set it up: how to know it again, and its fields. */
export interface PageMemory {
  /** Lines only this page has in its document: up to 24 of them (those with the lowest hashes). */
  text: Mark[]
  /** How many such lines the page has, when more than `text` keeps. */
  lines?: number
  /** A page without such lines (a scan): where its ink is, 32 × 32 cells as hex. */
  image?: string
  /** Fields (indexes) that sat on the page's boxes and lines: most must still do, or its drawing changed. */
  onDrawing?: number[]
  /** The lines the fields move with (fields in a row share one). */
  anchors?: Mark[]
  fields: RememberedField[]
}

/** What the admin told auto-detect to forget of the lessons before this one. */
export interface Forget {
  /** Everything. */
  all?: true
  /** Labels (hashes): what was changed or deleted. */
  labels?: string[]
  /** Lines (hashes): the fields drawn next to them. */
  drawn?: string[]
  /** Pages set up before: [lesson id, index in its pages]. */
  pages?: [lesson: string, page: number][]
}

/**
 * What one editing session taught auto-detect (or what to forget). Plain JSON: store it as it is, in place of the
 * lesson with the same `id` (the same session saved again), and pass all of them back as `lessons`.
 */
export interface Lesson {
  version: 1
  id: string
  /** When it was learnt (ms since 1970). Newer lessons win. */
  at: number
  labels: LabelNote[]
  /** Labels kept as they were suggested (hashes). */
  kept?: string[]
  pages: PageMemory[]
  drawn?: DrawnNote[]
  forget?: Forget
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
/** The confidence of a suggestion changed or drawn as the admin did in other forms. */
export const LEARNT = 0.98
// A page needs this many lines of its own to be known again, and a page memory this much of them in common
// (Dice: 1 = the same lines). A memory keeps a sample of them.
const MIN_OWN = 3
const SAME_PAGE = 0.8
const SAMPLE = 24
const MAX_MARKS = 5000
// A field drawn by hand next to the same line this many times (on pages of one form or in several) is drawn there
// in every form.
const DRAWN_TIMES = 2
// A page's picture: GRID × GRID cells, at least INK_MIN of them inked. Pictures this alike (Dice) are one page: a
// copy of the same scan is 1, another screen of the same app 0.93.
const GRID = 32
const INK_MIN = 8
const SAME_PICTURE = 0.95

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
const r1 = (n: number) => Math.round(n * 10) / 10
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// cyrb53 (public domain): a 53-bit hash.
function hashOf(s: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
const hash = (s: string) => hashOf(s).toString(36)
/** A label's hash, as lessons know it. */
const labelHash = (label: string) => hash(labelKey(label))

/** A line of a page's text (page fractions). Its text stays here: lessons keep only the hash. */
interface Line {
  h: string
  n: number
  x: number
  y: number
  w: number
  ht: number
  text: string
}
interface PageText {
  lines: Line[]
  /** Points. */
  width: number
  height: number
}

function pageLines(items: unknown[], view: number[]): Line[] {
  const out: Line[] = []
  for (const l of toLines(items as PdfTextItem[], view)) {
    const t = norm(l.text)
    // Lines on the page (or just off it): text hidden far outside the page is nothing to know it by.
    if (!/[\p{L}\p{N}]/u.test(t) || ![l.x, l.y].every((n) => n > -0.5 && n < 1.5)) continue
    const n = hashOf(t)
    out.push({ h: n.toString(36), n, x: l.x, y: l.y, w: l.width, ht: l.height, text: l.text })
  }
  return out
}
const mark = (l: Line): Mark => [l.h, r4(l.x), r4(l.y)]

/** What reading a page needs from a pdf.js document (its picture, too, when it has a canvasFactory). */
interface TextPdf {
  getPage(n: number): Promise<{ view: number[]; getTextContent(): Promise<{ items: unknown[] }> }>
}
// The text of each page, read once per document: the detection and the lessons after it share it.
const read = new WeakMap<object, Map<number, PageText>>()
async function textOf(pdf: TextPdf, sources: number[]) {
  let known = read.get(pdf)
  if (!known) read.set(pdf, (known = new Map()))
  for (const n of sources)
    if (!known.has(n)) {
      const page = await pdf.getPage(n)
      const v = page.view
      known.set(n, { lines: pageLines((await page.getTextContent()).items, v), width: v[2] - v[0], height: v[3] - v[1] })
    }
  return known
}

/** A page's own lines: those that appear once in the whole document (once on this page, on no other). */
function ownLines(texts: Map<number, PageText>, sources: number[]) {
  const count = new Map<string, number>()
  for (const n of new Set(sources)) for (const l of texts.get(n)?.lines ?? []) count.set(l.h, (count.get(l.h) ?? 0) + 1)
  return (n: number) => (texts.get(n)?.lines ?? []).filter((l) => count.get(l.h) === 1)
}

/** The lines that appear once on a page, by hash: they tell where a field went. */
function uniqueOn(lines: Line[]) {
  const count = new Map<string, number>()
  for (const l of lines) count.set(l.h, (count.get(l.h) ?? 0) + 1)
  return new Map(lines.filter((l) => count.get(l.h) === 1).map((l) => [l.h, l]))
}

/**
 * How a page's lines moved since a memory of it: the shift that most of them share. undefined when fewer than half
 * moved alike: the same text in another layout (another font size, page size or style), not the same page.
 */
function steady(text: Mark[], here: Map<string, Line>) {
  const moves = text.flatMap((t) => {
    const h = here.get(t[0])
    return h ? [[h.x - t[1], h.y - t[2]]] : []
  })
  if (!moves.length) return
  const mid = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]
  const shift = [mid(moves.map((d) => d[0])), mid(moves.map((d) => d[1]))]
  const alike = moves.filter((d) => Math.abs(d[0] - shift[0]) <= 0.01 && Math.abs(d[1] - shift[1]) <= 0.01).length
  return alike >= Math.max(MIN_OWN, moves.length / 2) ? shift : undefined
}

/** The line nearest to a box (distance 0 inside it): mostly the field's own label. */
function nearest(lines: Iterable<Line>, p: Position) {
  const gap = (l: Line) =>
    Math.hypot(Math.max(p.x - l.x, 0, l.x - p.x - p.width), Math.max(p.y - l.y, 0, l.y - p.y - p.height))
  let best: Line | undefined
  for (const l of lines) if (!best || gap(l) < gap(best)) best = l
  return best
}

// What drawing a page's picture needs: pdf.js's canvasFactory (a canvas in the browser, @napi-rs/canvas in Node).
interface Canvas {
  canvas: unknown
  context: { getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> } }
}
interface RenderPage {
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: object): { promise: Promise<unknown> }
}

/**
 * Where a page's ink is: GRID × GRID cells, each 1 when clearly darker than the paper, as hex. For a page with no
 * text of its own (a scan). undefined when it cannot be drawn here, or is (nearly) blank.
 */
async function inkOf(pdf: TextPdf, source: number): Promise<string | undefined> {
  const maker = (pdf as { canvasFactory?: { create(w: number, h: number): Canvas; destroy?(c: Canvas): void } })
    .canvasFactory
  if (!maker) return
  try {
    const page = (await pdf.getPage(source)) as unknown as RenderPage
    const viewport = page.getViewport({ scale: 64 / page.getViewport({ scale: 1 }).width })
    const [W, H] = [Math.ceil(viewport.width), Math.ceil(viewport.height)]
    const c = maker.create(W, H)
    await page.render({ canvas: c.canvas, canvasContext: c.context, viewport, intent: 'print' }).promise
    const { data } = c.context.getImageData(0, 0, W, H)
    maker.destroy?.(c)
    const sum = new Float64Array(GRID * GRID)
    const count = new Float64Array(GRID * GRID)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = 4 * (y * W + x)
        const cell = Math.floor((y * GRID) / H) * GRID + Math.floor((x * GRID) / W)
        sum[cell] += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        count[cell]++
      }
    const grey = Array.from(sum, (s, i) => s / count[i])
    const paper = [...grey].sort((a, b) => a - b)[grey.length >> 1]
    const ink = grey.map((g) => g < paper - Math.max(8, paper * 0.04))
    if (ink.filter(Boolean).length < INK_MIN) return
    let hex = ''
    for (let i = 0; i < ink.length; i += 4)
      hex += ((+ink[i] << 3) | (+ink[i + 1] << 2) | (+ink[i + 2] << 1) | +ink[i + 3]).toString(16)
    return hex
  } catch {
    return
  }
}

/** Two pictures alike (Dice of their inked cells: 1 = the same). */
function sameInk(a: string, b: string) {
  let both = 0
  let all = 0
  for (let i = 0; i < a.length; i++) {
    const [x, y] = [parseInt(a[i], 16), parseInt(b[i], 16)]
    for (let bit = 1; bit < 16; bit <<= 1) {
      both += 2 * +(!!(x & bit) && !!(y & bit))
      all += +!!(x & bit) + +!!(y & bit)
    }
  }
  return all ? both / all : 0
}

const settingsOf = (f: FieldDef) =>
  Object.fromEntries(SETTINGS.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])) as FieldSettings

const area = (p: Position) => p.width * p.height
function overlapShare(a: Position, b: Position) {
  if (a.page !== b.page) return 0
  const inter = overlap(a.x, a.x + a.width, b.x, b.x + b.width) * overlap(a.y, a.y + a.height, b.y, b.y + b.height)
  return inter / (area(a) + area(b) - inter)
}

/**
 * What the admin did with the suggestions of each label; and the fields drawn in place of a deleted suggestion.
 * Settings are learnt from the pages the admin changed (`touched`): a page left as it was may not have been looked
 * at yet (a long form set up page by page), so its suggestions do not count against a change.
 */
function notesOf({ before, suggested, saved }: EditSession, touched: Set<number>) {
  const byId = new Map(saved.map((f) => [f.id, f]))
  const used = new Set<FieldDef>()
  // Every suggestion deleted, and many of them: the admin started again, which says nothing about each one.
  if (suggested.length >= 10 && suggested.every((s) => !byId.has(s.id))) return { notes: [], kept: [], used }
  const given = new Set([...before, ...suggested].map((f) => f.id))
  const drawn = saved.filter((f) => !given.has(f.id) && !f.dialogOnly)
  const labels = new Map<string, { label: string; kept: [FieldDef, FieldDef][]; byHand: number; deleted: number }>()
  const of = (label: string) => {
    const key = labelKey(label)
    let l = labels.get(key)
    if (!l) labels.set(key, (l = { label, kept: [], byHand: 0, deleted: 0 }))
    return l
  }
  for (const s of suggested) {
    if (!labelKey(s.label) || s.label.length > 255) continue
    const kept = byId.get(s.id)
    // Deleted and drawn again in its place (as another type, say) is a change, not a wrong suggestion. A drawn
    // field still called by its type ("Date") was not named by the admin: it keeps the suggestion's label.
    const instead = kept ? undefined : drawn.find((d) => !used.has(d) && overlapShare(d.position, s.position) >= 0.5)
    if (instead) used.add(instead)
    if (kept) of(s.label).kept.push([s, kept])
    else if (instead)
      of(s.label).kept.push([s, norm(instead.label) === instead.type ? { ...instead, label: s.label } : instead])
    else of(s.label).deleted++
  }
  // A field drawn by hand and named by the admin: that label is wanted (a label no longer suggested comes back).
  for (const d of drawn)
    if (labelKey(d.label) && d.label.length <= 255 && !used.has(d) && norm(d.label) !== d.type) of(d.label).byHand++
  const notes: LabelNote[] = []
  const kept: string[] = []
  for (const [key, l] of labels) {
    // A setting is learnt when the admin left every kept one on the pages they changed with the same value, and
    // some had another before.
    const change: Record<string, unknown> = {}
    const reviewed = l.kept.filter(([s]) => touched.has(s.position.page))
    for (const k of SETTINGS) {
      const to = reviewed.map(([, f]) => f[k] ?? null)
      if (to.length && to.every((v) => same(v, to[0])) && reviewed.some(([s]) => !same(s[k], to[0]))) change[k] = to[0]
    }
    const n = l.kept.length + l.byHand
    // Kept as suggested: only a vote, kept as the label's hash.
    if (n && !Object.keys(change).length) kept.push(hash(key))
    else notes.push({ label: l.label, kept: n, deleted: l.deleted, ...(n > 0 && { change: change as SettingsChange }) })
  }
  return { notes, kept, used }
}

// The fields a condition or follow-up uses.
function keysIn(c: Condition | undefined, into: string[] = []) {
  for (const r of c?.rules ?? []) {
    if ('rules' in r) keysIn(r, into)
    else into.push(r.fieldKey)
  }
  return into
}
const usedBy = (f: FieldDef) => [
  ...CONDITIONS.flatMap((k) => keysIn(f[k])),
  ...keysIn(f.followUp?.when),
  ...(f.followUp?.fields ?? []),
]
/** `c` with its fields renamed by `to`; undefined when one has no new name. */
function renamed(c: Condition, to: (key: string) => string | undefined): Condition | undefined {
  const rules: (Rule | Condition)[] = []
  for (const r of c.rules) {
    const x = 'rules' in r ? renamed(r, to) : to(r.fieldKey) && { ...r, fieldKey: to(r.fieldKey)! }
    if (!x) return
    rules.push(x)
  }
  return { ...c, rules }
}

/** The pages (of the layout) whose fields the admin changed in a session. */
function touchedPages({ before, suggested, saved }: EditSession) {
  const given = [...before, ...suggested]
  const pages = new Set([...given, ...saved].map((f) => f.position.page))
  return new Set([...pages].filter((p) => pageState(given, p) !== pageState(saved, p)))
}

// A page's fields as the admin sees them (not ids: those change by themselves).
const pageState = (fields: FieldDef[], page: number) =>
  fields
    .filter((f) => f.position.page === page)
    .map((f) =>
      JSON.stringify([settingsOf(f), f.position, f.group, f.dialogOnly, ...CONDITIONS.map((k) => f[k]), f.followUp]),
    )
    .sort()
    .join('\n')

/** Whether a box sits on a page's boxes and lines; undefined when that cannot be told. */
type Drawing = (source: number) => Promise<((p: Position) => boolean) | undefined>

/** The pages the admin changed in this session, as they are saved now (and the pages their conditions use). */
async function memoryOf(
  pdf: TextPdf,
  pages: { source: number | null }[],
  s: EditSession,
  drawing?: Drawing,
): Promise<PageMemory[]> {
  const given = [...s.before, ...s.suggested]
  const want = new Set(
    pages.flatMap((p, i) => (p.source && pageState(given, i + 1) !== pageState(s.saved, i + 1) ? [i + 1] : [])),
  )
  if (!want.size) return []
  // A condition or follow-up can only come back with the fields it uses: their pages come too.
  const pageOf = new Map(s.saved.map((f) => [f.key, f.position.page]))
  for (let more = true; more; ) {
    more = false
    for (const f of s.saved)
      if (want.has(f.position.page))
        for (const k of usedBy(f)) {
          const p = pageOf.get(k)
          if (p && pages[p - 1]?.source && !want.has(p)) {
            want.add(p)
            more = true
          }
        }
  }
  const sources = pages.flatMap((p) => (p.source ? [p.source] : []))
  const texts = await textOf(pdf, sources)
  const own = ownLines(texts, sources)
  const out: { memory: PageMemory; fields: FieldDef[]; anchors: Line[] }[] = []
  for (const n of [...want].sort((a, b) => a - b)) {
    const source = pages[n - 1].source!
    const fields = s.saved.filter((f) => f.position.page === n)
    // A page left without fields may just not be done yet: it keeps getting suggestions (and loses wrong ones label
    // by label).
    if (!fields.some((f) => !f.dialogOnly)) continue
    const mine = own(source)
    // Too little text of its own (a scan, a page like many others): known by its picture, if it can be drawn.
    const image = mine.length < MIN_OWN ? await inkOf(pdf, source) : undefined
    if (mine.length < MIN_OWN && !image) continue
    const sample = [...mine].sort((a, b) => a.n - b.n).slice(0, SAMPLE)
    const sitting = await drawing?.(source)
    let onDrawing = sitting ? fields.flatMap((f, j) => (!f.dialogOnly && sitting(f.position) ? [j] : [])) : []
    // A few spread over the page tell as much as all of them.
    if (onDrawing.length > 8)
      onDrawing = Array.from({ length: 8 }, (_, k) => onDrawing[Math.floor((k * onDrawing.length) / 8)])
    out.push({
      fields,
      anchors: [...uniqueOn(texts.get(source)?.lines ?? []).values()],
      memory: {
        text: sample.map(mark),
        ...(mine.length > SAMPLE && { lines: mine.length }),
        ...(image && { image }),
        ...(onDrawing.length >= 2 && { onDrawing }),
        fields: [],
      },
    })
  }
  // Conditions and follow-ups name fields as p<page>_<field> of this lesson.
  const ref = new Map<string, string>()
  out.forEach((o, m) => o.fields.forEach((f, j) => ref.set(f.key, `p${m}_${j}`)))
  const to = (k: string) => ref.get(k)
  for (const o of out) {
    const anchors: Line[] = []
    o.memory.fields = o.fields.map((f) => {
      const p = f.position
      const line = nearest(o.anchors, p)
      if (line && !anchors.includes(line)) anchors.push(line)
      const r: RememberedField = {
        settings: settingsOf(f),
        box: [r4(p.x), r4(p.y), r4(p.width), r4(p.height)],
        ...(line && { anchor: anchors.indexOf(line) }),
        ...(f.group && { group: f.group }),
        ...(f.dialogOnly && { dialogOnly: true as const }),
      }
      for (const k of CONDITIONS) {
        const c = f[k] && renamed(f[k], to)
        if (c) r[k] = c
      }
      const when = f.followUp && renamed(f.followUp.when, to)
      const asks = f.followUp?.fields.flatMap((k) => ref.get(k) ?? []) ?? []
      if (when && asks.length) r.followUp = { ...f.followUp!, when, fields: asks }
      return r
    })
    if (anchors.length) o.memory.anchors = anchors.map(mark)
  }
  return out.map((o) => o.memory)
}

/** Fields drawn by hand next to a line of text (their label): on the line's row after it, or right under it. */
async function drawnOf(
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

/** A lesson that forgets `what` of the lessons before it. Store it like any other. */
export const forgetting = (what: Forget, at = Date.now()): Lesson => ({
  version: 1,
  id: newId(),
  at,
  labels: [],
  pages: [],
  forget: what,
})

/**
 * `lessons` with `lesson` in place of the one with its id (or added), oldest first, keeping the newest `max`.
 * The same on your server and in the browser.
 */
export function addLesson(lessons: Lesson[], lesson: Lesson, max = 1000): Lesson[] {
  // ponytail: keeps a count, not a size; a store that must stay small prunes old lessons itself.
  return [...lessons.filter((l) => l.id !== lesson.id), lesson].sort((a, b) => a.at - b.at).slice(-max)
}

const isHash = (h: unknown) => typeof h === 'string' && h.length > 0 && h.length <= 16
const isMark = (m: unknown): m is Mark =>
  Array.isArray(m) && m.length === 3 && isHash(m[0]) && [m[1], m[2]].every((n) => typeof n === 'number' && n >= -1 && n <= 2)
const hashes = (l: unknown) => Array.isArray(l) && l.length <= 100_000 && l.every(isHash)

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
const okCondition = (c: unknown, depth = 0): boolean => {
  const x = c as Condition
  return (
    !!x &&
    typeof x === 'object' &&
    (x.logic === 'and' || x.logic === 'or') &&
    Array.isArray(x.rules) &&
    x.rules.length <= 1000 &&
    depth < 20 &&
    x.rules.every((r) =>
      r && typeof r === 'object' && 'rules' in r
        ? okCondition(r, depth + 1)
        : !!r && typeof (r as Rule).fieldKey === 'string' && typeof (r as Rule).op === 'string',
    )
  )
}
const box4 = (b: unknown, max: number) =>
  Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max)
// A field's settings as a field of a form of one page: the checks every saved form passes.
const asField = (settings: FieldSettings, key: string, page = 1, box = [0, 0, 0.1, 0.1]) => ({
  ...settings,
  id: key,
  key,
  source: 'ai',
  position: { page, x: box[0], y: box[1], width: box[2], height: box[3] },
})

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
  if (l.kept != null && !hashes(l.kept)) errors.push('kept must be a list of label hashes')
  if (l.drawn != null)
    if (!Array.isArray(l.drawn) || l.drawn.length > maxFields) errors.push(`drawn must be a list of at most ${maxFields}`)
    else
      for (const [i, d] of l.drawn.entries())
        if (
          !d ||
          !isHash(d.line) ||
          (d.side !== 'right' && d.side !== 'below') ||
          (d.times != null && !(Number.isInteger(d.times) && d.times >= 1 && d.times <= 100_000)) ||
          (d.covers != null && !(Number.isInteger(d.covers) && d.covers >= 0 && d.covers <= 1000)) ||
          !box4(d.box, 10_000) ||
          !okSettings(d.settings, false) ||
          validateFields([asField(d.settings, 'x')], 1, limits).length
        ) {
          errors.push(`Drawn field ${i + 1}: needs line, side, box and the settings of a valid field`)
          break
        }
  const f = l.forget
  if (
    f != null &&
    (typeof f !== 'object' ||
      Array.isArray(f) ||
      (f.all != null && f.all !== true) ||
      (f.labels != null && !hashes(f.labels)) ||
      (f.drawn != null && !hashes(f.drawn)) ||
      (f.pages != null &&
        !(
          Array.isArray(f.pages) &&
          f.pages.length <= 100_000 &&
          f.pages.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              typeof p[0] === 'string' &&
              p[0].length <= 100 &&
              Number.isInteger(p[1]) &&
              p[1] >= 0,
          )
        )))
  )
    errors.push('forget may only hold all (true), labels, drawn (hashes) and pages ([lesson id, index])')
  if (!Array.isArray(l.pages) || l.pages.length > maxPages) {
    errors.push(`pages must be a list of at most ${maxPages}`)
    return errors
  }
  for (const [i, p] of l.pages.entries()) {
    const fields = p?.fields
    if (
      !p ||
      !Array.isArray(p.text) ||
      p.text.length > MAX_MARKS ||
      !p.text.every(isMark) ||
      (p.lines != null && !(Number.isInteger(p.lines) && p.lines >= p.text.length)) ||
      (p.image != null &&
        !(typeof p.image === 'string' && /^[0-9a-f]+$/.test(p.image) && p.image.length === (GRID * GRID) / 4)) ||
      !Array.isArray(fields) ||
      fields.length > maxFields ||
      (p.anchors != null && !(Array.isArray(p.anchors) && p.anchors.length <= maxFields && p.anchors.every(isMark))) ||
      (p.onDrawing != null &&
        !(
          Array.isArray(p.onDrawing) &&
          p.onDrawing.length <= 100 &&
          p.onDrawing.every((j) => Number.isInteger(j) && j >= 0 && j < fields.length)
        )) ||
      !fields.every(
        (x) =>
          !!x &&
          okSettings(x.settings, false) &&
          box4(x.box, 2) &&
          (x.anchor == null || (Number.isInteger(x.anchor) && x.anchor >= 0 && x.anchor < (p.anchors?.length ?? 0))) &&
          (x.dialogOnly == null || x.dialogOnly === true) &&
          CONDITIONS.every((k) => x[k] == null || okCondition(x[k])) &&
          (x.followUp == null ||
            (okCondition(x.followUp.when) &&
              Array.isArray(x.followUp.fields) &&
              x.followUp.fields.every((k) => typeof k === 'string'))),
      )
    ) {
      errors.push(`Page ${i + 1}: needs text (marks) and fields (settings, box)`)
      return errors
    }
    // Each page as a form of one page, without its conditions (they may use other pages).
    const e = validateFields(
      fields.map((x, j) => ({
        ...asField(x.settings, `f${j}`, 1, x.box),
        ...(x.group != null && { group: x.group }),
        ...(x.dialogOnly && { dialogOnly: true }),
      })),
      1,
      limits,
    )
    if (e.length) {
      errors.push(`Page ${i + 1}: ${e[0]}`)
      return errors
    }
  }
  // All pages as one form: conditions and follow-ups use fields that exist, never in a circle.
  const all = l.pages.flatMap((p, m) =>
    p.fields.map((x, j) => ({
      ...asField(x.settings, `p${m}_${j}`, m + 1, x.box),
      ...(x.group != null && { group: x.group }),
      ...(x.dialogOnly && { dialogOnly: true }),
      ...Object.fromEntries(CONDITIONS.filter((k) => x[k]).map((k) => [k, x[k]])),
      ...(x.followUp && { followUp: x.followUp }),
    })),
  )
  const e = validateFields(all, Math.max(1, l.pages.length), limits)
  if (e.length) errors.push(`Conditions: ${e[0]}`)
  return errors
}

/** How many times the admin drew a field next to a line, over its notes. */
const timesOf = (notes: { note: DrawnNote }[]) => notes.reduce((n, { note }) => n + (note.times ?? 1), 0)

/** Adds `v` to the list of `k`. */
function add<K, V>(map: Map<K, V[]>, k: K, v: V) {
  const list = map.get(k)
  if (list) list.push(v)
  else map.set(k, [v])
}

interface Vote {
  at: number
  keep: boolean
  /** The label as written, where a lesson has it. */
  label?: string
  change?: SettingsChange
}

/**
 * What the lessons know, oldest first: after the last "forget everything", without what a later lesson forgot.
 * Per label (hash), a vote of each lesson; per line, the fields drawn next to it; the pages set up before.
 */
function knowledge(lessons: Lesson[]) {
  const sorted = [...lessons].sort((a, b) => a.at - b.at)
  let start = 0
  for (const [i, l] of sorted.entries()) if (l.forget?.all) start = i
  const live = sorted.slice(start)
  const forgot = new Map<string, number>()
  const forgotPages = new Set<string>()
  for (const l of live) {
    for (const h of [...(l.forget?.labels ?? []), ...(l.forget?.drawn ?? [])]) forgot.set(h, l.at)
    for (const [id, i] of l.forget?.pages ?? []) forgotPages.add(`${id}#${i}`)
  }
  const known = (h: string, at: number) => at >= (forgot.get(h) ?? -Infinity)
  const votes = new Map<string, Vote[]>()
  const vote = (h: string, v: Vote) => known(h, v.at) && add(votes, h, v)
  const drawn = new Map<string, { at: number; note: DrawnNote }[]>()
  for (const l of live) {
    for (const n of l.labels)
      vote(labelHash(n.label), { at: l.at, keep: n.kept > 0, label: n.label, ...(n.change && { change: n.change }) })
    for (const h of l.kept ?? []) vote(h, { at: l.at, keep: true })
    for (const note of l.drawn ?? []) if (known(note.line, l.at)) add(drawn, note.line, { at: l.at, note })
  }
  const memories = live.flatMap((l) =>
    l.pages.flatMap((m, i) => (forgotPages.has(`${l.id}#${i}`) ? [] : [{ at: l.at, id: l.id, i, m }])),
  )
  return { votes, drawn, memories }
}

/** What the lessons say about a suggestion's label: leave it out, or change these settings; and the labels saying it. */
function verdict(votes: Map<string, Vote[]>, label: string) {
  const all: Vote[] = []
  const keys: string[] = []
  for (let k = labelKey(label), seen = new Set<string>(); k && !seen.has(k); ) {
    seen.add(k)
    const vs = votes.get(hash(k)) ?? []
    all.push(...vs)
    if (vs.some((v) => v.change || !v.keep)) keys.push(hash(k))
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
    keys,
  }
}

/** A suggestion as learning makes it: `ref` names it for conditions; `why` is what to forget to undo it. */
export type Suggestion = Omit<FieldDef, 'id' | 'key'> & { ref?: string; why?: Forget }

function applyChange(s: Suggestion, change: SettingsChange): Suggestion {
  const out: Record<string, unknown> = { ...s }
  for (const k of SETTINGS) {
    const v = change[k]
    if (v === null) delete out[k]
    else if (v !== undefined) out[k] = v
  }
  return out as Suggestion
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
  const { votes, drawn: drawnNotes, memories } = knowledge(valid)
  const drawnHere = new Map([...drawnNotes].filter(([, n]) => timesOf(n) >= DRAWN_TIMES))
  const index = new Map<string, number[]>()
  for (const [i, x] of memories.entries()) for (const [h] of x.m.text) add(index, h, i)
  const texts = memories.length || drawnHere.size ? await textOf(pdf, sources) : new Map<number, PageText>()
  const own = ownLines(texts, sources)
  const groups = new Map<string, string>()
  type Memory = (typeof memories)[number]

  // Pages without text of their own, known by their picture. A memory goes to the page most like it, one page each,
  // so pages that look alike (a scanned form's continuation pages) do not all take it.
  const byPicture = new Map<number, Memory[]>()
  const pictures = memories.filter((x) => x.m.image)
  if (pictures.length) {
    const scores: { n: number; x: Memory; score: number }[] = []
    for (const n of new Set(sources)) {
      const ink = own(n).length < MIN_OWN ? await inkOf(pdf, n) : undefined
      if (ink)
        for (const x of pictures) {
          const score = sameInk(ink, x.m.image!)
          if (score >= SAME_PICTURE) scores.push({ n, x, score })
        }
    }
    scores.sort((a, b) => b.score - a.score || b.x.at - a.x.at)
    const used = new Set<Memory>()
    for (const { n, x, score } of scores) {
      if (byPicture.has(n) || used.has(x)) continue
      // With the memories as like this page as it is: copies of the same page, from other saves.
      const copies = scores.filter((o) => o.n === n && o.score >= score - 0.01 && !used.has(o.x)).map((o) => o.x)
      copies.forEach((c) => used.add(c))
      byPicture.set(n, copies)
    }
  }

  // A page memory's fields on layout page `page`: each moves as the line nearest to it moved; without that line,
  // as most of the page's lines did.
  const place = ({ id, i, m }: Memory, shift: number[], here: Map<string, Line>, page: number) =>
    m.fields.map((f, j): Suggestion => {
      const a = f.anchor != null ? m.anchors?.[f.anchor] : undefined
      const moved = a && here.get(a[0])
      const [dx, dy] = moved ? [moved.x - a[1], moved.y - a[2]] : shift
      const [x, y, width, height] = f.box
      let group = f.group
      if (group) {
        const was = `${id}:${group.id}`
        if (!groups.has(was)) groups.set(was, newId())
        group = { ...group, id: groups.get(was)! }
      }
      const ours = (k: string) => `${id}|${k}`
      const s: Suggestion = {
        ...f.settings,
        ...(group && { group }),
        ...(f.dialogOnly && { dialogOnly: true }),
        source: 'ai',
        confidence: REMEMBERED,
        position: fitInPage({ page, x: x + dx, y: y + dy, width, height }),
        ref: ours(`p${i}_${j}`),
      }
      for (const k of CONDITIONS) if (f[k]) s[k] = renamed(f[k], ours)
      if (f.followUp)
        s.followUp = { ...f.followUp, when: renamed(f.followUp.when, ours)!, fields: f.followUp.fields.map(ours) }
      return s
    })

  return {
    /** The fields of a page set up before, placed on layout page `page`; null when the page is new. */
    remembered(source: number, page: number, onDrawing?: (p: Position) => boolean): Suggestion[] | null {
      const mine = own(source)
      const here = uniqueOn(texts.get(source)?.lines ?? [])
      const found: { x: Memory; score: number; shift: number[] }[] = []
      if (mine.length >= MIN_OWN) {
        const hits = new Map<number, number>()
        for (const l of mine) for (const i of index.get(l.h) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1)
        for (const [i, n] of hits) {
          const { m } = memories[i]
          const all = m.lines ?? m.text.length
          // The memory's share of its lines found here (from its sample), as Dice over all lines.
          const score = (2 * (n / m.text.length) * all) / (all + mine.length)
          const shift = score >= SAME_PAGE && steady(m.text, here)
          if (shift) found.push({ x: memories[i], score, shift })
        }
      } else found.push(...(byPicture.get(source) ?? []).map((x) => ({ x, score: 1, shift: [0, 0] })))
      found.sort((a, b) => b.score - a.score || b.x.at - a.x.at)
      // Forgetting this page forgets every memory of it.
      const why: Forget = { pages: found.map(({ x }) => [x.id, x.i]) }
      for (const { x, shift } of found) {
        const back = place(x, shift, here, page)
        // Most of the fields that sat on its boxes and lines do not: its drawing changed (the same text in another
        // form), it is not the page set up before.
        const sample = x.m.onDrawing ?? []
        const still = onDrawing ? sample.filter((j) => back[j] && onDrawing(back[j].position)).length : sample.length
        if (2 * still < sample.length) continue
        return back.map((s) => ({ ...s, why }))
      }
      return null
    },
    /** `s` with what the admin changed for its label, or null to leave it out. */
    adjust(s: Suggestion): Suggestion | null {
      const v = verdict(votes, s.label)
      if (v.drop) return null
      if (!Object.keys(v.change).length) return s
      const changed = applyChange(s, v.change)
      // A change that makes no valid field here (a list type without options) is not applied.
      if (same(changed, s) || validateFields([{ ...changed, id: 'x', key: 'x' }], pageCount).length) return s
      return { ...changed, confidence: LEARNT, why: { labels: v.keys } }
    },
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
    /**
     * The fields of a detection (`from`: the suggestion each was made of), with the conditions and follow-ups of
     * pages set up before pointing at the fields they were set up with. One whose fields did not all come back is
     * left out, and so is a follow-up's question nobody asks any more.
     */
    link(found: FieldDef[], from: Map<FieldDef, Suggestion>): FieldDef[] {
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
    },
  }
}

/** What auto-detect learnt (for a "what it learnt" view): changes and deletions per label, fields it draws, pages. */
export interface Learnt {
  /** Labels auto-detect changes or leaves out, newest first. `hash`: what `forget.labels` takes. */
  labels: { label: string; hash: string; drop: boolean; change: SettingsChange; at: number }[]
  /** Fields it draws next to a line (drawn there by hand `times` times), newest first. */
  drawn: { line: string; settings: FieldSettings; times: number; at: number }[]
  /** Pages it puts back as they were set up (a page saved in several sessions counts once). */
  pages: number
}

/** What the lessons taught, after what was forgotten. */
export function learnt(lessons: Lesson[] | undefined): Learnt {
  const unlimited = { maxFields: Infinity, maxPages: Infinity }
  const { votes, drawn, memories } = knowledge((lessons ?? []).filter((l) => !validateLesson(l, unlimited).length))
  const labels = [...votes]
    .flatMap(([h, vs]) => {
      const last = vs.slice(-2)
      const drop = last.length === 2 && !last[0].keep && !last[1].keep
      const change = Object.assign({}, ...vs.map((v) => v.change)) as SettingsChange
      const label = [...vs].reverse().find((v) => v.label)?.label
      const at = vs[vs.length - 1].at
      return label && (drop || Object.keys(change).length) ? [{ label, hash: h, drop, change, at }] : []
    })
    .sort((a, b) => b.at - a.at)
  const fields = [...drawn]
    .flatMap(([line, ns]) =>
      timesOf(ns) >= DRAWN_TIMES
        ? [{ line, settings: ns[ns.length - 1].note.settings, times: timesOf(ns), at: ns[ns.length - 1].at }]
        : [],
    )
    .sort((a, b) => b.at - a.at)
  const pages = new Set(memories.map(({ m }) => m.image ?? m.text.map((t) => t[0]).join()))
  return { labels, drawn: fields, pages: pages.size }
}
