import { describe, expect, test } from 'vitest'
import { newField, newFollowUpField, withField, withoutField } from './fields'
import {
  applyAnswer,
  cleanComments,
  fieldStates,
  openedFollowUps,
  validateAnswers,
  validateFields,
  type FieldDef,
  type FieldGroup,
} from './form-logic'

const box = (key: string, group?: FieldGroup): FieldDef => ({ ...newField('checkbox', 1, 0.5, 0.5, []), key, label: key, group })

describe('groups of boxes', () => {
  const single: FieldGroup = { id: 'q1', mode: 'single', required: true }
  const fields = [box('yes', single), box('no', single), box('na', single)]

  test('single: ticking one unticks the others; unticking leaves the rest alone', () => {
    let a = applyAnswer(fields, {}, fields[0], true)
    a = applyAnswer(fields, a, fields[1], true)
    expect(a).toEqual({ yes: false, no: true })
    expect(applyAnswer(fields, a, fields[1], false)).toEqual({ yes: false, no: false })
  })

  test('single + required: exactly one, error at the first box', () => {
    expect(validateAnswers(fields, {})).toEqual({ yes: 'Tick exactly one' })
    expect(validateAnswers(fields, { no: true })).toEqual({})
    // two ticked (a tampered request): caught on the server too
    expect(validateAnswers(fields, { yes: true, no: true })).toEqual({ yes: 'Tick exactly one' })
  })

  test('multiple: min / max; optional groups may stay empty', () => {
    const g: FieldGroup = { id: 'q2', mode: 'multiple', min: 2, max: 3 }
    const f = ['a', 'b', 'c', 'd'].map((k) => box(k, g))
    expect(validateAnswers(f, {})).toEqual({}) // not required, nothing ticked
    expect(validateAnswers(f, { a: true })).toEqual({ a: 'Tick at least 2' })
    expect(validateAnswers(f, { a: true, b: true })).toEqual({})
    expect(validateAnswers(f, { a: true, b: true, c: true, d: true })).toEqual({ a: 'Tick at most 3' })
    expect(validateAnswers(f.map((x) => ({ ...x, group: { ...g, min: undefined, required: true } })), {})).toEqual({
      a: 'Tick at least one',
    })
  })

  test('hidden members do not count', () => {
    const f = [box('yes', single), { ...box('no', single), hidden: true }]
    expect(validateAnswers(f, { no: true })).toEqual({ yes: 'Tick exactly one' })
  })

  test('validateFields: same settings on every member, boxes only', () => {
    expect(validateFields(fields, 1)).toEqual([])
    expect(validateFields([box('a', single), box('b', { ...single, mode: 'multiple' })], 1)).toEqual([
      'Group "q1": its members have different settings',
    ])
    const text = { ...newField('text', 1, 0.5, 0.5, []), group: single }
    expect(validateFields([text], 1)[0]).toMatch(/only checkboxes and toggles/)
  })
})

