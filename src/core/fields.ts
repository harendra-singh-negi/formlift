import { OPTION_TYPES, type FieldDef, type FieldType } from './form-logic'
import { KEY } from './form-logic/validate'
import { fitInPage } from './coords'

// Default box per type, in page fractions (an A4 page is ~0.6 wide in these units per 1/2 page).
const SIZES: Partial<Record<FieldType, [number, number]>> = {
  textarea: [0.4, 0.08],
  checkbox: [0.025, 0.018],
  radio: [0.35, 0.025],
  signature: [0.25, 0.06],
  checklist: [0.3, 0.1],
  multiselect: [0.3, 0.025],
  time: [0.12, 0.025],
  datetime: [0.22, 0.025],
  currency: [0.15, 0.025],
  rating: [0.15, 0.03],
  slider: [0.25, 0.03],
  toggle: [0.06, 0.025],
}

export const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `f${Date.now()}${Math.random()}`

/** A key not used yet: text_1, text_2… */
export function uniqueKey(base: string, fields: FieldDef[]) {
  const used = new Set(fields.map((f) => f.key))
  let i = 1
  while (used.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

/** The part of an automatic key before its number: "PERMIT NUMBER" → permit_number. */
function keyBase(label: string, type: FieldType) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return /^[a-z]/.test(slug) ? slug : `${type}${slug ? '_' + slug : ''}`
}

/** Why `key` cannot be this field's key, or null: as validateFields wants it (a letter, then letters, digits, _), not used by another field. */
export function keyProblem(key: string, id: string, fields: { id: string; key: string }[]): 'empty' | 'invalid' | 'taken' | null {
  if (!key) return 'empty'
  if (!KEY.test(key)) return 'invalid'
  return fields.some((f) => f.id !== id && f.key === key) ? 'taken' : null
}

/** A field key from a label: "PERMIT NUMBER" → permit_number_1 (unique among `fields`). */
export function keyFor(label: string, type: FieldType, fields: { key: string }[]) {
  return keyMaker(fields.map((f) => f.key))(label, type)
}

/**
 * keyFor for many new fields in a row, each call O(1) on average (a 1000-page form names 12000 fields): the keys
 * keyFor would give one after another. `taken`: the keys in use.
 */
export function keyMaker(taken: string[]) {
  const used = new Set(taken)
  const from = new Map<string, number>() // base → the next number that may be free
  return (label: string, type: FieldType) => {
    const base = keyBase(label, type)
    let i = from.get(base) ?? 1
    while (used.has(`${base}_${i}`)) i++
    from.set(base, i + 1)
    used.add(`${base}_${i}`)
    return `${base}_${i}`
  }
}

type Cond = FieldDef['visibleWhen']
const uses = (c: Cond, key: string): boolean =>
  !!c && c.rules.some((r) => ('rules' in r ? uses(r, key) : r.fieldKey === key))
const renameIn = (c: Cond, from: string, to: string): Cond =>
  c && {
    ...c,
    rules: c.rules.map((r) =>
      'rules' in r ? renameIn(r, from, to)! : r.fieldKey === from ? { ...r, fieldKey: to } : r,
    ),
  }

/**
 * `fields` with `f` put in place of the field with its id. A typed key (unique) is kept; an automatic key
 * (made from the label) follows a new label or type. Every condition that used the old key follows it.
 */
export function withField(fields: FieldDef[], f: FieldDef): FieldDef[] {
  const old = fields.find((x) => x.id === f.id)
  if (!old) return fields
  const others = fields.filter((x) => x.id !== f.id)
  const free = !others.some((x) => x.key === f.key)
  const typed = f.key !== old.key
  const automatic = old.key.replace(/_\d+$/, '') === keyBase(old.label, old.type)
  const relabeled = old.label !== f.label || old.type !== f.type
  const key = free && (typed || !relabeled || !automatic) ? f.key : keyFor(f.label, f.type, others)
  const next = { ...f, key }
  if (key === old.key) return fields.map((x) => (x.id === f.id ? next : x))
  const conds = ['visibleWhen', 'requiredWhen', 'readOnlyWhen'] as const
  return fields.map((x) => {
    // A field that does not use the old key stays the same object (a long form's thousands of fields do not change).
    const usesOld =
      conds.some((k) => uses(x[k], old.key)) || uses(x.followUp?.when, old.key) || x.followUp?.fields.includes(old.key)
    if (x.id !== f.id && !usesOld) return x
    const y = { ...(x.id === f.id ? next : x) }
    for (const k of conds) if (y[k]) y[k] = renameIn(y[k], old.key, key)
    if (y.followUp)
      y.followUp = {
        ...y.followUp,
        when: renameIn(y.followUp.when, old.key, key)!,
        fields: y.followUp.fields.map((k) => (k === old.key ? key : k)),
      }
    return y
  })
}

/** A new manual field of `type`, centred on the dropped point. */
export function newField(type: FieldType, page: number, x: number, y: number, fields: FieldDef[]): FieldDef {
  const [width, height] = SIZES[type] ?? [0.25, 0.025]
  // Label "Text", key text_1: the same pair a label edit would give (see withField).
  const label = type[0].toUpperCase() + type.slice(1)
  return {
    id: newId(),
    key: keyFor(label, type, fields),
    type,
    label,
    source: 'manual',
    position: fitInPage({ page, x: x - width / 2, y: y - height / 2, width, height }),
    ...(OPTION_TYPES.includes(type) ? { options: ['Option 1', 'Option 2'] } : {}),
  }
}

/**
 * `fields` without the field with this id: its follow-up's dialog-only fields go with it, and follow-ups stop
 * asking it.
 */
export function withoutField(fields: FieldDef[], id: string): FieldDef[] {
  const gone = fields.find((f) => f.id === id)
  if (!gone) return fields
  const drop = new Set([gone.key, ...(gone.followUp?.fields ?? [])])
  return fields
    .filter((f) => !drop.has(f.key))
    .map((f) =>
      f.followUp && f.followUp.fields.some((k) => drop.has(k))
        ? { ...f, followUp: { ...f.followUp, fields: f.followUp.fields.filter((k) => !drop.has(k)) } }
        : f,
    )
}

/** A dialog-only field asked by `trigger`'s follow-up (added to it), on the trigger's page. */
export function newFollowUpField(type: FieldType, trigger: FieldDef, fields: FieldDef[]): FieldDef[] {
  const f = { ...newField(type, trigger.position.page, 0.5, 0.5, fields), dialogOnly: true }
  const followUp = trigger.followUp ?? {
    when: { logic: 'and' as const, rules: [{ fieldKey: trigger.key, op: 'equals' as const, value: '' }] },
    fields: [],
  }
  return [...fields.map((x) => (x.id === trigger.id ? { ...x, followUp: { ...followUp, fields: [...followUp.fields, f.key] } } : x)), f]
}

/** A copy a little lower, with its own id and key. */
export function duplicate(f: FieldDef, fields: FieldDef[]): FieldDef {
  return {
    ...structuredClone(f),
    id: newId(),
    key: uniqueKey(f.key.replace(/_\d+$/, ''), fields),
    source: 'manual',
    confidence: undefined,
    // its follow-up's fields belong to the original (a field is asked by one follow-up)
    followUp: undefined,
    position: fitInPage({ ...f.position, y: f.position.y + f.position.height + 0.005 }),
  }
}

/** Moves the field at `from` one step up (-1) or down (+1) in the list = tab / fill order. */
export function reorder(fields: FieldDef[], id: string, step: -1 | 1) {
  const i = fields.findIndex((f) => f.id === id)
  const j = i + step
  if (i < 0 || j < 0 || j >= fields.length) return fields
  const out = [...fields]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/**
 * A new detection in place of `untouched` suggestions (the admin has not changed them): `fresh`, the suggestions
 * to add, and `gone`, the untouched ones to remove. One made again as it was (its confidence aside) stays as it is,
 * id and key too. An untouched one on a page detection did not reach (`reached`: pages done) stays.
 */
export function refreshed(untouched: FieldDef[], found: FieldDef[], reached: number) {
  // Its settings and box (to 0.0001 of the page: a page set up before keeps boxes so).
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4
  const asIs = ({ position: p, ...f }: FieldDef) =>
    JSON.stringify({ ...f, id: '', key: '', confidence: 0, at: [p.page, r4(p.x), r4(p.y), r4(p.width), r4(p.height)] })
  const twins = new Map<string, FieldDef[]>()
  for (const f of untouched) twins.set(asIs(f), [...(twins.get(asIs(f)) ?? []), f])
  const fresh: FieldDef[] = []
  for (const f of found) {
    const twin = twins.get(asIs(f))?.pop() // taken off the list: it stays
    if (!twin) fresh.push(f)
  }
  const gone = new Set([...twins.values()].flat().filter((f) => f.position.page <= reached))
  return { fresh, gone }
}
