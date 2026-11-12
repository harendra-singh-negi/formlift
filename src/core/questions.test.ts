import { describe, expect, it } from 'vitest'
import type { FieldDef, FieldType } from './form-logic'
import type { TextLine } from './layout'
import { builtinFilters, filterQuestions, resolveFilters, tagFilter } from './filters'
import { choicesOf, pickedOf, toQuestions, type Question } from './questions'
import type { Answers } from './form-logic'

// The filters as the list used them before the registry: 'all' = not filtering on it.
const NO_FILTER = {
  search: '',
  answered: 'all',
  remarks: 'all',
  comments: 'all',
  type: 'all',
  category: 'all',
  choices: 'all',
  picked: 'all',
  tags: {} as Record<string, string>,
}
function matches(q: Question, answers: Answers, { search, tags, ...rest }: typeof NO_FILTER) {
  const values: Record<string, string> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== 'all'))
  for (const [k, v] of Object.entries(tags)) values[`tag:${k}`] = v
  const defs = [...resolveFilters(builtinFilters(), [q]), ...Object.keys(tags).map((k) => tagFilter(k))]
  return filterQuestions([q], answers, defs, values, search).length === 1
}

let n = 0
const f = (label: string, type: FieldType, x: number, y: number, height = 0.015): FieldDef => ({
  id: `f${++n}`,
  key: `k${n}`,
  label,
  type,
  source: 'ai',
  position: { page: 1, x, y, width: 0.05, height },
})

// Like AUD 06: a row "2.1.1 …" with Y / N / NA checkboxes and a Remarks box named only "Remarks"; a second row;
// "Vessel" and "Date" side by side on one line (two questions); a Comments box under an item.
const q1 = [
  f('2.1.1 Were the Master familiar… – Y', 'checkbox', 0.7, 0.2),
  f('2.1.1 Were the Master familiar… – N', 'checkbox', 0.75, 0.2),
  f('2.1.1 Were the Master familiar… – N A', 'checkbox', 0.8, 0.2),
  f('Remarks', 'textarea', 0.85, 0.195, 0.03),
]
const q2 = [
  f('2.1.2 Were all certificates on board? – Y', 'checkbox', 0.7, 0.25),
  f('Remarks', 'textarea', 0.85, 0.245, 0.03),
]
const line = [f('Vessel', 'text', 0.2, 0.1), f('Date', 'date', 0.6, 0.1)]
const comment = [f('1.1.8 Date the vessel was delivered – Comments', 'text', 0.2, 0.4)]
const all = [...q2, ...comment, ...line, ...q1] // any order: document order comes from the positions

describe('form as questions', () => {
  const qs = toQuestions(all)

  it('groups the fields of one line by question; a bare Remarks box joins the question on its line', () => {
    expect(qs.map((q) => [q.title, q.parts.map((p) => p.name)])).toEqual([
      ['Vessel', ['']],
      ['Date', ['']],
      ['2.1.1 Were the Master familiar…', ['Y', 'N', 'N A', 'Remarks']],
      ['2.1.2 Were all certificates on board?', ['Y', 'Remarks']],
      ['1.1.8 Date the vessel was delivered', ['Comments']],
    ])
  })

  it('filters: remark written / empty, comment, not answered, type, search', () => {
    const [, , first, second] = qs
    const answers = { [q1[0].key]: true, [q1[3].key]: 'Certificates OK', [comment[0].key]: '' }
    const titles = (patch: Partial<typeof NO_FILTER>) =>
      qs.filter((q) => matches(q, answers, { ...NO_FILTER, ...patch })).map((q) => q.title)
    expect(titles({ remarks: 'filled' })).toEqual([first.title])
    expect(titles({ remarks: 'empty' })).toEqual([second.title]) // questions without a Remarks box are left out
    expect(titles({ comments: 'empty' })).toEqual(['1.1.8 Date the vessel was delivered'])
    expect(titles({ answered: 'empty' })).toEqual([
      'Vessel',
      'Date',
      second.title,
      '1.1.8 Date the vessel was delivered',
    ])
    expect(titles({ type: 'date' })).toEqual(['Date'])
    expect(titles({ search: 'CERTIFICATES' })).toEqual([second.title])
    expect(titles({ answered: 'filled', remarks: 'filled', search: 'master' })).toEqual([first.title])
  })

  it('titles from the page text: a table is one question under its title, a cut label gets the whole question', () => {
    const t = (text: string, x: number, y: number, width: number): TextLine => ({
      text,
      x,
      y,
      width,
      height: 0.014,
      fontSize: 9,
    })
    const text = [
      t('Inspector’s Inspection Results – List of Observations', 0.25, 0.5, 0.55),
      t('(A copy of this page, including the complete list of observations, shall be handed over', 0.1, 0.516, 0.8),
      t('No.', 0.1, 0.55, 0.03),
      t('Were the Master familiar with the company procedure for certificates?', 0.3, 0.2, 0.38),
      t('Sailing Visit:', 0.05, 0.3, 0.1),
      t('Yes', 0.25, 0.3, 0.03),
    ]
    const row = (y: number) => [f('No', 'text', 0.1, y), f('Description', 'text', 0.3, y), f('Remarks', 'text', 0.6, y)]
    const sailing = [f('Yes', 'checkbox', 0.29, 0.3), f('No', 'checkbox', 0.4, 0.3)]
    const qs = toQuestions([q1[0], ...sailing, ...row(0.6), ...row(0.63)], () => text)
    expect(qs.map((q) => q.title)).toEqual([
      'Were the Master familiar with the company procedure for certificates?',
      'Sailing Visit:',
      'Inspector’s Inspection Results – List of Observations',
    ])
    expect([qs[2].columns, qs[2].rows, qs[2].rowNames]).toEqual([['No', 'Description', 'Remarks'], [3, 3], undefined])
  })
})

