import { describe, expect, it } from 'vitest'
import { defaultLayout, validateLayout } from './form-logic'
import { newField } from './fields'
import {
  deletePage,
  fitTextWidth,
  insertBlankPage,
  movePage,
  newElement,
  replaceLine,
  toLines,
  type Doc,
} from './layout'

const A4 = { width: 595, height: 842 }
function doc(): Doc {
  const f1 = newField('text', 1, 0.5, 0.5, [])
  const f3 = newField('text', 3, 0.5, 0.5, [f1])
  return {
    fields: [f1, f3],
    layout: { ...defaultLayout([A4, A4, A4]), elements: [newElement('text', 2, 0.5, 0.5)] },
  }
}
const pagesOf = (d: Doc) => ({
  sources: d.layout.pages.map((p) => p.source),
  fields: d.fields.map((f) => f.position.page),
  elements: d.layout.elements.map((e) => e.page),
})

describe('page operations keep fields and items on their page', () => {
  it('movePage swaps pages and renumbers', () => {
    expect(pagesOf(movePage(doc(), 3, -1))).toEqual({ sources: [1, 3, 2], fields: [1, 2], elements: [3] })
    const d = doc()
    expect(movePage(d, 1, -1)).toBe(d) // first page cannot move up
  })

  it('deletePage drops what was on it', () => {
    expect(pagesOf(deletePage(doc(), 2))).toEqual({ sources: [1, 3], fields: [1, 2], elements: [] })
    expect(pagesOf(deletePage(doc(), 1))).toEqual({ sources: [2, 3], fields: [2], elements: [1] })
  })

  it('insertBlankPage shifts the pages after it', () => {
    const d = insertBlankPage(doc(), 1)
    expect(pagesOf(d)).toEqual({ sources: [1, null, 2, 3], fields: [1, 4], elements: [3] })
    expect(d.layout.pages[1]).toMatchObject(A4)
    expect(validateLayout(d.layout, 3)).toEqual([])
  })
})

describe('toLines', () => {
  // A4 page; text 12pt at baseline y=800 (PDF space, bottom-up) = 42pt from the top.
  const item = (str: string, x: number, w: number, y = 800, size = 12) => ({
    str,
    transform: [size, 0, 0, size, x, y],
    width: w,
  })
  const box = [0, 0, 595, 842]

  it('joins words of a line, splits columns and lines', () => {
    const lines = toLines(
      [item('SHIP:', 50, 30), item('Name', 82, 30), item('GT:', 350, 20), item('Second line', 50, 60, 780)],
      box,
    )
    expect(lines.map((l) => l.text)).toEqual(['SHIP: Name', 'GT:', 'Second line'])
    expect(lines[0].x).toBeCloseTo(50 / 595)
    expect(lines[0].width).toBeCloseTo(62 / 595)
    expect(lines[0].y).toBeCloseTo((42 - 12 * 0.92) / 842)
    expect(lines[0].fontSize).toBe(12)
  })

  it('a wide whitespace item between columns does not join them', () => {
    const lines = toLines([item('SHIP:', 50, 30), item(' ', 80, 270), item('GT:', 350, 20)], box)
    expect(lines.map((l) => l.text)).toEqual(['SHIP:', 'GT:'])
  })

  it('a line replaced in the editor becomes a valid white text item', () => {
    const [line] = toLines([item('Comments:', 50, 60)], box)
    const e = replaceLine(line, 4)
    expect(e).toMatchObject({
      type: 'text',
      page: 4,
      text: 'Comments:',
      replaces: 'Comments:',
      fill: '#ffffff',
      fontSize: 12,
    })
    expect(validateLayout({ pages: [A4, A4, A4, A4].map((s) => ({ ...s, source: 1 })), elements: [e] }, 1)).toEqual([])
  })
})

describe('text items', () => {
  const box = [0, 0, 595, 842]
  it('bold / italic come from the font name', () => {
    const items = [
      { str: 'SHIP:', transform: [9, 0, 0, 9, 50, 700], width: 25, fontName: 'f1' },
      { str: 'note', transform: [9, 0, 0, 9, 50, 680], width: 20, fontName: 'f2' },
    ]
    const names: Record<string, string> = { f1: 'ABCDEF+Arial-BoldMT', f2: 'XYZ+Calibri-Italic' }
    const [a, b] = toLines(items, box, (id) => names[id])
    expect(a).toMatchObject({ text: 'SHIP:', bold: true })
    expect(a.italic).toBeUndefined()
    expect(b).toMatchObject({ italic: true })
    expect(replaceLine(a, 1)).toMatchObject({ bold: true })
  })

  it('fitTextWidth grows to the longest line, never shrinks, stops at the page edge', () => {
    const e = {
      ...newElement('text', 1, 0.5, 0.5),
      text: 'a\nlonger line',
      position: { x: 0.1, y: 0.1, width: 0.05, height: 0.03 },
    }
    const measure = (t: string) => t.length * 10 // 10 pt per character
    expect(fitTextWidth(e, 595, measure).position.width).toBeCloseTo((110 + 4) / 595)
    const wide = { ...e, position: { ...e.position, width: 0.5 } }
    expect(fitTextWidth(wide, 595, measure)).toBe(wide)
    const edge = { ...e, position: { ...e.position, x: 0.95 } }
    expect(fitTextWidth(edge, 595, measure).position.width).toBeCloseTo(0.05)
  })
})
