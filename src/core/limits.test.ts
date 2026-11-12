import { describe, expect, it } from 'vitest'
import { checkAnswer, DEFAULT_LIMITS, defaultLayout, validateAnswers, validateFields, validateLayout, type FieldDef } from './form-logic'

const field = (i: number): FieldDef => ({
  id: `f${i}`,
  key: `k${i}`,
  label: `Field ${i}`,
  type: 'text',
  source: 'manual',
  position: { page: 1, x: 0.1, y: 0.1, width: 0.1, height: 0.02 },
})

describe('limits', () => {
  it('uses the defaults when none are passed', () => {
    const many = Array.from({ length: DEFAULT_LIMITS.maxFields + 1 }, (_, i) => field(i))
    expect(validateFields(many, 1)).toEqual([`At most ${DEFAULT_LIMITS.maxFields} fields`])
    expect(validateFields(many, 1, { maxFields: 10_000 })).toEqual([])
  })

  it('applies overrides to fields, layout and answers', () => {
    expect(validateFields([field(1), field(2)], 1, { maxFields: 1 })).toEqual(['At most 1 fields'])
    expect(validateLayout(defaultLayout([{ width: 595, height: 842 }, { width: 595, height: 842 }]), 2, { maxPages: 1 })).toEqual([
      'At most 1 pages',
    ])
    expect(checkAnswer(field(1), 'abcdef', false, { maxAnswerLength: 5 })).toBe('At most 5 characters')
    expect(checkAnswer(field(1), 'abcdef', false)).toBeNull()
    expect(validateAnswers([field(1)], { k1: 'abcdef' }, { maxAnswerLength: 5 })).toEqual({ k1: 'At most 5 characters' })
  })
})

describe('custom validation', () => {
  const f = { ...field(1), key: 'imo', label: 'IMO' }
  const rules = {
    imo: { label: 'IMO number', check: (v: unknown) => (/^\d{7}$/.test(String(v)) ? null : 'IMO must be 7 digits') },
    notSame: { check: (v: unknown, _f: FieldDef, a: Record<string, unknown>) => (v === a.other ? 'Must differ' : null) },
  }

  it('runs named rules a field lists, with all answers', () => {
    const withRules = { ...f, rules: ['imo', 'notSame'] }
    expect(checkAnswer(withRules, '123', false, { rules })).toBe('IMO must be 7 digits')
    expect(validateAnswers([withRules], { imo: '1234567', other: '1234567' }, { rules })).toEqual({ imo: 'Must differ' })
    expect(checkAnswer(withRules, '1234567', false, { rules }, { other: 'x' })).toBeNull()
    expect(checkAnswer(withRules, '', false, { rules })).toBeNull() // empty: only "required" applies
  })

  it("uses the field's own messages and the app's wording", () => {
    expect(checkAnswer({ ...f, requiredMessage: 'Enter the IMO' }, '', true)).toBe('Enter the IMO')
    expect(checkAnswer({ ...f, pattern: '\\d+', errorMessage: 'Digits only' }, 'x', false)).toBe('Digits only')
    expect(checkAnswer(f, '', true, { messages: { required: (l) => `${l} ज़रूरी है` } })).toBe('IMO ज़रूरी है')
  })

  it('validate() can add an error, accept anything, or fall through', () => {
    const validate = (_f: FieldDef, v: unknown) => (v === 'bad' ? 'Nope' : v === 'any' ? null : undefined)
    expect(checkAnswer({ ...f, pattern: '\\d+' }, 'bad', false, { validate })).toBe('Nope')
    expect(checkAnswer({ ...f, pattern: '\\d+' }, 'any', false, { validate })).toBeNull()
    expect(checkAnswer({ ...f, pattern: '\\d+' }, 'x', false, { validate })).toBe('Has the wrong format')
  })

  it('rejects malformed rule settings in a form definition', () => {
    expect(validateFields([{ ...f, rules: 'imo' as unknown as string[] }], 1)).toEqual(['Field "IMO": rules must be a list of rule names'])
  })
})