describe('option grids', () => {
  it('makes a grid of checkboxes one question under the heading right above it, until the grid ends', () => {
    const t = (text: string, x: number, y: number): TextLine => ({ text, x, y, width: 0.2, height: 0.012, fontSize: 9 })
    const text = [
      t('OPERATIONS AT THE TIME OF INSPECTION:', 0.05, 0.1),
      t('Loading', 0.08, 0.12),
      t('Discharging', 0.4, 0.12),
      t('At sea', 0.08, 0.135),
      t('Attending Inspector’s Qualifications (tick all boxes that apply)', 0.3, 0.2),
      t('BRM', 0.4, 0.22),
      t('PLACE OF INSPECTION:', 0.05, 0.3),
    ]
    const fs = [
      f('Loading', 'checkbox', 0.05, 0.12, 0.012),
      f('Discharging', 'checkbox', 0.37, 0.12, 0.012),
      f('At sea', 'checkbox', 0.05, 0.135, 0.012),
      f('BRM', 'checkbox', 0.45, 0.22, 0.012),
      f('PLACE OF INSPECTION', 'text', 0.3, 0.3, 0.012),
    ]
    expect(toQuestions(fs, () => text).map((q) => [q.title, q.parts.map((p) => p.name)])).toEqual([
      ['OPERATIONS AT THE TIME OF INSPECTION:', ['Loading', 'Discharging', 'At sea']],
      ['Attending Inspector’s Qualifications (tick all boxes that apply)', ['BRM']],
      ['PLACE OF INSPECTION', ['']],
    ])
    expect(toQuestions(fs, () => text).map((q) => q.rows)).toEqual([[2, 1], [1], undefined])
  })
})

describe('question with parts on one line', () => {
  it('"LAST PSC INSPECTION: Place ___ Date ___" is one question; "SHIP ___ GT ___" stays two', () => {
    const fs = [
      f('SHIP', 'text', 0.2, 0.1),
      f('GT', 'text', 0.6, 0.1),
      f('LAST PSC INSPECTION: Place', 'text', 0.3, 0.2),
      f('Date', 'date', 0.6, 0.2),
      f('DATE OF INSPECTION: From', 'date', 0.3, 0.3),
      f('To', 'date', 0.6, 0.3),
      f('Port: Name', 'text', 0.6, 0.4),
      f('Flag: Code', 'text', 0.8, 0.4),
    ]
    expect(toQuestions(fs).map((q) => [q.title, q.parts.map((p) => p.name)])).toEqual([
      ['SHIP', ['']],
      ['GT', ['']],
      ['LAST PSC INSPECTION', ['Place', 'Date']],
      ['DATE OF INSPECTION', ['From', 'To']],
      ['Port', ['Name']],
      ['Flag', ['Code']],
    ])
  })
})

