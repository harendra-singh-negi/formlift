// @vitest-environment node
// The list view's flow, from a real PDF drawn with pdf-lib: a title, a shaded bar, a ruled two-column table whose
// text wraps and has bold, underlined, red and highlighted words, a picture, a field in a cell.
import path from 'node:path'
import { PDFDocument, StandardFonts, grayscale, rgb } from 'pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { extractShapes, type Ops } from './detect'
import { flowSegments, flowText, pageFlow, readPage, type FlowBlock, type FlowPart, type FlowRun, type PageRead } from './flow'
import type { FieldDef } from './form-logic'
import type { PdfTextItem } from './layout'
import type { Question } from './questions'

const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

async function form() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const write = (runs: [string, typeof font, ReturnType<typeof rgb>?][], x: number, y: number) => {
    for (const [text, f, color] of runs) {
      page.drawText(text, { x, y, size: 10, font: f, color })
      x += f.widthOfTextAtSize(text, 10)
    }
  }
  page.drawText('Daily Inspection', { x: 50, y: 790, size: 18, font: bold })
  page.drawRectangle({ x: 50, y: 750, width: 495, height: 22, color: grayscale(0.95) })
  page.drawText('Section A', { x: 56, y: 757, size: 11, font: bold })
  for (const [x, width] of [
    [50, 120],
    [170, 375],
  ])
    page.drawRectangle({ x, y: 600, width, height: 120, borderColor: rgb(0, 0, 0), borderWidth: 0.75 })
  page.drawText('Objective', { x: 60, y: 700, size: 10, font: bold })
  const lead = font.widthOfTextAtSize('Check that the team ', 10)
  page.drawRectangle({ x: 180 + lead, y: 698.5, width: bold.widthOfTextAtSize('knows', 10), height: 0.6 }) // underline
  write([['Check that the team ', font], ['knows', bold], [' the drill and the alarm ', font], ['urgent', font, rgb(1, 0, 0)]], 180, 700)
  const before = font.widthOfTextAtSize('signals ', 10)
  page.drawRectangle({ x: 180 + before - 1, y: 683, width: font.widthOfTextAtSize('before', 10) + 2, height: 12, color: rgb(1, 1, 0) })
  write([['signals before the shift.', font]], 180, 686)
  page.drawImage(await doc.embedPng(PNG), { x: 50, y: 500, width: 40, height: 40 })
  page.drawText('End of form', { x: 50, y: 470, size: 10, font })
  return doc.save()
}

const field: FieldDef = {
  id: 'f1',
  key: 'notes',
  type: 'text',
  label: 'Notes',
  source: 'manual',
  position: { page: 1, x: 180 / 595, y: 202 / 842, width: 300 / 595, height: 18 / 842 },
}

async function flowOf() {
  const standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts/')
  const pdf = await getDocument({ data: await form(), standardFontDataUrl, fontExtraProperties: true }).promise
  const page = await pdf.getPage(1)
  const ops = await page.getOperatorList({ intent: 'print' })
  const items = (await page.getTextContent()).items as PdfTextItem[]
  const fontOf = (id: string) => (page.commonObjs.has(id) ? (page.commonObjs.get(id) as { name?: string }).name : undefined)
  const read = readPage(items, extractShapes(ops.fnArray, ops.argsArray as unknown[][], OPS as unknown as Ops, page.view), page.view, fontOf)
  return { items, blocks: pageFlow(read, { page: 1, source: 1, width: 595, height: 842 }, [field]) }
}

const runs = (b: FlowBlock) => (b.cells?.flatMap((c) => c.paras) ?? b.paras ?? []).flatMap((p) => p.parts)
const run = (parts: FlowPart[], text: string) => parts.find((p): p is FlowRun => 'text' in p && p.text.trim() === text)

describe('pageFlow', () => {
  it('reads a page as it is: order, tables, bars, looks, colours, highlights, pictures and fields', async () => {
    const { items, blocks } = await flowOf()
    // Every word of the page is in the flow.
    const all = flowText(blocks).replace(/\s/g, '')
    expect(all).toBe(items.map((i) => i.str).join('').replace(/\s/g, ''))

    const [title, bar, row, picture, end] = blocks
    expect(blocks).toHaveLength(5)
    expect(title.paras![0]).toMatchObject({ parts: [{ text: 'Daily Inspection', bold: true }], size: 1.8 })
    expect(bar.cells).toMatchObject([{ fill: '#f2f2f2', paras: [{ parts: [{ text: 'Section A', bold: true }] }] }])
    // The table row: its two cells as wide as on the page, the label first, the wrapped text one paragraph.
    expect(row.cells!.map((c) => Math.round(c.width))).toEqual([24, 76])
    expect(flowText([{ ...row, cells: [row.cells![0]] }])).toBe('Objective')
    const text = row.cells![1].paras[0]
    expect(flowText([{ ...row, cells: [{ ...row.cells![1], paras: [text] }] }])).toBe(
      'Check that the team knows the drill and the alarm urgent signals before the shift.',
    )
    expect(run(text.parts, 'knows')).toMatchObject({ bold: true, underline: true })
    expect(run(text.parts, 'urgent')).toMatchObject({ color: '#ff0000' })
    expect(run(text.parts, 'before')).toMatchObject({ bg: '#ffff00' })
    expect(run(text.parts, 'the drill and the alarm')).toEqual({ text: ' the drill and the alarm ' })
    // The field in its cell, under the text; nothing names it there but the text above it.
    expect(runs(row).find((p) => 'field' in p)).toMatchObject({ field: { id: 'f1' }, w: 30 })
    expect(runs(picture)).toMatchObject([{ image: { source: 1 }, w: 4, h: 4 }])
    expect(flowText([end])).toBe('End of form')
    expect(picture.gap && end.gap).toBe(true)
  })
})

