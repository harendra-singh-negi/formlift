import { expect, it } from 'vitest'
import { categoryFilter, customFilter, filterQuestions, partFilter } from './filters'
import type { FieldDef } from './form-logic'
import { toQuestions, type Question } from './questions'

const field = (key: string, label: string, page = 1): FieldDef => ({
  id: key,
  key,
  label,
  type: 'text',
  source: 'manual',
  position: { page, x: 0.1, y: 0.1, width: 0.3, height: 0.03 },
})
const q = (id: string, label: string, extra: Partial<Question> = {}): Question => ({
  id,
  title: label,
  page: 1,
  parts: [{ field: field(id, label), name: '' }],
  ...extra,
})

it('reports a filter as unavailable when the form has nothing for it, instead of deciding to hide it', () => {
  const plain = [q('a', 'Name'), q('b', 'Rank')]
  expect(categoryFilter().options(plain, {})).toEqual([])
  const coded = [q('a', 'Name', { category: 'HF' }), q('b', 'Rank', { category: 'PR' })]
  expect(
    categoryFilter()
      .options(coded, {})
      .map((o) => o.value),
  ).toEqual(['HF', 'PR'])
})

it('runs your own filters and your own part words, not built-in ones', () => {
  const qs = [q('a', 'Finding'), q('b', 'Rank', { page: 3 })]
  const finding = partFilter({ id: 'finding', title: 'Finding', match: /finding/i })
  expect(filterQuestions(qs, { a: 'rust' }, [finding], { finding: 'filled' }).map((x) => x.id)).toEqual(['a'])
  const deck = customFilter('deck', 'Deck', (x) => [x.page > 2 ? 'Lower' : 'Upper'])
  expect(deck.options(qs, {})).toEqual([
    { value: 'Upper', label: 'Upper', count: 1 },
    { value: 'Lower', label: 'Lower', count: 1 },
  ])
  expect(filterQuestions(qs, {}, [deck], { deck: 'Lower' }).map((x) => x.id)).toEqual(['b'])
})

it('reads category codes only when asked to', () => {
  const fields = [field('a', 'One'), field('b', 'Two'), field('c', 'Three'), field('d', 'Four')]
  fields.forEach((f, i) => (f.position = { ...f.position, y: 0.2 + i * 0.2 }))
  const line = (text: string, y: number) => ({ text, x: 0.05, y, width: 0.05, height: 0.02, fontSize: 10 })
  const text = () => [line('HF', 0.15), line('PR', 0.35), line('HF', 0.55), line('PR', 0.75)]
  expect(toQuestions(fields, text).map((x) => x.category)).toEqual(['HF', 'PR', 'HF', 'PR'])
  expect(toQuestions(fields, text, { categoryCode: false }).map((x) => x.category)).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ])
})