describe('option grids in other layouts', () => {
  const t = (text: string, x: number, y: number, height = 0.012): TextLine => ({
    text,
    x,
    y,
    width: 0.2,
    height,
    fontSize: 9,
  })
  const box = (label: string, x: number, y: number) => f(label, 'checkbox', x, y, 0.012)
  const shape = (fs: FieldDef[], text: TextLine[]) =>
    toQuestions(fs, () => text).map((q) => [q.title, q.parts.map((p) => p.name), q.rows])

  it('no heading: one line of boxes is one question named by its options; the next line is its own', () => {
    const text = [t('Full time', 0.08, 0.2), t('Part time', 0.3, 0.2), t('Yes', 0.08, 0.215), t('No', 0.3, 0.215)]
    const fs = [
      box('Full time', 0.05, 0.2),
      box('Part time', 0.27, 0.2),
      box('Yes', 0.05, 0.215),
      box('No', 0.27, 0.215),
    ]
    expect(shape(fs, text)).toEqual([
      ['Full time / Part time', ['Full time', 'Part time'], [2]],
      ['Yes / No', ['Yes', 'No'], undefined], // bare Yes / No: the line's column question, as before
    ])
  })

  it('heading over a note line, and a double-spaced single column of boxes', () => {
    const text = [
      t('SAFETY EQUIPMENT', 0.05, 0.1),
      t('(tick all that apply)', 0.05, 0.114),
      t('Lifebuoys', 0.08, 0.135),
      t('Fire extinguishers', 0.08, 0.162),
      t('EPIRB', 0.08, 0.189),
    ]
    const fs = [box('Lifebuoys', 0.05, 0.135), box('Fire extinguishers', 0.05, 0.162), box('EPIRB', 0.05, 0.189)]
    expect(shape(fs, text)).toEqual([
      ['SAFETY EQUIPMENT (tick all that apply)', ['Lifebuoys', 'Fire extinguishers', 'EPIRB'], [1, 1, 1]],
    ])
  })

  it('boxes beside a running text block (a side column) are not a grid, whatever is above them', () => {
    const text = [
      t('Practical Guidelines', 0.45, 0.144),
      t('Human', 0.13, 0.161),
      t('The Inspector is expected to interview the Master…', 0.23, 0.161),
    ]
    expect(shape([box('Human', 0.2, 0.161)], text)).toEqual([['Human', [''], undefined]])
  })

  it('a " – " inside option names is not a Row – Column label when every box has its own', () => {
    const text = [
      t('Supporting Documents', 0.1, 0.1),
      t('Log-24a (Job Orders – Engine)', 0.05, 0.12),
      t('Log-24b (Job Orders – Deck)', 0.4, 0.12),
    ]
    const fs = [box('Log-24a (Job Orders – Engine)', 0.3, 0.12), box('Log-24b (Job Orders – Deck)', 0.65, 0.12)]
    expect(shape(fs, text)).toEqual([
      ['Supporting Documents', ['Log-24a (Job Orders – Engine)', 'Log-24b (Job Orders – Deck)'], [2]],
    ])
  })
})

describe('tables as on the document', () => {
  it('a side heading on the first row ("INSPECTOR – RANK") names the table; the rows stay one table', () => {
    const row = (y: number, first = 'RANK') => [
      f(first, 'text', 0.25, y),
      f('NAME', 'text', 0.45, y),
      f('SIGNATURE', 'signature', 0.65, y),
      f('DATE', 'date', 0.85, y),
    ]
    const qs = toQuestions([...row(0.8, 'INSPECTOR – RANK'), ...row(0.83), ...row(0.86)])
    expect(qs.map((q) => [q.title, q.columns, q.rows, q.rowNames])).toEqual([
      ['INSPECTOR', ['RANK', 'NAME', 'SIGNATURE', 'DATE'], [4, 4, 4], undefined],
    ])
  })

  it('rows named on their left stay named; Y / N question rows are not a table', () => {
    const t = (text: string, x: number, y: number): TextLine => ({ text, x, y, width: 0.1, height: 0.015, fontSize: 9 })
    const row = (y: number) => [f('Quantity', 'text', 0.3, y), f('Remarks', 'text', 0.6, y)]
    const qs = toQuestions([...row(0.3), ...row(0.33), ...q1, ...q2], () => [
      t('Gloves', 0.05, 0.3),
      t('Boots', 0.05, 0.33),
    ])
    expect(qs.map((q) => [q.title, q.rowNames])).toEqual([
      ['2.1.1 Were the Master familiar…', undefined],
      ['2.1.2 Were all certificates on board?', undefined],
      ['Quantity / Remarks', ['Gloves', 'Boots']],
    ])
  })
})