describe('follow-ups', () => {
  const trigger = { ...newField('radio', 1, 0.5, 0.5, []), key: 'ok', label: 'Certificates OK', options: ['Yes', 'No'] }
  let fields = newFollowUpField('textarea', trigger, [trigger])
  fields = newFollowUpField('date', fields[0], fields)
  const t = () => fields[0]
  const [reason, due] = [fields[1], fields[2]]
  fields = fields.map((f) =>
    f.id === t().id ? { ...f, followUp: { ...f.followUp!, when: { logic: 'and', rules: [{ fieldKey: 'ok', op: 'equals', value: 'No' }] } } } : f,
  )
  fields = fields.map((f) => (f.key === reason.key ? { ...f, required: true } : f))

  test('newFollowUpField: dialog-only fields the trigger asks', () => {
    expect(t().followUp!.fields).toEqual([reason.key, due.key])
    expect(reason.dialogOnly && due.dialogOnly).toBe(true)
    expect(validateFields(fields, 1)).toEqual([])
  })

  test('its fields count only while it is open', () => {
    expect(fieldStates(fields, { ok: 'Yes' })[reason.key]).toMatchObject({ visible: false, required: false })
    expect(fieldStates(fields, { ok: 'No' })[reason.key]).toMatchObject({ visible: true, required: true })
    expect(validateAnswers(fields, { ok: 'Yes' })).toEqual({})
    expect(validateAnswers(fields, { ok: 'No' })).toEqual({ [reason.key]: `${reason.label} is required` })
  })

  test('openedFollowUps: only when the condition turns true', () => {
    expect(openedFollowUps(fields, { ok: 'Yes' }, { ok: 'No' }).map((f) => f.key)).toEqual(['ok'])
    expect(openedFollowUps(fields, { ok: 'No' }, { ok: 'No' })).toEqual([])
  })

  test('renaming a field keeps follow-ups pointing at it', () => {
    const renamed = withField(fields, { ...reason, label: 'Why not' })
    const key = renamed.find((f) => f.id === reason.id)!.key
    expect(renamed[0].followUp!.fields).toEqual([key, due.key])
    const triggerRenamed = withField(fields, { ...t(), label: 'Certs' })
    expect(triggerRenamed[0].followUp!.when.rules[0]).toMatchObject({ fieldKey: triggerRenamed[0].key })
  })

  test('withoutField: a trigger takes its questions with it; a removed question leaves its follow-up', () => {
    expect(withoutField(fields, t().id)).toEqual([])
    const left = withoutField(fields, reason.id)
    expect(left.map((f) => f.key)).toEqual(['ok', due.key])
    expect(left[0].followUp!.fields).toEqual([due.key])
  })

  test('validateFields: unknown, not dialog-only, or asked twice', () => {
    const bad = fields.map((f) => (f.key === due.key ? { ...f, dialogOnly: undefined } : f))
    expect(validateFields(bad, 1)).toEqual([`Field "Certificates OK": follow-up field "${due.key}" must be dialog-only`])
    const twice = [...fields, { ...newField('toggle', 1, 0.5, 0.5, fields), followUp: t().followUp }]
    expect(validateFields(twice, 1).some((e) => e.includes('asked by two follow-ups'))).toBe(true)
  })
})

test('cleanComments: only fields that take comments, well-formed, newest maxComments kept', () => {
  const f = [{ ...newField('text', 1, 0.5, 0.5, []), key: 'a', comments: true }, { ...newField('text', 1, 0.5, 0.5, []), key: 'b' }]
  const c = (i: number) => ({ id: `c${i}`, text: `hi ${i}`, at: '2026-11-12T10:00:00Z', by: 'Asha', evil: 1 })
  const out = cleanComments(f, { a: [c(1), c(2), { id: 'x', text: '', at: 'now' }, 'junk'], b: [c(3)], z: [c(4)] }, { maxComments: 1 })
  expect(out).toEqual({ a: [{ id: 'c2', text: 'hi 2', by: 'Asha', at: '2026-11-12T10:00:00Z' }] })
})

test('nested follow-ups: a question of a closed follow-up never counts, however deep', () => {
  const a = { ...newField('radio', 1, 0.5, 0.5, []), key: 'a', label: 'A', options: ['Yes', 'No'] }
  let f = newFollowUpField('text', a, [a]) // A asks B
  const b = f[1]
  f = f.map((x) => (x.key === 'a' ? { ...x, followUp: { ...x.followUp!, when: { logic: 'and', rules: [{ fieldKey: 'a', op: 'equals', value: 'No' }] } } } : x))
  f = newFollowUpField('text', f[1], f) // B asks C
  const c = f[2]
  // B's follow-up is "on" by itself (B is empty, so B notEquals 'x'); C is required
  f = f.map((x) =>
    x.key === b.key
      ? { ...x, followUp: { ...x.followUp!, when: { logic: 'and', rules: [{ fieldKey: b.key, op: 'notEquals', value: 'x' }] } } }
      : x.key === c.key
        ? { ...x, required: true }
        : x,
  )
  expect(validateFields(f, 1)).toEqual([])
  expect(fieldStates(f, { a: 'Yes' })[c.key].visible).toBe(false) // A's follow-up closed: B and C never asked
  expect(validateAnswers(f, { a: 'Yes' })).toEqual({})
  expect(fieldStates(f, { a: 'No' })[c.key].visible).toBe(true)
  expect(validateAnswers(f, { a: 'No' })).toEqual({ [c.key]: `${c.label} is required` })
})
