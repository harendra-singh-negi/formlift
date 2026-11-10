import { describe, expect, it } from 'vitest'
import { validateFields } from './form-logic'
import {
  detectFields,
  extractShapes,
  keyFor,
  splitBoxChars,
  splitUnderscores,
  type Ops,
  type Seg,
  type Shapes,
} from './detect'
import type { TextLine } from './layout'

const W = 595
const H = 842
const size = { width: W, height: H }
// Text line from points (top-left origin) to the page-fraction TextLine detection reads.
const text = (t: string, x0: number, y0: number, x1: number, y1 = y0 + 10): TextLine => ({
  text: t,
  x: x0 / W,
  y: y0 / H,
  width: (x1 - x0) / W,
  height: (y1 - y0) / H,
  fontSize: 9,
})
const h = (x0: number, x1: number, y: number, dashed = false): Seg => ({ x0, x1, y0: y, y1: y, dashed })
const v = (x: number, y0: number, y1: number): Seg => ({ x0: x, x1: x, y0, y1, dashed: false })
const none: Shapes = { hlines: [], vlines: [], rects: [] }
const pt = (f: { position: { x: number; y: number; width: number; height: number } }) => ({
  x: Math.round(f.position.x * W),
  y: Math.round(f.position.y * H),
  w: Math.round(f.position.width * W),
  h: Math.round(f.position.height * H),
})