describe('numbered rows', () => {
  it('"1 – Type of Training Need …" rows and a list of inputs named "1", "2" are tables with numbered rows', () => {
    const row = (n: number, y: number) => [
      f(`${n} – Type of Training Need`, 'text', 0.14, y),
      f(`${n} – Name/Rank`, 'text', 0.5, y),
      f(`${n} – Close Out Date`, 'date', 0.8, y),
    ]
    const list = [1, 2, 3].map((n) => f(String(n), 'text', 0.14, 0.4 + n * 0.02))
    const yn = [f('Y', 'checkbox', 0.7, 0.7), f('Y', 'checkbox', 0.7, 0.72)] // lone "Y" boxes are not numbered rows
    const qs = toQuestions([...row(1, 0.1), ...row(2, 0.12), ...list, ...yn])
    expect(qs.map((q) => [q.title, q.columns, q.rowNames])).toEqual([
      [
        'Type of Training Need / Name/Rank / Close Out Date',
        ['Type of Training Need', 'Name/Rank', 'Close Out Date'],
        ['1', '2'],
      ],
      ['List', [''], ['1', '2', '3']],
      ['Y', undefined, undefined],
      ['Y', undefined, undefined],
    ])
  })
})

describe('table column names', () => {
  it('one named column names the table; columns named after the title are not shown', () => {
    const t = (text: string, y: number): TextLine => ({ text, x: 0.11, y, width: 0.8, height: 0.014, fontSize: 9 })
    const one = [1, 2].map((n) => f(`${n} – Best Practices Identified`, 'text', 0.14, 0.1 + n * 0.02))
    const two = [1, 2].flatMap((n) => [
      f(`${n} – PMS RECORDS`, 'text', 0.14, 0.5 + n * 0.02),
      f(`${n} – PMS RECORDS`, 'text', 0.67, 0.5 + n * 0.02),
    ])
    const qs = toQuestions([...one, ...two], () => [t('PMS RECORDS', 0.49)])
    expect(qs.map((q) => [q.title, q.columns, q.rowNames])).toEqual([
      ['Best Practices Identified', [''], ['1', '2']],
      ['PMS RECORDS', ['', ''], ['1', '2']],
    ])
  })
})

describe('table header row from the page', () => {
  it('cells named only "1", "1", "1" get their columns from the header line written over the table', () => {
    const t = (text: string, x: number, width: number): TextLine => ({
      text,
      x,
      y: 0.205,
      width,
      height: 0.014,
      fontSize: 9,
    })
    const text = [
      t('No.', 0.11, 0.02),
      t('Training Topic', 0.26, 0.12),
      t('Name/Rank', 0.6, 0.09),
      t('Date', 0.86, 0.03),
    ]
    const row = (n: number, y: number) => [
      { ...f(String(n), 'text', 0.14, y, 0.018), position: { page: 1, x: 0.14, y, width: 0.35, height: 0.018 } },
      { ...f(String(n), 'text', 0.5, y, 0.018), position: { page: 1, x: 0.5, y, width: 0.3, height: 0.018 } },
      { ...f(String(n), 'date', 0.8, y, 0.018), position: { page: 1, x: 0.8, y, width: 0.15, height: 0.018 } },
    ]
    const [q] = toQuestions([...row(1, 0.226), ...row(2, 0.248)], () => text)
    expect([q.columns, q.rowNames]).toEqual([
      ['Training Topic', 'Name/Rank', 'Date'],
      ['1', '2'],
    ])
  })
})

describe('one-column table header', () => {
  it('a name centred over a numbered list names it; the last line of a paragraph above does not', () => {
    const t = (text: string, x: number, y: number, width: number): TextLine => ({
      text,
      x,
      y,
      width,
      height: 0.014,
      fontSize: 9,
    })
    const box = (n: number, y: number) => ({
      ...f(String(n), 'text', 0.14, y),
      position: { page: 1, x: 0.14, y, width: 0.81, height: 0.018 },
    })
    const text = [
      t('detailed information for review.', 0.11, 0.372, 0.4),
      t('Best Practices Identified', 0.34, 0.488, 0.37),
    ]
    const qs = toQuestions([box(1, 0.39), box(2, 0.412), box(1, 0.509), box(2, 0.531)], () => text)
    expect(qs.map((q) => q.title)).toEqual(['List', 'Best Practices Identified'])
  })
})

