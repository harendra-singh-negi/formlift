import type { FieldDef, FieldType } from './form-logic'
import { fitInPage } from './coords'

// Default box per type, in page fractions (an A4 page is ~0.6 wide in these units per 1/2 page).
const SIZES: Partial<Record<FieldType, [number, number]>> = {
  textarea: [0.4, 0.08],
  checkbox: [0.025, 0.018],
  radio: [0.35, 0.025],
  signature: [0.25, 0.06],
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `f${Date.now()}${Math.random()}`

/** A key not used yet: text_1, text_2… */
export function uniqueKey(base: string, fields: FieldDef[]) {
  const used = new Set(fields.map((f) => f.key))
  let i = 1
  while (used.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

/** A field key from a label: "IMO NUMBER" → imo_number_1 (unique among `fields`). */
export function keyFor(label: string, type: FieldType, fields: { key: string }[]) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const base = /^[a-z]/.test(slug) ? slug : `${type}${slug ? '_' + slug : ''}`
  const used = new Set(fields.map((f) => f.key))
  let i = 1
  while (used.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

type Cond = FieldDef['visibleWhen']
const renameIn = (c: Cond, from: string, to: string): Cond =>
  c && {
    ...c,
    rules: c.rules.map((r) =>
      'rules' in r ? renameIn(r, from, to)! : r.fieldKey === from ? { ...r, fieldKey: to } : r,
    ),
  }

/**
 * `fields` with `f` put in place of the field with its id. Keys are never typed: a new label gives a new key
 * (unique, from the label), and every condition that used the old key follows it.
 */
export function withField(fields: FieldDef[], f: FieldDef): FieldDef[] {
  const old = fields.find((x) => x.id === f.id)
  if (!old) return fields
  const others = fields.filter((x) => x.id !== f.id)
  const key =
    old.label === f.label && old.type === f.type && !others.some((x) => x.key === f.key)
      ? f.key
      : keyFor(f.label, f.type, others)
  const next = { ...f, key }
  if (key === old.key) return fields.map((x) => (x.id === f.id ? next : x))
  return fields.map((x) => {
    const y = { ...(x.id === f.id ? next : x) }
    for (const k of ['visibleWhen', 'requiredWhen', 'readOnlyWhen'] as const)
      if (y[k]) y[k] = renameIn(y[k], old.key, key)
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
    ...(type === 'dropdown' || type === 'radio' ? { options: ['Option 1', 'Option 2'] } : {}),
  }
}

/** A copy a little lower, with its own id and key. */
export function duplicate(f: FieldDef, fields: FieldDef[]): FieldDef {
  return {
    ...structuredClone(f),
    id: newId(),
    key: uniqueKey(f.key.replace(/_\d+$/, ''), fields),
    source: 'manual',
    confidence: undefined,
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
