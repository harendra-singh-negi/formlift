import { expect, test } from 'vitest'
import { BREAK_MARGIN, cleanAnswers, cleanCut, fileRows, perRowOf, lineGaps, onSheets, pageGrowth, pageSheets, type FieldDef } from './form-logic'

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
  const f = { id: 'p', key: 'p', type: 'file', label: 'Photos', source: 'manual', multiple: true, photosPerRow: 2, position: { page: 1, x: 0.1, y: 0.1, width: 0.5, height: 0.1 } } as FieldDef
  const v = JSON.stringify(['a', 'b', 'c', 'd', 'e'])
  // a 300 x 80 box, 2 photos a row: 4:3 cells 150 wide are 112.5 tall → 3 rows, 337.5
  const r = fileRows(f, { p: v }, 300, 80)
  expect(r.perRow).toBe(2)
  expect(r.lines.map((l) => JSON.parse(l))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  expect(r.extra).toBe(337.5 - 80)
  expect(fileRows({ ...f, photosPerRow: undefined }, { p: v }, 300, 80).heights).toEqual([14, 14, 14, 14, 14]) // names: a line each
  expect(fileRows(f, { p: v, p__per: '6' }, 300, 80).extra).toBe(0) // small photos: one row of 37.5
  const g = pageGrowth([f], { p: v }, 1, { width: 600, height: 800 }, () => 1)
  expect(g.boxes.get('p')?.extra).toBe(337.5 - 80)
  expect(g.cuts.length).toBe(1)
})

test('cleanCut: a page grows from a line with no text beside the growing box', () => {
  // the box runs 100..200; text lines at 150..170 and 185..205 beside it
  expect(cleanCut(200, 100, [])).toBe(200)
  const y = cleanCut(200, 100, [[150, 170], [185, 205]])
  expect(y).toBeLessThanOrEqual(185)
  expect(y).toBeGreaterThan(171.75)
  expect(cleanCut(200, 190, [[100, 210]])).toBe(200) // no clean line: at the box's bottom, as before
})

test('fileRows: photos first, then a line per other file; the person\'s size wins', () => {
  const f = { id: 'p', key: 'p', type: 'file', label: 'P', source: 'manual', multiple: true, photosPerRow: 3, position: { page: 1, x: 0, y: 0, width: 1, height: 0.1 } } as FieldDef
  const v = JSON.stringify(['a', 'doc1', 'b', 'doc2', 'c', 'd'])
  const photo = (id: string) => !id.startsWith('doc')
  const r = fileRows(f, { p: v }, 300, 80, photo)
  expect(r.lines.map((l) => JSON.parse(l))).toEqual([['a', 'b', 'c'], ['d'], ['doc1'], ['doc2']])
  expect(r.heights).toEqual([75, 75, 14, 14]) // photo rows 100 x 75; then a line per file, its full name
  const big = fileRows(f, { p: v, p__per: '1' }, 300, 80, photo)
  expect(big.lines).toHaveLength(6) // bigger photos: one a row …
  expect(big.heights[0]).toBe(225) // … each 300 x 225
  expect(perRowOf(f, { p__per: '9' })).toBe(6)
  expect(cleanAnswers([f], { p: v, p__per: '2', q__per: '2' })).toEqual({ p: v, p__per: '2' })
})

test('pageGrowth: with the page text known, a page break goes above a line, not through it', () => {
  const f = { id: 't', key: 't', type: 'textarea', label: 'T', source: 'manual', position: { page: 1, x: 0.5, y: 0.5, width: 0.4, height: 0.05 } } as FieldDef
  const long = Array.from({ length: 60 }, () => 'word').join('\n')
  const line = { y: 0.6, height: 0.02 } // a line of text under the box
  const g = pageGrowth([f], { t: long }, 1, { width: 600, height: 800 }, (t, n) => t.length * n * 0.5, () => true, [line])
  const at = (line.y * 800) // where the line starts on the original page, before the push
  const moved = at + g.cuts.reduce((s, [c, e]) => (c < at ? s + e : s), 0)
  for (const s of g.sheets.slice(0, -1)) expect(s.to <= moved - 0.5 || s.to >= moved + line.height * 800).toBe(true)
})
