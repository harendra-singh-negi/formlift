// Question-list filters as plain objects. Nothing here decides what a form "should" show: each filter says what
// can be picked in this form (`options`, empty = nothing to filter on) and how a question passes (`test`). The
// built-ins are presets; pass your own list (any order, any subset, your own filters) wherever filters are taken.
import type { Answers, FieldType } from './form-logic'
import { choicesOf, isFilled, pickedOf, type Question } from './questions'

export interface FilterOption {
  value: string
  label: string
  /** How many questions have it. */
  count?: number
}

export interface QuestionFilterDef {
  /** Unique key: the filter's value is stored under it. */
  id: string
  title: string
  /** Where a UI may put it, e.g. a heading to group it under ("Progress") or "bar" for always visible. A hint only. */
  section?: string
  /** What can be picked in these questions. Counts may follow the answers. */
  options: (questions: Question[], answers: Answers) => FilterOption[]
  /** Whether a question passes when `value` is picked. */
  test: (q: Question, value: string, answers: Answers) => boolean
}

/** A filter, or a function making several from the questions (one per tag key, …). */
export type FilterSource = QuestionFilterDef | ((questions: Question[]) => QuestionFilterDef[])

/** Picked value per filter id (absent / null = not filtering on it). */
export type FilterValues = Record<string, string | null | undefined>

const counted = (questions: Question[], values: (q: Question) => string[], label = (v: string) => v) => {
  const m = new Map<string, number>()
  for (const q of questions) for (const v of new Set(values(q))) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m].map(([value, count]) => ({ value, label: label(value), count }))
}

const filledOptions = (yes: string, no: string): FilterOption[] => [
  { value: 'filled', label: yes },
  { value: 'empty', label: no },
]
function filledTest(parts: Question['parts'], value: string, answers: Answers) {
  if (!parts.length) return false // filtering on remarks: questions without a remarks box are not shown
  const any = parts.some((p) => isFilled(answers[p.field.key]))
  return value === 'filled' ? any : !any
}

/** Answered / not answered (any part of the question). */
export const answeredFilter = ({
  id = 'answered',
  title = 'Answered',
  yes = 'Answered',
  no = 'Not answered',
  section = 'Progress',
} = {}): QuestionFilterDef => ({
  id,
  title,
  section,
  options: (qs) => (qs.length ? filledOptions(yes, no) : []),
  test: (q, v, a) => filledTest(q.parts, v, a),
})

/**
 * Written / empty for the parts whose name or label matches `match` ("Remarks", "Comments", "Finding"…).
 * Offers nothing for a form without such parts.
 */
export function partFilter({
  id,
  title,
  match,
  yes = 'Written',
  no = 'Empty',
  section = 'Progress',
}: {
  id: string
  title: string
  match: RegExp
  yes?: string
  no?: string
  section?: string
}): QuestionFilterDef {
  const parts = (q: Question) => q.parts.filter((p) => match.test(p.name) || match.test(p.field.label))
  return {
    id,
    title,
    section,
    options: (qs) => (qs.some((q) => parts(q).length) ? filledOptions(yes, no) : []),
    test: (q, v, a) => filledTest(parts(q), v, a),
  }
}

/** Questions that offer an answer choice ("Yes", "NA", "As Expected"): choices offered by `min`+ questions. */
export const choiceFilter = ({
  id = 'choices',
  title = 'Has option',
  section = 'Answers',
  min = 2,
  max = 40,
} = {}): QuestionFilterDef => ({
  id,
  title,
  section,
  options: (qs) =>
    counted(qs, choicesOf)
      .filter((o) => o.count >= min)
      .slice(0, max),
  test: (q, v) => choicesOf(q).includes(v),
})

/** Questions answered with a choice (counts follow the answers). */
export const pickedFilter = ({
  id = 'picked',
  title = 'Answered with',
  section = 'Answers',
  min = 2,
  max = 40,
} = {}): QuestionFilterDef => ({
  id,
  title,
  section,
  options: (qs, answers) => {
    const offered = new Set(
      choiceFilter({ min, max })
        .options(qs, answers)
        .map((o) => o.value),
    )
    const picked = new Map(counted(qs, (q) => pickedOf(q, answers)).map((o) => [o.value, o.count]))
    return [...offered].map((c) => ({ value: c, label: c, count: picked.get(c) ?? 0 }))
  },
  test: (q, v, a) => pickedOf(q, a).includes(v),
})

