import { useMemo, useState } from 'react'
import {
  builtinFilters,
  filterQuestions,
  resolveFilters,
  type FilterOption,
  type FilterSource,
  type FilterValues,
} from '../../core/filters'
import type { Answers } from '../../core/form-logic'
import type { Question } from '../../core/questions'
import { TYPE_LABEL } from '../constants'

/** The built-in filters (labels from formlift's UI). Pick from it by id, reorder it, add your own. */
export const defaultFilters: FilterSource[] = builtinFilters({ type: (t) => TYPE_LABEL[t] })

/** One filter, ready to draw: its options for this form, the picked value, and set(). */
export interface FilterGroup {
  id: string
  title: string
  section?: string
  options: FilterOption[]
  /** false = this form has nothing to filter on here (no options). Show it or not: your call. */
  available: boolean
  value: string | null
  /** Picks a value; null clears it. */
  set: (value: string | null) => void
}

export interface UseQuestionFilterOptions {
  /**
   * The filters, in order: filter objects / sources (see `formlift` core: categoryFilter, partFilter,
   * customFilter…) or ids of defaultFilters ('answered', 'remarks', 'comments', 'choices', 'picked', 'tags',
   * 'type', 'category'). Default: defaultFilters.
   */
  filters?: (FilterSource | string)[]
  /** Text search. Default true. */
  search?: boolean
  /** Starting state (e.g. restored from the URL). */
  initial?: { search?: string; values?: FilterValues }
  /** Your own rule, applied after the filters. */
  predicate?: (q: Question, answers: Answers) => boolean
  /** Every change (e.g. to keep it in the URL). */
  onChange?: (state: { search: string; values: FilterValues }) => void
}

const byId = (id: string): FilterSource | undefined => {
  if (id === 'tags') return defaultFilters.find((s) => typeof s === 'function')
  return defaultFilters.find((s) => typeof s !== 'function' && s.id === id)
}

/**
 * Search and filters over questions, as data. formlift decides nothing about what to show: every filter you
 * pass comes back as a group with `available` (does this form have anything to filter on?); you draw the ones
 * you want, the way you want. QuestionList uses the same hook.
 * While the filter stays the same, answers typed meanwhile do not make questions vanish mid-word.
 */
export function useQuestionFilter(
  questions: Question[],
  answers: Answers,
  { filters = defaultFilters, search: searchOn = true, initial, predicate, onChange }: UseQuestionFilterOptions = {},
) {
  const [values, setValues] = useState<FilterValues>(initial?.values ?? {})
  const [search, setSearchState] = useState(initial?.search ?? '')
  // The answers the filter last looked at; the list follows new answers when the filter changes.
  const [seen, setSeen] = useState(answers)
  const [version, setVersion] = useState(0)
  const update = (nextSearch: string, nextValues: FilterValues) => {
    setSearchState(nextSearch)
    setValues(nextValues)
    setSeen(answers)
    setVersion((v) => v + 1)
    onChange?.({ search: nextSearch, values: nextValues })
  }

  const key = filters.map((f) => (typeof f === 'string' ? f : typeof f === 'function' ? 'fn' : f.id)).join()
  const defs = useMemo(
    () =>
      resolveFilters(
        filters.map((f) => (typeof f === 'string' ? byId(f) : f)).filter((f): f is FilterSource => !!f),
        questions,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-resolve when the list's ids change, not on every render
    [key, questions],
  )

  const list = useMemo(() => {
    const shown = filterQuestions(questions, seen, defs, values, searchOn ? search : '')
    return predicate ? shown.filter((q) => predicate(q, seen)) : shown
  }, [questions, seen, defs, values, search, searchOn, predicate])

  const groups: FilterGroup[] = defs.map((d) => {
    const options = d.options(questions, answers)
    return {
      id: d.id,
      title: d.title,
      section: d.section,
      options,
      available: options.length > 0,
      value: values[d.id] ?? null,
      set: (v) => update(search, { ...values, [d.id]: v }),
    }
  })
  const picked = groups.filter((g) => g.value != null)

  return {
    groups,
    /** One group by id (undefined when not in `filters`). */
    group: (id: string) => groups.find((g) => g.id === id),
    /** The search text; null when search is off. */
    search: searchOn ? search : null,
    setSearch: (text: string) => update(text, values),
    values,
    /** Filters in use, as chips to take off one by one. */
    inUse: picked.map((g) => ({
      id: g.id,
      label: `${g.title}: ${g.options.find((o) => o.value === g.value)?.label ?? g.value}`,
      clear: () => g.set(null),
    })),
    active: !!search || picked.length > 0,
    clear: () => update('', {}),
    /** The questions that match, in form order. */
    list,
    total: questions.length,
    /** Bumps on every change (reset paging / scroll on it). */
    version,
  }
}

export type QuestionFilterState = ReturnType<typeof useQuestionFilter>
