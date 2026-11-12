import { act, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { FieldDef } from '../core/form-logic'
import { mountFiller } from './index'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// pdf.js needs a real canvas and worker: only the overlay with the controls is drawn here.
vi.mock('../react/components/PdfPages', () => ({
  default: ({ overlay }: { overlay: (p: number) => ReactNode }) => <div data-page="1">{overlay(1)}</div>,
}))

const fields: FieldDef[] = [
  {
    id: '1',
    key: 'name',
    type: 'text',
    label: 'Name',
    source: 'manual',
    position: { page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.04 },
  },
]

const el = document.createElement('div')
document.body.appendChild(el)
afterEach(() => (el.innerHTML = ''))

it('mounts, hands out answers as JSON, updates and unmounts without React in the app', async () => {
  const onChange = vi.fn()
  let m!: ReturnType<typeof mountFiller>
  await act(async () => {
    m = mountFiller(el, { pdf: new Uint8Array(), fields, title: 'Intake', onChange, views: ['document'] })
  })
  expect(el.textContent).toContain('Intake')

  const input = el.querySelector('input') as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Asha')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(onChange).toHaveBeenLastCalledWith({ name: 'Asha' })

  await act(async () => m.update({ title: 'Renamed' }))
  expect(el.textContent).toContain('Renamed')

  await act(async () => m.unmount())
  expect(el.innerHTML).toBe('')
})
