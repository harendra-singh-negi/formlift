import { describe, expect, it } from 'vitest'
import { validateFields } from './form-logic'
import { duplicate, newField, reorder, uniqueKey, withField } from './fields'

describe('field helpers', () => {
  it('new fields get unique keys and a box inside the page', () => {
    const a = newField('text', 1, 0.99, 0.99, [])
    const b = newField('text', 1, 0.5, 0.5, [a])
    expect(a.key).toBe('text_1')
    expect(b.key).toBe('text_2')
    expect(a.position.x + a.position.width).toBeLessThanOrEqual(1)
    expect(validateFields([a, b], 1)).toEqual([])
  })

  it('dropdown and radio start with options so the mapping is valid', () => {
    expect(validateFields([newField('dropdown', 1, 0.5, 0.5, []), newField('radio', 2, 0.5, 0.5, [])], 2)).toEqual([])
  })

  it('duplicate gets a new id and key, same type and options', () => {
    const a = newField('radio', 1, 0.5, 0.5, [])
    const b = duplicate({ ...a, source: 'ai', confidence: 0.4 }, [a])
    expect(b.id).not.toBe(a.id)
    expect(b.key).toBe('radio_2')
    expect(b.source).toBe('manual')
    expect(b.options).toEqual(a.options)
    expect(b.options).not.toBe(a.options)
  })

  it('reorder swaps neighbours and ignores the ends', () => {
    const f = [newField('text', 1, 0.5, 0.1, [])]
    f.push(newField('text', 1, 0.5, 0.2, f))
    expect(reorder(f, f[1].id, -1).map((x) => x.key)).toEqual(['text_2', 'text_1'])
    expect(reorder(f, f[0].id, -1)).toBe(f)
  })

  it('uniqueKey skips used numbers', () => {
    expect(uniqueKey('x', [{ key: 'x_1' }, { key: 'x_3' }] as never)).toBe('x_2')
  })

  it('keys follow the label, stay unique, and conditions that use a key follow it', () => {
    const a = newField('text', 1, 0.5, 0.1, [])
    const b = newField('text', 1, 0.5, 0.2, [a])
    b.visibleWhen = { logic: 'and', rules: [{ fieldKey: a.key, op: 'isNotEmpty' }] }
    let f = withField([a, b], { ...a, label: 'Vessel Name' })
    expect(f[0].key).toBe('vessel_name_1')
    expect(f[1].visibleWhen?.rules[0]).toMatchObject({ fieldKey: 'vessel_name_1' })
    // The same label on another field still gets its own key.
    f = withField(f, { ...f[1], label: 'Vessel Name' })
    expect(f.map((x) => x.key)).toEqual(['vessel_name_1', 'vessel_name_2'])
    // A typed key is ignored when it would clash; moving the box keeps the key.
    expect(withField(f, { ...f[1], key: 'vessel_name_1' })[1].key).toBe('vessel_name_2')
    expect(withField(f, { ...f[1], position: { ...f[1].position, x: 0.1 } })[1].key).toBe('vessel_name_2')
    expect(validateFields(f, 1)).toEqual([])
  })
})
