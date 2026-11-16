// Labels: what the admin did with the suggestions of a label (deleted them, changed their type or settings) applies
// to every suggestion with that label, in any form.

import { overlap } from '../coords'
import { validateFields, type FieldDef, type Position } from '../form-logic'
import { LEARNT, SETTINGS, type EditSession, type LabelNote, type SettingsChange, type Suggestion } from './lesson'
import { hash, labelKey, norm, same } from './text'

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
export function notesOf({ before, suggested, saved }: EditSession, touched: Set<number>) {
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

export interface Vote {
  at: number
  keep: boolean
  /** The label as written, where a lesson has it. */
  label?: string
  change?: SettingsChange
}

/** What the lessons say about a suggestion's label: leave it out, or change these settings; and the labels saying it. */
export function verdict(votes: Map<string, Vote[]>, label: string) {
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

export function applyChange(s: Suggestion, change: SettingsChange): Suggestion {
  const out: Record<string, unknown> = { ...s }
  for (const k of SETTINGS) {
    const v = change[k]
    if (v === null) delete out[k]
    else if (v !== undefined) out[k] = v
  }
  return out as Suggestion
}

/** `s` with what the admin changed for its label (`votes`), or null to leave it out. */
export function adjust(votes: Map<string, Vote[]>, s: Suggestion, pageCount: number): Suggestion | null {
  const v = verdict(votes, s.label)
  if (v.drop) return null
  if (!Object.keys(v.change).length) return s
  const changed = applyChange(s, v.change)
  // A change that makes no valid field here (a list type without options) is not applied.
  if (same(changed, s) || validateFields([{ ...changed, id: 'x', key: 'x' }], pageCount).length) return s
  return { ...changed, confidence: LEARNT, why: { labels: v.keys } }
}

