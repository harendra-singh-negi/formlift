// The learning benchmark (test code, like everything in fixtures/): an admin sets up synthetic forms one after another (fixtures/forms.ts), each
// save teaches auto-detect, and every form is scored by the corrections it still needed. 'test' forms share no
// label, question or item with the 'train' forms, so what helps them is what carried over, not what was remembered.

import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { detectDocument, lessonFor, type Ops } from '../detect'
import { newId } from '../fields'
import { OPTION_TYPES, type FieldDef } from '../form-logic'
import { makeForm, type Form, type FormOptions, type TrueField } from './forms'
import type { Lesson } from '../learn'

/** What a form still needed after auto-detect: boxes to delete and to draw, types and groups to fix. */
export interface Score {
  form: string
  /** Fields it had to have. */
  fields: number
  /** Suggestions in the right place. */
  right: number
  /** Suggestions to delete. */
  wrong: number
  /** Fields to draw by hand. */
  missed: number
  /** Right place, wrong type. */
  types: number
  /** Y / N / NA rows not grouped as one answer. */
  groups: number
  /** All the changes the admin made: wrong + missed + types + groups. */
  corrections: number
}

const area = (p: { width: number; height: number }) => p.width * p.height
function shared(a: FieldDef['position'], t: TrueField) {
  if (a.page !== t.page) return 0
  const i =
    Math.max(0, Math.min(a.x + a.width, t.x + t.width) - Math.max(a.x, t.x)) *
    Math.max(0, Math.min(a.y + a.height, t.y + t.height) - Math.max(a.y, t.y))
  return i / (area(a) + area(t) - i)
}

/** Each true field with the suggestion in its place (or none). */
export function pair(found: FieldDef[], truth: TrueField[]) {
  const pairs = truth.flatMap((t, ti) => found.map((f, fi) => ({ ti, fi, s: shared(f.position, t) })))
  pairs.sort((a, b) => b.s - a.s)
  const byTruth = new Map<number, FieldDef>()
  const used = new Set<number>()
  for (const { ti, fi, s } of pairs) {
    if (s < 0.3) break
    if (byTruth.has(ti) || used.has(fi)) continue
    byTruth.set(ti, found[fi])
    used.add(fi)
  }
  return { byTruth, used }
}

export function score(form: Form, found: FieldDef[]): Score {
  const { byTruth, used } = pair(found, form.truth)
  let types = 0
  let groups = 0
  const rows = new Map<string, (FieldDef | undefined)[]>()
  form.truth.forEach((t, i) => {
    const f = byTruth.get(i)
    if (f && f.type !== t.type) types++
    if (t.group) rows.set(t.group, [...(rows.get(t.group) ?? []), f])
  })
  for (const members of rows.values()) {
    const ids = new Set(members.map((f) => f?.group?.mode === 'single' && f.group.id))
    // One group, all of them in it, and nothing else in it.
    const id = [...ids][0]
    const whole = ids.size === 1 && id && found.filter((f) => f.group?.id === id).length === members.length
    if (!whole) groups++
  }
  const wrong = found.length - used.size
  const missed = form.truth.length - byTruth.size
  return {
    form: form.name,
    fields: form.truth.length,
    right: byTruth.size,
    wrong,
    missed,
    types,
    groups,
    corrections: wrong + missed + types + groups,
  }
}

/** The form as the admin saves it: suggestions in the right place corrected, the others deleted, the rest drawn. */
export function corrected(form: Form, found: FieldDef[]): FieldDef[] {
  const { byTruth } = pair(found, form.truth)
  const groupIds = new Map<string, string>()
  const group = (t: TrueField) => {
    if (!t.group) return undefined
    if (!groupIds.has(t.group)) groupIds.set(t.group, newId())
    return { id: groupIds.get(t.group)!, mode: 'single' as const }
  }
  return form.truth.map((t, i): FieldDef => {
    const f = byTruth.get(i)
    const options = t.options ?? (OPTION_TYPES.includes(t.type) ? (f?.options ?? ['Yes', 'No']) : undefined)
    const base: FieldDef = f ?? {
      id: newId(),
      key: `drawn_${i}`,
      type: t.type,
      label: t.label,
      source: 'manual',
      position: { page: t.page, x: t.x, y: t.y, width: t.width, height: t.height },
    }
    const out: FieldDef = { ...base, type: t.type, options, group: group(t), required: t.required }
    for (const k of ['options', 'group', 'required'] as const) if (out[k] === undefined) delete out[k]
    return out
  })
}

async function open(form: Form) {
  const pdf = await getDocument({ data: form.bytes.slice(), verbosity: 0 }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const v = (await pdf.getPage(i)).view
    pages.push({ source: i, width: v[2] - v[0], height: v[3] - v[1] })
  }
  return { pdf, pages }
}

/** Auto-detect on a form with what `lessons` taught, scored. */
export async function detectAndScore(form: Form, lessons: Lesson[]) {
  const { pdf, pages } = await open(form)
  const found = await detectDocument(pdf as never, OPS as unknown as Ops, pages, [], undefined, undefined, lessons)
  return { found, score: score(form, found), pdf, pages }
}

/** What learning made worse on a form: boxes in the right place it no longer suggests, right types it changed. */
export function worse(form: Form, before: FieldDef[], after: FieldDef[]) {
  const [a, b] = [pair(before, form.truth).byTruth, pair(after, form.truth).byTruth]
  let dropped = 0
  let retyped = 0
  form.truth.forEach((t, i) => {
    const [fa, fb] = [a.get(i), b.get(i)]
    if (fa && !fb) dropped++
    if (fa?.type === t.type && fb && fb.type !== t.type) retyped++
  })
  return { dropped, retyped }
}

/**
 * An admin sets up `train` forms one after another (each save a lesson), then `test` forms are scored without and
 * with what was learnt (`worse`: what learning made worse on them). The test forms are only scored, not saved.
 */
export async function benchmark(train: FormOptions[], test: FormOptions[]) {
  const lessons: Lesson[] = []
  const learning: Score[] = []
  for (const [k, o] of train.entries()) {
    const form = await makeForm(o)
    const { found, score: s, pdf, pages } = await detectAndScore(form, lessons)
    learning.push(s)
    const session = { id: `s${k}`, before: [], suggested: found, saved: corrected(form, found) }
    const lesson = await lessonFor(pdf as never, pages, session, { OPS: OPS as unknown as Ops, at: k + 1 })
    if (lesson) lessons.push(lesson)
  }
  const before: Score[] = []
  const after: Score[] = []
  const harm = { dropped: 0, retyped: 0 }
  for (const o of test) {
    const form = await makeForm(o)
    const [a, b] = [await detectAndScore(form, []), await detectAndScore(form, lessons)]
    before.push(a.score)
    after.push(b.score)
    const w = worse(form, a.found, b.found)
    harm.dropped += w.dropped
    harm.retyped += w.retyped
  }
  return { learning, before, after, worse: harm, lessons }
}

/** The sum of each count over scores. */
export const total = (scores: Score[]) =>
  scores.reduce(
    (t, s) => ({
      fields: t.fields + s.fields,
      right: t.right + s.right,
      wrong: t.wrong + s.wrong,
      missed: t.missed + s.missed,
      types: t.types + s.types,
      groups: t.groups + s.groups,
      corrections: t.corrections + s.corrections,
    }),
    { fields: 0, right: 0, wrong: 0, missed: 0, types: 0, groups: 0, corrections: 0 },
  )