/** By the category heading a question sits under (Question.category). */
export const categoryFilter = ({ id = 'category', title = 'Category', section = 'bar' } = {}): QuestionFilterDef => ({
  id,
  title,
  section,
  options: (qs) => counted(qs, (q) => (q.category ? [q.category] : [])),
  test: (q, v) => q.category === v,
})

/** By answer type (a question with any part of that type). */
export const typeFilter = ({
  id = 'type',
  title = 'Answer type',
  section = 'Answer type',
  label = (t: FieldType): string => t,
} = {}): QuestionFilterDef => ({
  id,
  title,
  section,
  options: (qs) => {
    const opts = counted(
      qs,
      (q) => q.parts.map((p) => p.field.type),
      (t) => label(t as FieldType),
    )
    return opts.length > 1 ? opts : []
  },
  test: (q, v) => q.parts.some((p) => p.field.type === v),
})

/** One filter on a tag key ("Risk": H / M / L) of Question.tags. */
export const tagFilter = (key: string, { title = key, section = 'Question details' } = {}): QuestionFilterDef => ({
  id: `tag:${key}`,
  title,
  section,
  options: (qs) =>
    counted(qs, (q) => (q.tags?.[key] ? [q.tags[key]] : [])).sort((a, b) =>
      a.value.localeCompare(b.value, undefined, { numeric: true }),
    ),
  test: (q, v) => q.tags?.[key] === v,
})

/** A tagFilter for every tag key in the questions. */
export const tagFilters =
  ({ section = 'Question details' } = {}) =>
  (qs: Question[]): QuestionFilterDef[] =>
    [...new Set(qs.flatMap((q) => Object.keys(q.tags ?? {})))].map((k) => tagFilter(k, { section }))

/** Your own filter in one line: `customFilter('deck', 'Deck', (q) => q.page <= 3 ? ['Upper'] : ['Lower'])`. */
export const customFilter = (
  id: string,
  title: string,
  valuesOf: (q: Question, answers: Answers) => string[],
  section?: string,
): QuestionFilterDef => ({
  id,
  title,
  section,
  options: (qs, answers) => counted(qs, (q) => valuesOf(q, answers)),
  test: (q, v, a) => valuesOf(q, a).includes(v),
})

/** The built-in presets, in the built-in UI's order. Start from it, filter it, or ignore it. */
export const builtinFilters = (labels: { type?: (t: FieldType) => string } = {}): FilterSource[] => [
  answeredFilter(),
  partFilter({ id: 'remarks', title: 'Remarks', match: /remark/i }),
  partFilter({ id: 'comments', title: 'Comments', match: /comment/i }),
  choiceFilter(),
  pickedFilter(),
  tagFilters(),
  typeFilter({ label: labels.type }),
  categoryFilter(),
]

/** The filter objects for these questions (functions expanded). */
export const resolveFilters = (sources: FilterSource[], questions: Question[]) =>
  sources.flatMap((s) => (typeof s === 'function' ? s(questions) : [s]))

/** The text search looks in: section, intro, title and the parts' labels. */
export const searchText = (q: Question) =>
  `${q.section ?? ''} ${q.intro ?? ''} ${q.title} ${q.parts.map((p) => p.field.label).join(' ')}`

/** The questions that pass the search and every picked filter value. */
export function filterQuestions(
  questions: Question[],
  answers: Answers,
  filters: QuestionFilterDef[],
  values: FilterValues,
  search = '',
) {
  const text = search.trim().toLowerCase()
  const active = filters.filter((f) => values[f.id] != null)
  return questions.filter(
    (q) =>
      (!text || searchText(q).toLowerCase().includes(text)) && active.every((f) => f.test(q, values[f.id]!, answers)),
  )
}
