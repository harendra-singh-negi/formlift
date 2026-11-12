import { describe, expect, test } from 'vitest'
import { newField } from './fields'
import {
  answerText,
  checkAnswer,
  cleanAnswers,
  defaultAnswers,
  evaluate,
  FIELD_TYPES,
  multiAnswer,
  multiValue,
  validateFields,
  type FieldDef,
  type FieldType,
} from './form-logic'

const field = (type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({
  ...newField(type, 1, 0.5, 0.5, []),
  ...extra,
})
const ok = (f: FieldDef, v: string | boolean) => expect(checkAnswer(f, v, true)).toBeNull()
const bad = (f: FieldDef, v: string | boolean) => expect(checkAnswer(f, v, true)).toBeTypeOf('string')

test('every type makes a valid new field', () => {
  for (const t of FIELD_TYPES) expect(validateFields([field(t)], 1), t).toEqual([])
})

describe('multiselect / checklist', () => {
  for (const t of ['multiselect', 'checklist'] as const) {
    const f = field(t, { options: ['A', 'B', 'C'] })
    test(`${t}: a JSON list of its options`, () => {
      ok(f, '["A","C"]')
      bad(f, '["A","Z"]') // not an option
      bad(f, 'A') // not a list
    })
    test(`${t}: none chosen counts as empty (required)`, () => {
      expect(checkAnswer(f, '[]', true)).toBe(`${f.label} is required`)
      expect(checkAnswer(f, '[]', false)).toBeNull()
    })
    test(`${t}: at least / at most choices`, () => {
      const g = { ...f, min: 2, max: 2 }
      bad(g, '["A"]')
      ok(g, '["A","B"]')
      bad(g, '["A","B","C"]')
    })
    test(`${t}: needs options`, () => {
      expect(validateFields([{ ...f, options: [] }], 1)).toHaveLength(1)
    })
  }
  test('helpers round-trip and survive junk', () => {
    expect(multiValue(multiAnswer(['A', 'B']))).toEqual(['A', 'B'])
    expect(multiAnswer([])).toBeNull()
    expect(multiValue('not json')).toEqual([])
    expect(multiValue('[1,"A"]')).toEqual(['A'])
  })
  test('"contains" conditions see a chosen option', () => {
    const answers = { m: '["Fire","Flood"]' }
    expect(evaluate({ logic: 'and', rules: [{ fieldKey: 'm', op: 'contains', value: 'flood' }] }, answers)).toBe(true)
  })
})

test('time and date & time', () => {
  const t = field('time')
  ok(t, '09:30')
  ok(t, '23:59:59')
  bad(t, '24:00')
  bad(t, '9:30')
  const d = field('datetime')
  ok(d, '2026-11-12T14:05')
  bad(d, '2026-11-12 14:05')
  bad(d, '2026-13-40T10:00')
})

test('url: http(s) only', () => {
  const f = field('url')
  ok(f, 'https://example.com/a?b=1')
  bad(f, 'example.com')
  bad(f, 'javascript:alert(1)')
})

test('currency: a number with at most `decimals` places, inside min / max', () => {
  const f = field('currency', { currency: '₹', decimals: 2, min: 0, max: 1000 })
  ok(f, '12.50')
  ok(f, '12')
  bad(f, '12.505')
  bad(f, '-1')
  bad(f, '1000.01')
  bad(f, 'abc')
  bad(field('currency', { decimals: 0 }), '1.5')
})

test('rating: whole stars from 1 to max (default 5)', () => {
  const f = field('rating')
  ok(f, '1')
  ok(f, '5')
  bad(f, '0')
  bad(f, '6')
  bad(f, '2.5')
  ok(field('rating', { max: 10 }), '10')
})

test('slider: inside its range, on its step', () => {
  const f = field('slider', { min: 0, max: 10, step: 0.5 })
  ok(f, '0')
  ok(f, '7.5')
  bad(f, '7.3')
  bad(f, '11')
  ok(field('slider', { min: 0, max: 1, step: 0.1 }), '0.3') // float slack
})

test('toggle: a boolean, like a checkbox', () => {
  const f = field('toggle')
  ok(f, true)
  expect(checkAnswer(f, false, false)).toBeNull() // "No" is an answer when optional...
  expect(checkAnswer(f, false, true)).toBe(`${f.label} is required`) // ...and must be "Yes" when required
  bad(f, 'yes')
  expect(cleanAnswers([f], { [f.key]: 'yes' })).toEqual({ [f.key]: false })
  expect(defaultAnswers([{ ...f, defaultValue: 'true' }])).toEqual({ [f.key]: true })
})

test('answerText: how answers read on the page, in lists and in the completed PDF', () => {
  expect(answerText(field('checklist', { options: ['A', 'B'] }), '["A","B"]')).toBe('A, B')
  expect(answerText(field('currency', { currency: '$', decimals: 2 }), '5')).toBe('$5.00')
  expect(answerText(field('rating', { max: 5 }), '4')).toBe('4 / 5')
  expect(answerText(field('datetime'), '2026-11-12T14:05')).toBe('2026-11-12 14:05')
  expect(answerText(field('toggle'), true)).toBe('Yes')
  expect(answerText(field('toggle'), false, 'Ja', 'Nein')).toBe('Nein')
  expect(answerText(field('text'), '')).toBe('')
})