describe('lines laid out as on the page', () => {
  const sheet = { page: 1, source: 1, width: 595, height: 842 }
  const word = (text: string, x: number, base: number, w = text.length * 6) => ({ run: { text }, x, w, base, pt: 10 })
  const read = (items: PageRead['items']): PageRead => ({ width: 595, height: 842, items, boxes: [], images: [] })
  const at = (id: string, x: number, w: number, y: number): FieldDef => ({
    ...field,
    id,
    label: id,
    position: { page: 1, x: x / 595, y: y / 842, width: w / 595, height: 14 / 842 },
  })
  // Where each cell of a line starts, in % of the page's content.
  const starts = (b: FlowBlock) => {
    let end = 0
    return b.cells!.map((c) => Math.round((end += c.offset + c.width) - c.width))
  }
  const what = (b: FlowBlock) =>
    b.cells!.map((c) => c.paras[0].parts.map((p) => ('text' in p ? p.text : 'field' in p ? `[${p.field.id}${p.caption ? '*' : ''}]` : '')).join(''))

  it('answer lines under column names: each field at its place, lined up with its column', () => {
    const blocks = pageFlow(
      read([
        word('Some text at the left margin', 50, 100, 500),
        word('ROLE', 160, 150),
        word('NAME', 300, 150),
        word('DATE', 480, 150),
        word('MANAGER', 50, 180),
      ]),
      sheet,
      [at('r1', 140, 120, 168), at('n1', 280, 120, 168), at('d1', 460, 90, 168), at('r2', 140, 120, 200), at('n2', 280, 120, 200), at('d2', 460, 90, 200)],
    )
    const [text, head, one, two] = blocks
    expect(text.paras).toBeDefined()
    expect([head.line, one.line, two.line]).toEqual([true, true, true])
    expect(what(head)).toEqual(['ROLE', 'NAME', 'DATE'])
    // Captioned where nothing on the line names them (shown when the line wraps on a narrow screen).
    expect(what(one)).toEqual(['MANAGER', '[r1]', '[n1*]', '[d1*]'])
    expect(what(two)).toEqual(['[r2*]', '[n2*]', '[d2*]'])
    expect(starts(one).slice(1)).toEqual(starts(two))
    expect(starts(two)).toEqual([18, 46, 82])
    // Each column name sits over its column.
    expect(starts(head)).toEqual([22, 50, 86])
  })

  it('a field drawn around the text on its line comes after it', () => {
    const [b] = pageFlow(read([word('Body text', 50, 60, 500), word('Comments:', 55, 110)]), sheet, [at('c', 50, 500, 100)]).slice(1)
    expect(what(b)).toEqual(['Comments:', '[c]'])
  })

  it('a list number centred on its item’s lines starts the item', () => {
    const blocks = pageFlow(
      read([
        word('A safety meeting must always be held on board,', 90, 100, 455),
        word('16.', 55, 112, 12),
        word('chaired by the superintendent, where it is strongly', 90, 112, 455),
        word('encouraged to share ideas.', 90, 124, 200),
      ]),
      sheet,
      [],
    )
    expect(flowText(blocks)).toBe(
      '16. A safety meeting must always be held on board, chaired by the superintendent, where it is strongly encouraged to share ideas.',
    )
  })
})

describe('flowSegments', () => {
  const block = (parts: FlowPart[]): FlowBlock => ({ page: 1, y: 0, bottom: 0, paras: [{ parts, size: 1 }] })
  const f = (id: string) => ({ field: { ...field, id }, w: 10, h: 2 })
  const q = (id: string, section?: string): Question => ({
    id,
    title: id,
    page: 1,
    parts: [{ field: { ...field, id }, name: '' }],
    section,
  })
  const blocks = [
    block([{ text: '1.1 First' }]),
    block([f('a')]),
    block([{ text: 'Guidance' }]),
    block([f('b')]),
    block([{ text: '1.2 Second' }]),
    block([f('c')]),
    block([{ text: 'The end' }]),
  ]

  it('cuts where a numbered question ends, with all of its text', () => {
    const segs = flowSegments(blocks, [q('a', '1.1'), q('b', '1.1'), q('c', '1.2')])
    expect(segs.map((s) => [flowText(s.blocks), s.questions])).toEqual([
      ['1.1 First\n\nGuidance\n', ['a', 'b']],
      ['1.2 Second\n', ['c']],
      ['The end', []],
    ])
  })

  it('without numbered questions, each question takes the text before it', () => {
    const segs = flowSegments(blocks, [q('a'), q('b'), q('c')])
    expect(segs.map((s) => s.questions)).toEqual([['a'], ['b'], ['c'], []])
    expect(flowText(segs[1].blocks)).toBe('Guidance\n')
  })
})
