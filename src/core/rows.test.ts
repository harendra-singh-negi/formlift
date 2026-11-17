import { expect, test } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { cleanAnswers, expandRows, pageGrowth, removeRow, validateAnswers, type FieldDef } from './form-logic'
import { completedPdf } from '../server'

const cell = (key: string, x: number, extra: Partial<FieldDef> = {}): FieldDef => ({
  id: key,
  key,
  type: 'text',
  label: key,
  source: 'manual',
  position: { page: 1, x, y: 0.3, width: 0.2, height: 0.05 },
  repeat: { id: 'tasks', max: 3 },
  ...extra,
})
const form = [cell('task', 0.1, { required: true }), cell('due', 0.4), { ...cell('after', 0.1), repeat: undefined, position: { page: 1, x: 0.1, y: 0.6, width: 0.2, height: 0.05 } }]

test('expandRows: copies of the row after its last field, keyed <key>__<k>, within max', () => {
  expect(expandRows(form, {}).map((f) => f.key)).toEqual(['task', 'due', 'after'])
  const three = expandRows(form, { tasks__rows: '9' }) // max 3
  expect(three.map((f) => f.key)).toEqual(['task', 'due', 'task__2', 'due__2', 'task__3', 'due__3', 'after'])
  expect(expandRows(three, { tasks__rows: '2' }).length).toBe(5) // already expanded: from the originals again
})

test('answers of added rows are checked and kept; removing a row moves the later ones up', () => {
  const answers = { tasks__rows: '3', task: 'a', task__2: '', task__3: 'c', due__3: 'x', junk: 'no' }
  expect(Object.keys(validateAnswers(form, answers))).toEqual(['task__2']) // required in every row
  expect(cleanAnswers(form, answers)).toEqual({ tasks__rows: '3', task: 'a', task__2: '', task__3: 'c', due__3: 'x' })
  expect(removeRow(form, answers, 'tasks', 2)).toEqual({ tasks__rows: '2', task: 'a', task__2: 'c', due__2: 'x', junk: 'no' })
})

test('pageGrowth: an added row sits one band under the first, what is below moves down by it', () => {
  const answers = { tasks__rows: '2' }
  const g = pageGrowth(expandRows(form, answers), answers, 1, { width: 600, height: 800 }, (t, n) => t.length * n * 0.5)
  const band = 0.05 * 800 + 2 // the fields plus ROW_PAD below
  expect(g.rows).toEqual([{ id: 'tasks', at: 0.35 * 800 + 2, tile: band, copies: 1 }])
  expect(g.top({ ...form[0], repeat: { id: 'tasks', row: 2 } })).toBeCloseTo(0.3 * 800 + band)
  expect(g.top(form[2])).toBeCloseTo(0.6 * 800 + band)
})

test('completedPdf: added rows print, the page runs on', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([600, 800])
  const pdf = await completedPdf(await doc.save(), form, { tasks__rows: '3', task: 'a', task__3: 'c' })
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2)
})
