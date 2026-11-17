import { expect, test } from 'vitest'
import { BREAK_MARGIN, lineGaps, onSheets, pageSheets } from './form-logic'

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
