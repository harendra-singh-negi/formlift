import { expect, test } from 'vitest'
import { findSerial, parseSerial, serialText } from './form-logic'

const next = (t: string, prev?: string, k = 2) => {
  const s = parseSerial(t, prev)
  return s && serialText({ ...s, x: 0, y: 0, width: 0, height: 0, size: 9 }, k)
}

test('serials count on in their own style', () => {
  expect(next('10.')).toBe('11.')
  expect(next('9)')).toBe('10)')
  expect(next('(c)')).toBe('(d)')
  expect(next('z.')).toBe('aa.')
  expect(next('B:')).toBe('C:')
  expect(next('iv.')).toBe('v.')
  expect(next('VIII')).toBe('IX')
  expect(next('ix)', undefined, 3)).toBe('xi)')
})

test('a lone i / v / x is roman or a letter by the serial above it', () => {
  expect(next('i.')).toBe('ii.')
  expect(next('i.', 'h.')).toBe('j.')
  expect(next('v.')).toBe('w.')
  expect(next('v.', 'iv.')).toBe('vi.')
  expect(next('x)', 'ix)')).toBe('xi)')
  expect(next('c.', 'b.')).toBe('d.')
})

test('words and amounts are not serials', () => {
  for (const t of ['No.', 'Rs.', 'MI', 'Name', '10.5', '']) expect(parseSerial(t)).toBeNull()
})

test('findSerial: the serial beside the row, not text in its fields', () => {
  const line = (text: string, x: number, y: number) => ({ text, x, y, width: 0.03, height: 0.015, fontSize: 9 })
  const row = [{ x: 0.1, y: 0.5, width: 0.5, height: 0.03 }]
  const s = findSerial(row, [line('ix.', 0.03, 0.47), line('x.', 0.03, 0.505), line('3', 0.2, 0.505)])
  expect(s && serialText(s, 2)).toBe('xi.')
  expect(findSerial(row, [line('3', 0.2, 0.505)])).toBeNull()
  expect(findSerial(row, [line('Qty', 0.01, 0.505), line('3', 0.05, 0.505)])).toBeNull() // not the leftmost
  expect(findSerial(row, [line('1800', 0.03, 0.47), line('200', 0.03, 0.505)])).toBeNull() // amounts don't count on
  expect(findSerial(row, [line('S. No.', 0.03, 0.47), line('1.', 0.03, 0.505)])?.start).toBe(1)
})

test('completedPdf: added rows print their own serial over the copied one', async () => {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const { completedPdf } = await import('../server')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await PDFDocument.create()
  const page = doc.addPage([600, 800])
  page.drawText('10.', { x: 20, y: 800 - 0.3 * 800 - 12, size: 10, font: await doc.embedFont(StandardFonts.Helvetica) })
  const serial = { x: 20 / 600, y: 0.3 + (12 - 9.2) / 800, width: 15 / 600, height: 11.8 / 800, size: 10, start: 10, style: '1' as const, before: '', after: '.' }
  const field = {
    id: 'task', key: 'task', type: 'text' as const, label: 'Task', source: 'manual' as const,
    position: { page: 1, x: 0.1, y: 0.3, width: 0.5, height: 0.03 },
    repeat: { id: 'tasks', serial },
  }
  const text = async (mode?: 'blank') => {
    const out = await completedPdf(await doc.save(), [{ ...field, repeat: { ...field.repeat, serial: { ...serial, mode } } }], { tasks__rows: '3' })
    const items = (await (await (await getDocument({ data: out }).promise).getPage(1)).getTextContent()).items
    // Each text with where it sits (x, y), the page's own "10." copies first, then what is written over them.
    return items.flatMap((i) => ('str' in i && i.str.trim() ? [`${i.str}@${Math.round(i.transform[4])},${Math.round(i.transform[5])}`] : []))
  }
  const [first, copy2, copy3, eleven, twelve] = await text()
  expect([first, copy2, copy3].map((t) => t.split('@')[0])).toEqual(['10.', '10.', '10.'])
  expect(eleven).toBe(`11.@${copy2.split('@')[1]}`)
  expect(twelve).toBe(`12.@${copy3.split('@')[1]}`)
  expect((await text('blank')).length).toBe(3) // cleared, nothing written
})
