import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import type { AnswerValue, FieldDef } from '../../core/form-logic'
import FieldControl from './FieldControl'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const field: FieldDef = {
  id: '1',
  key: 'vessel',
  type: 'text',
  label: 'Vessel',
  source: 'manual',
  position: { page: 1, x: 0, y: 0, width: 0.2, height: 0.02 },
}

function Host() {
  const [v, setV] = useState<AnswerValue | undefined>('')
  return <FieldControl field={field} value={v} onChange={setV} compact />
}

it('compact (phone): the box on the page opens a full-size 16 px input, and the answer shows in the box', () => {
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  act(() => root.render(<Host />))
  const box = div.querySelector<HTMLButtonElement>('button[aria-label="Vessel"]')!
  expect(div.querySelector('input')).toBeNull() // nothing to type into on the tiny box itself
  act(() => box.click())
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Vessel"]')!
  expect(input.className).toContain('text-base')
  act(() => {
    // React tracks the value setter; set it the way a keystroke does.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'MT Spring Star')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click())
  expect(document.querySelector('input[aria-label="Vessel"]')).toBeNull()
  expect(box.textContent).toBe('MT Spring Star')
  act(() => root.unmount())
})

it('read-only multi-select opens to show every choice, with its boxes locked', async () => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  const multi: FieldDef = { ...field, key: 'cargo', type: 'multiselect', label: 'Cargo', options: ['Oil', 'Gas', 'Coal'] }
  act(() => root.render(<FieldControl field={multi} value={'["Oil","Gas"]'} onChange={() => {}} readOnly />))
  const button = el.querySelector<HTMLButtonElement>('button[aria-label="Cargo"]')!
  expect(button.disabled).toBe(false)
  act(() => button.click())
  const boxes = [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type=checkbox]')]
  expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
    [true, true],
    [true, true],
    [false, true],
  ])
  act(() => root.unmount())
  el.remove()
})
