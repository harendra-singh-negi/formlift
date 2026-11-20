import { expect, test } from 'vitest'
import { BREAK_MARGIN, fileRows, lineGaps, onSheets, pageGrowth, pageSheets, type FieldDef } from './form-logic'

test('pageSheets: a grown page breaks between lines, with a margin at the bottom and the next top', () => {
  const start = 600 // a box 600pt down an 800pt page, 40 lines of 10pt grown by 300pt
  const gaps = lineGaps(start, 10, 40, start + 500)
  const sheets = pageSheets(800, [[650, 300]], gaps)
  expect(pageSheets(800, [])).toEqual([{ from: 0, to: 800, at: 0 }]) // nothing grew: one page as it was
  expect(sheets).toHaveLength(2)
  const [a, b] = sheets
  expect(a.to).toBeLessThanOrEqual(800 - BREAK_MARGIN) // bottom margin kept
  expect(gaps).toContain(a.to) // in a line gap, not through a line
  expect(b).toMatchObject({ from: a.to, at: BREAK_MARGIN, to: 1100 }) // top margin, everything after it
  expect(onSheets(a.to, sheets, 800, 10)).toBe(810 + BREAK_MARGIN) // just past the break: next page under its margin
})

test('several files grow their box a row at a time, as many per row as fit', () => {
  const f = { id: 'p', key: 'p', type: 'file', label: 'Photos', source: 'manual', multiple: true, photoRatio: '4:3', position: { page: 1, x: 0.1, y: 0.1, width: 0.5, height: 0.1 } } as FieldDef
  const v = JSON.stringify(['a', 'b', 'c', 'd', 'e'])
  // a 300 x 80 box: 4:3 frames 80 tall are 106.7 wide, 2 per row → 3 rows
  const r = fileRows(f, v, 300, 80)
  expect(r.perRow).toBe(2)
  expect(r.lines.map((l) => JSON.parse(l))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  expect(r.extra).toBe(160)
  expect(fileRows({ ...f, photoRatio: undefined }, v, 300, 80).lines).toHaveLength(5) // names: one per row
  expect(fileRows(f, JSON.stringify(['a']), 300, 80).extra).toBe(0)
  const g = pageGrowth([f], { p: v }, 1, { width: 600, height: 800 }, () => 1)
  expect(g.boxes.get('p')?.extra).toBe(160)
  expect(g.cuts.length).toBe(1)
})