describe('detectFields', () => {
  it('a square next to a word becomes a labelled checkbox', () => {
    const shapes = { ...none, rects: [{ x: 100, y: 200, w: 9, h: 9, stroked: true, filled: false }] }
    const [f] = detectFields(shapes, [text('Loading', 112, 199, 150)], size, 1)
    expect(f).toMatchObject({ type: 'checkbox', label: 'Loading', source: 'ai' })
    expect(pt(f)).toEqual({ x: 99, y: 199, w: 11, h: 11 })
  })

  it('a dotted line after "SHIP:" becomes a text input above the line; "Date:" a date', () => {
    const shapes = { ...none, hlines: [h(100, 300, 180, true), h(380, 500, 180, true)] }
    const found = detectFields(shapes, [text('SHIP:', 57, 170, 80), text('Date:', 340, 170, 370)], size, 1)
    expect(found.map((f) => [f.type, f.label])).toEqual([
      ['text', 'SHIP'],
      ['date', 'Date'],
    ])
    // One text line high: the page's text is 10 pt tall here, so 11 pt.
    expect(pt(found[0])).toMatchObject({ x: 100, w: 200, h: 11 })
  })

  it('underlined words and full-width separators are not answer lines', () => {
    const shapes = { ...none, hlines: [h(60, 120, 112), h(40, 560, 400)] }
    expect(detectFields(shapes, [text('least once', 60, 100, 120, 110)], size, 1)).toEqual([])
  })

  it('stacked dotted lines join into one text area', () => {
    const shapes = { ...none, hlines: [h(100, 400, 300, true), h(100, 400, 318, true), h(100, 400, 336, true)] }
    const [f, ...rest] = detectFields(shapes, [text('Remarks:', 50, 290, 95)], size, 1)
    expect(rest).toEqual([])
    expect(f).toMatchObject({ type: 'textarea', label: 'Remarks' })
    expect(pt(f)).toMatchObject({ y: 289, h: 47 })
  })

  it('empty table cells become text areas named by row and column header', () => {
    // 3 columns × 2 rows: header row, then "Technical" with two empty cells.
    const xs = [50, 130, 260, 460]
    const ys = [100, 120, 200]
    const shapes = {
      ...none,
      hlines: ys.map((y) => h(50, 460, y)),
      vlines: xs.map((x) => v(x, 100, 200)),
    }
    const lines = [
      text('Department', 55, 105, 120),
      text('Key Focus Area(s)', 135, 105, 220),
      text('Specific Task(s)', 265, 105, 340),
      text('Technical', 55, 150, 100),
    ]
    const found = detectFields(shapes, lines, size, 1)
    expect(found.map((f) => [f.type, f.label])).toEqual([
      ['textarea', 'Technical – Key Focus Area(s)'],
      ['textarea', 'Technical – Specific Task(s)'],
    ])
    expect(pt(found[0])).toEqual({ x: 132, y: 122, w: 127, h: 77 })
  })

  it('Word borders drawn cell by cell with gaps where rows meet still close the cells', () => {
    // As Word draws them (page 1 of AUD 06): each row line is doubled 1.1 pt apart, and each column wall is one
    // piece per row that starts 1.8 pt below the lower line, so no single piece covers a whole row.
    // (The first piece starts at the table top.)
    const ys = [100, 120, 140, 160]
    const walls = [50, 150, 300].flatMap((x) => [v(x, 100, 120.8), v(x, 122.9, 140.8), v(x, 142.9, 160.8)])
    const shapes = { ...none, hlines: ys.flatMap((y) => [h(50, 300, y), h(50, 300, y + 1.1)]), vlines: walls }
    const lines = [text('Rank', 55, 105, 80), text('Name', 155, 105, 185), text('Master', 55, 125, 90)]
    expect(detectFields(shapes, lines, size, 1).map((f) => f.label)).toContain('Master – Name')
  })

  it('a table drawn with shading only: label cells name the empty space beside them, split by column headers', () => {
    const fill = (x: number, y: number, w: number, hh = 18) => ({ x, y, w, h: hh, stroked: false, filled: true })
    const shapes = {
      ...none,
      // Header row (blank corner, "Signature:", "Date:"), then shaded label cells only.
      rects: [fill(30, 100, 120), fill(150, 100, 170), fill(320, 100, 250), fill(30, 118, 120), fill(30, 136, 120)],
    }
    const lines = [
      text('Signature:', 155, 104, 200),
      text('Date:', 325, 104, 350),
      text('Master', 35, 122, 70),
      text('Chief Engineer', 35, 140, 95),
    ]
    expect(detectFields(shapes, lines, size, 1).map((f) => [f.type, f.label])).toEqual([
      ['signature', 'Master – Signature'],
      ['date', 'Master – Date'],
      ['signature', 'Chief Engineer – Signature'],
      ['date', 'Chief Engineer – Date'],
    ])
    // A lone shaded title is not a label cell.
    expect(
      detectFields({ ...none, rects: [fill(200, 40, 160)] }, [text('INSPECTION REPORT', 205, 44, 330)], size, 1),
    ).toEqual([])
  })

  it('a table that goes on to the next page: dotted open bottom edge, row named by a long header cut short', () => {
    // Header row (long note | DUE DATES), then one row whose bottom edge is dotted at the foot of the page.
    const shapes = {
      ...none,
      hlines: [h(50, 500, 700), h(50, 500, 760), h(50, 500, 790, true)],
      vlines: [v(50, 700, 790), v(400, 700, 790), v(500, 700, 790)],
    }
    const lines = [
      text('OPEN ITEMS, MEMORANDA, CONDITIONS OF CLASS, RECOMMENDATIONS,', 55, 705, 390),
      text('NOTATIONS, ETC. (Where Class records address structural issues)', 55, 717, 390),
      text('DUE DATES', 410, 720, 480),
    ]
    expect(detectFields(shapes, lines, size, 1).map((f) => f.label)).toEqual([
      'OPEN ITEMS, MEMORANDA, CONDITIONS OF CLASS…',
      'DUE DATES',
    ])
  })

  it('a table with a hairline row (under 2.5 pt) finishes instead of looping forever', () => {
    const ys = [100, 102.2, 140, 160, 180, 200]
    const shapes = { ...none, hlines: ys.map((y) => h(50, 300, y)), vlines: [v(50, 100, 200), v(300, 100, 200)] }
    expect(Array.isArray(detectFields(shapes, [text('Remarks', 55, 105, 120)], size, 1))).toBe(true)
  }, 2000)

  it('a lone empty box is a text area named by the heading above it, or the previous page at the page top', () => {
    const box = { ...none, hlines: [h(57, 540, 100), h(57, 540, 230)], vlines: [v(57, 100, 230), v(540, 100, 230)] }
    const above = detectFields(box, [text('PART 1 – EXECUTIVE SUMMARY', 57, 80, 300)], size, 1)
    expect(above.map((f) => [f.type, f.label])).toEqual([['textarea', 'PART 1 – EXECUTIVE SUMMARY']])
    const top = detectFields(box, [], size, 2, [], [], 'PART 1 – EXECUTIVE SUMMARY')
    expect(top.map((f) => [f.type, f.label])).toEqual([['textarea', 'PART 1 – EXECUTIVE SUMMARY']])
  })

  it('a tall box with only "Finding" in it is an answer box, named by the item and its block ("HW")', () => {
    // 2.1.1 … / [ HW + questions ] / [ Finding ______ ]; and a "Remarks" column header over blank cells stays a header.
    const shapes = {
      ...none,
      hlines: [h(30, 565, 100), h(30, 565, 180), h(30, 565, 220)],
      vlines: [v(30, 100, 220), v(565, 100, 220)],
    }
    const lines = [
      text('2.1.1 Maintenance of statutory Certificates', 35, 80, 300),
      text('HW', 230, 104, 245),
      text('A1. Any visual defect related to structure?', 35, 130, 400),
      text('Finding', 40, 184, 70),
    ]
    const found = detectFields(shapes, lines, size, 1)
    expect(found.map((f) => [f.type, f.label])).toEqual([
      ['textarea', '2.1.1 Maintenance of statutory Certificates – HW – Finding'],
    ])
    const table = {
      ...none,
      hlines: [100, 140, 160, 180].map((y) => h(50, 300, y)),
      vlines: [v(50, 100, 180), v(300, 100, 180)],
    }
    const header = detectFields(table, [text('Remarks', 55, 105, 100)], size, 1)
    expect(header.every((f) => f.position.y * H >= 139)).toBe(true) // nothing in the header cell itself
  })

  it('a list under a form header block: columns named by their own header, not the wider rows above', () => {
    // Title row, "Number of Observations" row (wider than the columns), header row, then 3 empty rows.
    const xs = [50, 100, 300, 460]
    const ys = [100, 120, 140, 170, 190, 210, 230]
    const shapes = {
      ...none,
      hlines: ys.map((y) => h(50, 460, y)),
      vlines: [v(50, 100, 230), v(460, 100, 230), v(200, 120, 140), ...xs.slice(1, 3).map((x) => v(x, 140, 230))],
    }
    const lines = [
      text('List of Observations from previous Inspector’s Inspection requiring revalidation', 55, 105, 455),
      text('Number of Observations', 55, 125, 150),
      text('No.', 55, 150, 80),
      text('Description', 150, 150, 220),
      text('Remarks', 320, 150, 380),
    ]
    const labels = detectFields(shapes, lines, size, 1).map((f) => f.label)
    expect(labels.filter((l) => l === 'No')).toHaveLength(3)
    expect(labels.filter((l) => l === 'Description')).toHaveLength(3)
    expect(labels.filter((l) => l === 'Remarks')).toHaveLength(3)
  })

  it('"Comments:" in a ruled row: field to the right, named after the numbered item above', () => {
    const shapes = { ...none, hlines: [h(50, 550, 300), h(50, 550, 320)], vlines: [v(50, 300, 320), v(550, 300, 320)] }
    const lines = [text('2.1.1a Certificate of Registry', 52, 285, 200), text('Comments:', 55, 305, 105)]
    const [f] = detectFields(shapes, lines, size, 1)
    expect(f).toMatchObject({ type: 'text', label: '2.1.1a Certificate of Registry – Comments' })
    expect(pt(f).x).toBe(109)
    expect(pt(f).x + pt(f).w).toBe(548)
  })

  it('skips places already covered by a field', () => {
    const shapes = { ...none, rects: [{ x: 100, y: 200, w: 9, h: 9, stroked: true, filled: false }] }
    const existing = [
      {
        id: 'a',
        key: 'a',
        type: 'checkbox' as const,
        label: 'a',
        source: 'manual' as const,
        position: { page: 1, x: 99 / W, y: 199 / H, width: 11 / W, height: 11 / H },
      },
    ]
    expect(detectFields(shapes, [], size, 1, existing)).toEqual([])
    expect(detectFields(shapes, [], size, 2, existing)).toHaveLength(1)
  })

  it('sizes follow the page text: 20 pt text gives a taller field, bigger squares still count as checkboxes', () => {
    const big = (t: string, x0: number, y0: number, x1: number) => text(t, x0, y0, x1, y0 + 24)
    const shapes = {
      ...none,
      hlines: [h(150, 400, 200, true)],
      rects: [{ x: 100, y: 300, w: 24, h: 24, stroked: true, filled: false }],
    }
    const found = detectFields(shapes, [big('Name:', 50, 176, 140), big('Yes', 130, 300, 170)], size, 1)
    expect(found.map((f) => [f.type, f.label])).toEqual([
      ['checkbox', 'Yes'],
      ['text', 'Name'],
    ])
    expect(pt(found[1]).h).toBeGreaterThan(20)
  })

  it('"Label:" with blank space outside any ruled box is a heading, not a field', () => {
    expect(detectFields(none, [text('Steps:', 50, 100, 90)], size, 1)).toEqual([])
  })

  it('"Signature: ______" typed as text: the line, and the label without the underscores', () => {
    const { items, rules } = splitUnderscores(
      [{ str: 'Signature: ________', transform: [10, 0, 0, 10, 50, 742], width: 190 }],
      [0, 0, W, H],
    )
    expect(items.map((i) => [i.str, i.width])).toEqual([['Signature: ', 110]])
    expect(rules).toEqual([{ x0: 160, x1: 240, y0: 101, y1: 101, dashed: true }])
    const [f] = detectFields(none, [text('Signature:', 50, 92, 150)], size, 1, [], rules)
    expect(f).toMatchObject({ type: 'signature', label: 'Signature' })
  })
})