describe('categories', () => {
  const t = (text: string, x: number, y: number): TextLine => ({ text, x, y, width: 0.04, height: 0.01, fontSize: 9 })
  // Audit checklists: "HW" / "PR" / "HF" centred over each block; the answer boxes on the right start a bit above it.
  const page = [
    t('HW', 0.39, 0.1),
    t('Yes', 0.76, 0.1), // a box's name on the code's line does not hide it
    t('PR', 0.39, 0.3),
    t('HF', 0.39, 0.5),
    t('HW', 0.39, 0.7),
    t('PR', 0.39, 0.8),
    t('RANK', 0.1, 0.9), // a header row of codes is not a category
    t('NAME', 0.3, 0.9),
  ]
  const fs = [
    f('A1. Visual defect?', 'checkbox', 0.74, 0.1),
    f('Finding', 'textarea', 0.1, 0.2, 0.03),
    f('B1. Procedures?', 'checkbox', 0.74, 0.295),
    f('C1. Familiar?', 'checkbox', 0.74, 0.52),
    f('D1. Free of defects?', 'checkbox', 0.74, 0.72),
  ]
  const qs = toQuestions(fs, () => page)

  it('takes the code above each question, one card per category block', () => {
    expect(qs.map((q) => q.category)).toEqual(['HW', 'PR', 'HF', 'HW'])
    // The Finding box under the HW options is part of the same card.
    expect(qs[0].parts.map((p) => p.field.label)).toEqual(['A1. Visual defect?', 'Finding'])
    expect(
      qs.filter((q) => matches(q, {}, { ...NO_FILTER, category: 'PR' })).map((q) => q.parts[0].field.label),
    ).toEqual(['B1. Procedures?'])
  })

  it('none unless two codes come back (a form without categories)', () => {
    expect(toQuestions(fs, () => page.slice(0, 5)).some((q) => q.category)).toBe(false)
  })
})

describe('sections', () => {
  const t = (text: string, x: number, y: number, width = 0.5): TextLine => ({
    text,
    x,
    y,
    width,
    height: 0.01,
    fontSize: 9,
  })
  const page = [
    t('2.1.1 Maintenance of statutory', 0.1, 0.05, 0.8), // runs to the right edge (0.9)
    t('Certificates', 0.1, 0.062, 0.1), // wrapped onto the next line
    t('Note: see the class records.', 0.1, 0.074, 0.3), // the heading ended: not joined
    t('5.9.2 / 5.10.2 / 5.11.1', 0.1, 0.4), // an index, not a heading
    t('2.1.2 Were all certificates on board?', 0.1, 0.6), // has a field on its line: a question itself
  ]
  const fs = [
    f('A1. Visual defect?', 'checkbox', 0.74, 0.1),
    f('Finding', 'textarea', 0.1, 0.2, 0.03),
    f('After the index', 'text', 0.6, 0.45),
    f('2.1.2 Were all certificates on board? – Y', 'checkbox', 0.74, 0.6),
  ]

  it('each question shows the numbered heading above it', () => {
    const qs = toQuestions(fs, () => page)
    expect(qs.map((q) => q.section)).toEqual(Array(4).fill('2.1.1 Maintenance of statutory Certificates'))
    expect(qs.filter((q) => matches(q, {}, { ...NO_FILTER, search: 'statutory' }))).toHaveLength(4)
  })
})

