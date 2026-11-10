import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FieldDef } from '../core/form-logic'
import FormFiller from './FormFiller'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// pdf.js needs a real canvas and worker: the overlay is what this test is about.
vi.mock('./components/PdfPages', () => ({
  default: ({ overlay }: { overlay: (p: number) => ReactNode }) => (
    <div data-page="1" style={{ position: 'relative' }}>
      {overlay(1)}
    </div>
  ),
}))

const pos = (y: number) => ({ page: 1, x: 0.1, y, width: 0.3, height: 0.04 })
const fields: FieldDef[] = [
  { id: '1', key: 'name', type: 'text', label: 'Name', source: 'manual', position: pos(0.1), required: true },
  {
    id: '2',
    key: 'status',
    type: 'dropdown',
    label: 'Status',
    source: 'manual',
    position: pos(0.2),
    options: ['Employed', 'Other'],
  },
  {
    id: '3',
    key: 'company',
    type: 'text',
    label: 'Company',
    source: 'manual',
    position: pos(0.3),
    required: true,
    visibleWhen: { logic: 'and', rules: [{ fieldKey: 'status', op: 'equals', value: 'Employed' }] },
  },
]

let root: Root
let el: HTMLDivElement
beforeEach(() => {
  el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
})
afterEach(() => {
  act(() => root.unmount())
  el.remove()
  vi.restoreAllMocks()
})

const input = (label: string) => el.querySelector<HTMLInputElement & HTMLSelectElement>(`[aria-label="${label}"]`)
// Last match: the confirm dialog's button comes after the toolbar's.
const button = (text: string) =>
  [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text).at(-1)!
function type(target: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = target instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(target, value)
  target.dispatchEvent(new Event(target instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)))

it('fields sit on the page by percentage, conditions show/hide, submit is blocked until valid', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const onSubmitted = vi.fn()
  await act(async () =>
    root.render(<FormFiller pdf="x.pdf" fields={fields} onSave={save} onSubmitted={onSubmitted} onError={vi.fn()} />),
  )
  await flush()

  expect(input('Name')!.parentElement!.style.top).toBe('10%')
  expect(input('Company')).toBeNull() // hidden until Status = Employed

  act(() => type(input('Status')!, 'Employed'))
  expect(input('Company')).not.toBeNull()

  // Required Name and Company missing: nothing is sent.
  act(() => button('Submit').click())
  await act(async () => button('Submit').click()) // the confirm dialog's button
  expect(save).not.toHaveBeenCalled()
  expect(el.textContent).toContain('Name is required')
  expect(el.textContent).toContain('Company is required')

  act(() => type(input('Name')!, 'Asha'))
  act(() => type(input('Company')!, 'SailCo'))
  act(() => button('Submit').click())
  await act(async () => button('Submit').click())
  await flush()
  expect(save).toHaveBeenCalledWith({ name: 'Asha', status: 'Employed', company: 'SailCo' }, { submit: true })
  expect(onSubmitted).toHaveBeenCalled()
})

it('Save draft sends the latest answers; server field errors show at the fields', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  await act(async () => root.render(<FormFiller pdf="x.pdf" fields={fields} onSave={save} onError={vi.fn()} />))
  await flush()
  act(() => type(input('Name')!, 'A'))
  await act(async () => button('Save draft').click())
  await flush()
  act(() => type(input('Name')!, 'AB'))
  await act(async () => button('Save draft').click())
  await flush()
  expect(save.mock.calls.map((c) => c[1].submit)).toEqual([false, false])
  expect(save.mock.calls[1][0]).toEqual({ name: 'AB' })
  expect(el.textContent).toContain('Draft saved')

  save.mockRejectedValueOnce({ errors: { name: 'Name is taken' } })
  await act(async () => button('Save draft').click())
  await flush()
  expect(el.textContent).toContain('Name is taken')
})
