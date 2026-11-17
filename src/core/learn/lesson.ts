// A lesson: what one editing session taught auto-detect, as plain JSON that the app stores and passes back with
// every lesson before it. Its types, the check a server runs before storing one (validateLesson), and how to keep a
// list of them (addLesson, forgetting).

import { newId } from '../fields'
import {
  FIELD_TYPES,
  resolveLimits,
  validateFields,
  type Condition,
  type FieldDef,
  type FieldGroup,
  type FieldType,
  type FollowUp,
  type Limits,
  type Rule,
} from '../form-logic'
import { GRID } from './picture'
import { okPlace, type Place } from './places'

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
export const SETTINGS = Object.keys(KINDS) as Setting[]
export const CONDITIONS = ['visibleWhen', 'requiredWhen', 'readOnlyWhen'] as const

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
  /**
   * Boxes (page fractions) of fields the admin had there and removed or moved away: suggested again there, never.
   * Other suggestions on the page are new to the admin (auto-detect did not make them then) and still come.
   */
  removed?: [x: number, y: number, width: number, height: number][]
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
  /** What was learnt about boxes by their cues (the examples of the lessons before this one). */
  patterns?: true
}

/**
 * What the admin did with one box on a page they changed: one auto-detect proposed (kept or deleted), or a field
 * they drew. By its cues (see cues.ts), so that it carries over to boxes like it in any form.
 */
export interface Example {
  /** Its cues: indexes in the lesson's `cues`. */
  c: number[]
  /** 1: a field the admin wanted there; 0: a box auto-detect proposed that they deleted or left empty. */
  y: 0 | 1
  /** For a box auto-detect proposed: how likely its rules said it was a field (0 to 1). */
  p?: number
  /** The type the admin gave it (y = 1). */
  t?: FieldType
  /** Required. */
  r?: true
  /** Answered together with the boxes beside it: one of them ('single', Y / N / NA) or any ('multiple'). */
  g?: 'single' | 'multiple'
  /** How many boxes were exactly like this. Default 1. */
  n?: number
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
  /** The cues its examples use: structure as it is ("k=cell", "h1"), words as hashes ("c:1x9…"). */
  cues?: string[]
  /** What the admin did with the boxes on the pages they changed (see Example). */
  examples?: Example[]
  /** Places of fields drawn by hand where auto-detect proposed nothing, next to a line (see places.ts). */
  places?: Place[]
  /** How many corrections the session's suggestions needed (see Score). */
  score?: Score
  forget?: Forget
}

/**
 * What a session did with auto-detect's suggestions: of `suggested`, how many were `deleted` and `changed` (type,
 * label, required, options, grouping, or moved), and how many fields were `drawn` by hand; `fields` saved. Their sum
 * is what auto-detect still got wrong, save after save: the editor's Learnt tab shows it.
 */
export interface Score {
  fields: number
  suggested: number
  deleted: number
  changed: number
  drawn: number
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
// Lines a page memory may hold, and cues and examples a lesson may hold (a lesson that comes in is checked).
const MAX_MARKS = 5000
const MAX_CUES = 100_000
export const MAX_EXAMPLES = 50_000
// A cue as lessons keep it: letters, digits and = | : . + ~ ^ $ - (words only as hashes).
const CUE = /^[\w=|:.+~^$-]{1,80}$/
const okExample = (e: Example, cues: number) =>
  !!e &&
  typeof e === 'object' &&
  Array.isArray(e.c) &&
  e.c.length <= 200 &&
  e.c.every((i) => Number.isInteger(i) && i >= 0 && i < cues) &&
  (e.y === 0 || e.y === 1) &&
  (e.p == null || (typeof e.p === 'number' && e.p >= 0 && e.p <= 1)) &&
  (e.t == null || (FIELD_TYPES as readonly string[]).includes(e.t)) &&
  (e.r == null || e.r === true) &&
  (e.g == null || e.g === 'single' || e.g === 'multiple') &&
  (e.n == null || (Number.isInteger(e.n) && e.n >= 1 && e.n <= 1_000_000)) &&
  Object.keys(e).every((k) => 'cypt rgn'.includes(k) && k.length === 1)

/** A field's own settings (what a lesson keeps of it). */
export const settingsOf = (f: FieldDef) =>
  Object.fromEntries(SETTINGS.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])) as FieldSettings

/** A suggestion as learning makes it: `ref` names it for conditions; `why` is what to forget to undo it. */
/**
 * A suggestion as learning makes it: `ref` names it for conditions; `why` is what to forget to undo it; `taught`:
 * the cues of the boxes admins kept that made pattern learning suggest it (or give it its type).
 */
export type Suggestion = Omit<FieldDef, 'id' | 'key'> & { ref?: string; why?: Forget; taught?: string[] }

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
      (f.patterns != null && f.patterns !== true) ||
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
    errors.push('forget may only hold all, patterns (true), labels, drawn (hashes) and pages ([lesson id, index])')
  if (l.places != null && !(Array.isArray(l.places) && l.places.length <= 1000 && l.places.every(okPlace)))
    errors.push('places must be a list of at most 1000 places: [r or b, dx, dy, width, height, line shape]')
  const sc = l.score as unknown as Record<string, unknown> | undefined
  const SCORE = ['fields', 'suggested', 'deleted', 'changed', 'drawn']
  if (
    sc != null &&
    !(
      typeof sc === 'object' &&
      Object.keys(sc).length === SCORE.length &&
      SCORE.every((k) => Number.isInteger(sc[k]) && (sc[k] as number) >= 0 && (sc[k] as number) <= 10_000_000)
    )
  )
    errors.push('score must hold fields, suggested, deleted, changed and drawn (counts)')
  const cues = l.cues
  if (cues != null && !(Array.isArray(cues) && cues.length <= MAX_CUES && cues.every((c) => typeof c === 'string' && CUE.test(c))))
    errors.push(`cues must be a list of at most ${MAX_CUES} cues`)
  else if (l.examples != null)
    if (!Array.isArray(l.examples) || l.examples.length > MAX_EXAMPLES)
      errors.push(`examples must be a list of at most ${MAX_EXAMPLES}`)
    else if (!l.examples.every((e) => okExample(e, cues?.length ?? 0)))
      errors.push('Every example needs c (cue indexes) and y (0 or 1), and only p (0 to 1), t (a type), r, g and n')
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
      (p.removed != null && !(Array.isArray(p.removed) && p.removed.length <= maxFields && p.removed.every((b) => box4(b, 2)))) ||
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