describe('box characters and dots', () => {
  it('"☐ Loading" gives a checkbox and the label Loading', () => {
    const { items, boxes } = splitBoxChars(
      [{ str: '☐ Loading', transform: [10, 0, 0, 10, 50, 742], width: 90 }],
      [0, 0, W, H],
    )
    expect(boxes).toHaveLength(1)
    expect(items.map((i) => i.str)).toEqual([' Loading'])
    expect(items[0].transform[4]).toBe(60)
    const lines = [text('Loading', 62, 92, 140)]
    const [f] = detectFields({ ...none, rects: boxes }, lines, size, 1)
    expect(f).toMatchObject({ type: 'checkbox', label: 'Loading' })
  })
})

describe('extractShapes', () => {
  const OPS = {
    save: 10,
    restore: 11,
    transform: 12,
    setDash: 6,
    constructPath: 91,
    paintFormXObjectBegin: 74,
    paintFormXObjectEnd: 75,
    stroke: 20,
    closeStroke: 21,
    fill: 22,
    eoFill: 23,
    fillStroke: 24,
    eoFillStroke: 25,
    closeFillStroke: 26,
    closeEOFillStroke: 27,
  } satisfies Ops
  it('follows transforms and dash state; squares become rects, lines lines (top-left origin)', () => {
    const square = Float32Array.from([0, 0, 0, 1, 9, 0, 1, 9, 9, 1, 0, 9, 3])
    const line = Float32Array.from([0, 0, -1.7, 1, 80, -1.7])
    const shapes = extractShapes(
      [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.setDash, OPS.transform, OPS.constructPath],
      [
        [],
        [1, 0, 0, 1, 100, 700],
        [OPS.stroke, [square], null],
        [],
        [[1, 2], 0],
        [1, 0, 0, 1, 356, 751],
        [OPS.stroke, [line], null],
      ],
      OPS,
      [0, 0, 595, 842],
    )
    expect(shapes.rects).toEqual([{ x: 100, y: 133, w: 9, h: 9, stroked: true, filled: false }])
    expect(shapes.hlines).toHaveLength(1)
    expect(shapes.hlines[0]).toMatchObject({ x0: 356, x1: 436, dashed: true })
    expect(shapes.hlines[0].y0).toBeCloseTo(842 - 749.3)
  })

  it('a row of tiny dots is a dotted line; a small circle is a round box', () => {
    const dot = (x: number) => Float32Array.from([0, x, 100, 1, x + 1, 100, 1, x + 1, 101, 1, x, 101, 3])
    const circle = Float32Array.from([0, 200, 300, 2, 200, 305, 205, 310, 210, 310, 2, 215, 310, 220, 305, 220, 300, 3])
    const fn = [...Array(8).fill(OPS.constructPath), OPS.constructPath]
    const args = [
      ...[0, 4, 8, 12, 16, 20, 24, 28].map((x) => [OPS.fill, [dot(100 + x)], null]),
      [OPS.stroke, [circle], null],
    ]
    const shapes = extractShapes(fn, args, OPS, [0, 0, 595, 842])
    expect(shapes.hlines).toEqual([
      { x0: 100, x1: 129, y0: expect.closeTo(741.5), y1: expect.closeTo(741.5), dashed: true },
    ])
    expect(shapes.rects).toEqual([{ x: 200, y: 532, w: 20, h: 10, stroked: true, filled: false, round: true }])
  })
})

it('keys come from labels and stay unique; detected fields are a valid mapping', () => {
  expect(keyFor('IMO NUMBER', 'text', [])).toBe('imo_number_1')
  expect(keyFor('IMO NUMBER', 'text', [{ key: 'imo_number_1' }])).toBe('imo_number_2')
  expect(keyFor('2.1.1a Certificate – Comments', 'text', [])).toBe('text_2_1_1a_certificate_comments_1')
  expect(keyFor('', 'checkbox', [])).toBe('checkbox_1')
  const shapes = { ...none, rects: [{ x: 100, y: 200, w: 9, h: 9, stroked: true, filled: false }] }
  const fields = detectFields(shapes, [text('Loading', 112, 199, 150)], size, 1).map((f, i) => ({
    ...f,
    id: String(i),
    key: keyFor(f.label, f.type, []),
  }))
  expect(validateFields(fields, 1)).toEqual([])
})