describe('a column of boxes beside a block of text', () => {
  const t = (text: string, x: number, y: number, width = 0.4): TextLine => ({
    text,
    x,
    y,
    width,
    height: 0.01,
    fontSize: 9,
  })
  // Audit checklists: "HW" over the block; Yes / No / NA one under another beside A1… (the first box level with "HW").
  const page = [
    t('2.1.1 Maintenance of statutory Certificates', 0.06, 0.08),
    t('HW', 0.39, 0.113, 0.02),
    t('A. Vessel is free of:', 0.06, 0.125),
    t('A1. Any visual defect (but not yet', 0.06, 0.139),
    t('assessed by class)?', 0.08, 0.151),
    t('A2. Condition of Class?', 0.06, 0.164),
    t('Yes', 0.76, 0.113, 0.02),
    t('No', 0.76, 0.127, 0.02),
    t('NA', 0.76, 0.141, 0.02),
    t('Finding', 0.07, 0.2, 0.04),
    t('PR', 0.39, 0.26, 0.02),
    t('PR', 0.39, 0.5, 0.02),
    t('HW', 0.39, 0.6, 0.02),
  ]
  const box = (label: string, y: number) => f(label, 'checkbox', 0.74, y, 0.011)
  const fs = [
    box('Yes', 0.112),
    box('No', 0.126),
    box('NA', 0.14),
    f('2.1.1 Maintenance of statutory Certificates – HW – Finding', 'textarea', 0.12, 0.198, 0.04),
  ]

  it('is one question titled by the text, with its Finding', () => {
    const [q, ...rest] = toQuestions(fs, () => page)
    expect(rest).toEqual([])
    expect(q.title).toBe(
      'A. Vessel is free of:\nA1. Any visual defect (but not yet assessed by class)?\nA2. Condition of Class?',
    )
    expect(q.parts.map((p) => p.name)).toEqual(['Yes', 'No', 'NA', 'Finding'])
    expect(q.rows).toEqual([3])
    expect([q.category, q.section]).toEqual(['HW', '2.1.1 Maintenance of statutory Certificates'])
  })

  it('a row of boxes on one line is not a column', () => {
    const row = [f('Q – Yes', 'checkbox', 0.6, 0.3), f('Q – No', 'checkbox', 0.7, 0.3)]
    expect(toQuestions(row, () => page).map((q) => q.block)).toEqual([undefined])
  })
})

describe('tags', () => {
  const t = (text: string, y: number): TextLine => ({ text, x: 0.06, y, width: 0.4, height: 0.01, fontSize: 9 })
  const page = [
    t('2.1.1 Maintenance of statutory Certificates', 0.05),
    t('Classification: Core , Risk: H , Assigned to: MASTER', 0.3), // under the questions: still all of 2.1.1
    t('2.2.1 Inspector inspection', 0.4),
    t('Classification: Rotational 2 , Risk: M , Assigned to: Chief Officer', 0.6),
    t('Name: John , Date: today', 0.7), // keys seen in one numbered question only: not filters
  ]
  const fs = [
    f('A1. Visual defect?', 'checkbox', 0.74, 0.1),
    f('B1. Procedures?', 'checkbox', 0.74, 0.2),
    f('C1. Inspected?', 'checkbox', 0.74, 0.5),
  ]
  const qs = toQuestions(fs, () => page)

  it('apply to every question of their numbered question, and filter on them', () => {
    expect(qs.map((q) => q.tags)).toEqual([
      { Classification: 'Core', Risk: 'H', 'Assigned to': 'MASTER' },
      { Classification: 'Core', Risk: 'H', 'Assigned to': 'MASTER' },
      { Classification: 'Rotational 2', Risk: 'M', 'Assigned to': 'Chief Officer' },
    ])
    const risk = (v: string) => qs.filter((q) => matches(q, {}, { ...NO_FILTER, tags: { Risk: v } })).length
    expect([risk('H'), risk('M'), risk('L')]).toEqual([2, 1, 0])
  })
})

describe('a box in a table row with text right of it', () => {
  const t = (text: string, x: number, y: number, width: number): TextLine => ({
    text,
    x,
    y,
    width,
    height: 0.01,
    fontSize: 9,
  })
  // "Practical Guidelines": "Human ☐ (tick as appropriate)" │ the guideline the box is about, wrapped; the PDF
  // reads the left cell's second line and the guideline's second line as one line.
  const page = [
    t('Human', 0.13, 0.885, 0.062),
    t(
      'The Accompanying Officer must be familiar with the company procedures for indexing and filing',
      0.234,
      0.885,
      0.72,
    ),
    t('(tick as appropriate) certificates and documents.', 0.11, 0.898, 0.321),
    t('Process', 0.124, 0.915, 0.064),
    t('The Inspector will review the Class Survey Status Reports.', 0.234, 0.914, 0.5),
  ]
  const box = (label: string, x: number, y: number) => {
    const b = f(label, 'checkbox', x, y, 0.012)
    return { ...b, position: { ...b.position, width: 0.02 } }
  }
  const fs = [box('Human', 0.196, 0.885), box('Process', 0.192, 0.914)]

  it('is titled by that text, the box named by its label', () => {
    expect(toQuestions(fs, () => page).map((q) => [q.title, q.parts.map((p) => p.name)])).toEqual([
      [
        'The Accompanying Officer must be familiar with the company procedures for indexing and filing certificates and documents.',
        ['Human'],
      ],
      ['The Inspector will review the Class Survey Status Reports.', ['Process']],
    ])
  })
})

