import { expect, test } from 'vitest'
import { nameAt } from './detect'
import type { TextLine } from './layout'

const line = (text: string, x: number, y: number, width = 0.1): TextLine => ({ text, x, y, width, height: 0.012, fontSize: 10 })
const box = (x: number, y: number) => ({ page: 1, x, y, width: 0.2, height: 0.02 })

test('nameAt: what auto-detect calls the spot, else the words on its left, else right above', () => {
  const lines = [line('Name:', 0.1, 0.1), line('Remarks', 0.5, 0.3)]
  const cell = { label: 'Boots – Quantity', position: { page: 1, x: 0.24, y: 0.5, width: 0.26, height: 0.03 } }
  expect(nameAt(box(0.25, 0.505), [cell], lines)).toBe('Boots – Quantity')
  expect(nameAt(box(0.25, 0.098), [cell], lines)).toBe('Name')
  expect(nameAt(box(0.5, 0.315), [cell], lines)).toBe('Remarks')
  expect(nameAt(box(0.5, 0.8), [cell], lines)).toBe('')
})