describe('a numbered question cut by a picture', () => {
  const t = (text: string, x: number, y: number, width: number, height = 0.014): TextLine => ({
    text,
    x,
    y,
    width,
    height,
    fontSize: 9,
  })
  const page = [
    t('11.1.10 Was photograph No.10, forward main deck, representative of the condition', 0.106, 0.601, 0.847),
    t('as seen onboard and, if so, was it free of', 0.106, 0.617, 0.848),
    t('Sampl', 0.126, 0.635, 0.083, 0.023), // the photo's watermark: another text size
    t('any areas for concern?', 0.106, 0.821, 0.19), // the question carries on under the photo
    t('Comments:', 0.106, 0.838, 0.096),
  ]
  // Auto-detect named the box by the line above it.
  const fs = [f('any areas for concern?', 'text', 0.098, 0.837)]

  it('the heading is the whole question; the card is named by its box', () => {
    const [q] = toQuestions(fs, () => page)
    expect(q.section).toBe(
      '11.1.10 Was photograph No.10, forward main deck, representative of the condition as seen onboard and, if so, was it free of any areas for concern?',
    )
    expect([q.title, q.parts.map((p) => p.name)]).toEqual(['Comments', ['']])
  })
})

describe('answer choices', () => {
  // A row "2.1.1 … – Y / N / NA" with Remarks, and a lone box ("☐ Human").
  const row = toQuestions(q1)[0]
  const lone = toQuestions([f('Human', 'checkbox', 0.2, 0.5)])[0]

  it('each choice on its own, and the ones ticked', () => {
    expect(choicesOf(row)).toEqual(['Y', 'N', 'N A'])
    expect(choicesOf(lone)).toEqual(['Human'])
    const answers = { [q1[1].key]: true }
    expect(pickedOf(row, answers)).toEqual(['N'])
    expect(matches(row, answers, { ...NO_FILTER, picked: 'N' })).toBe(true)
    expect(matches(row, answers, { ...NO_FILTER, picked: 'Y' })).toBe(false)
    expect(matches(row, {}, { ...NO_FILTER, choices: 'N A' })).toBe(true)
    expect(matches(lone, {}, { ...NO_FILTER, choices: 'N A' })).toBe(false)
  })
})

describe('rows on one scale', () => {
  const t = (text: string, x: number, y: number, width = 0.5): TextLine => ({
    text,
    x,
    y,
    width,
    height: 0.013,
    fontSize: 9,
  })
  const page = [
    t('Evaluation of the level of compliance with respect to each checklist chapter', 0.106, 0.342),
    t('1', 0.707, 0.349, 0.01),
    t('2', 0.75, 0.349, 0.01),
    t('Ν/S', 0.915, 0.349, 0.03), // typed with a Greek Ν
    t('(in accordance with scoring system provided below)', 0.106, 0.357),
    t('Chapter 02. Certification', 0.106, 0.376, 0.3),
    t('Chapter 03. Crew Management', 0.106, 0.393, 0.3),
    t(' 2 “fair” means that the standards are not satisfactory', 0.109, 0.6, 0.8), // a symbol-font bullet
    t(' 1 “unsatisfactory” means that the level is poor.', 0.109, 0.62, 0.8),
    t(' N/S “not seen” means that it was not possible to see it', 0.109, 0.64, 0.8),
  ]
  const row = (name: string, y: number) =>
    ['1', '2', 'Ν/S'].map((c, k) => f(`${name} – ${c}`, 'checkbox', 0.7 + 0.05 * k, y, 0.013))
  const qs = toQuestions(
    [...row('Chapter 02. Certification', 0.377), ...row('Chapter 03. Crew Management', 0.394)],
    () => page,
  )

  it('get the text over them, and each choice its meaning from the legend', () => {
    expect(qs.map((q) => q.intro)).toEqual(
      Array(2).fill(
        'Evaluation of the level of compliance with respect to each checklist chapter (in accordance with scoring system provided below)',
      ),
    )
    expect(qs[0].parts.map((p) => p.name)).toEqual(['1 – unsatisfactory', '2 – fair', 'Ν/S – not seen'])
  })
})
