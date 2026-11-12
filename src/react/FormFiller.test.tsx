import { act, type MouseEventHandler, type ReactNode } from 'react'
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
  expect(save).toHaveBeenCalledWith({ name: 'Asha', status: 'Employed', company: 'SailCo' }, { submit: true, comments: {} })
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

it('draws the given components instead of the built-in ones', () => {
  const MyButton = ({
    children,
    onClick,
  }: {
    children?: ReactNode
    onClick?: MouseEventHandler<HTMLButtonElement>
  }) => (
    <button data-custom onClick={onClick}>
      {children}
    </button>
  )
  act(() => root.render(<FormFiller pdf="x.pdf" fields={fields} onSave={() => {}} components={{ Button: MyButton }} />))
  expect(button('Submit').hasAttribute('data-custom')).toBe(true)
})

it('hides the parts listed in hide and offers only the given views', () => {
  act(() =>
    root.render(<FormFiller pdf="x.pdf" fields={fields} onSave={() => {}} hide={['saveDraft']} views={['document']} />),
  )
  expect(button('Save draft')).toBeUndefined()
  expect(button('Submit')).toBeDefined()
  expect(button('List')).toBeUndefined()
})

it('draws a field type with its own renderer, the rest with the built-in control', () => {
  const MyText = ({ field }: { field: FieldDef }) => <span data-mine>{field.key}</span>
  act(() => root.render(<FormFiller pdf="x.pdf" fields={fields} components={{ fields: { text: MyText } }} />))
  expect([...el.querySelectorAll('[data-mine]')].map((n) => n.textContent)).toEqual(['name'])
  expect(input('Status')).not.toBeNull()
})

it('lets you draw the list filters yourself', () => {
  act(() =>
    root.render(
      <FormFiller
        pdf="x.pdf"
        fields={fields}
        views={['list']}
        renderFilters={(fs) => (
          <button data-my-filter onClick={() => fs.setSearch('zzz')}>
            {fs.list.length}/{fs.total}
          </button>
        )}
      />,
    ),
  )
  const mine = el.querySelector<HTMLButtonElement>('[data-my-filter]')!
  expect(mine.textContent).toBe('2/2')
  expect(el.querySelector('[aria-label="Search questions"]')).toBeNull()
  act(() => mine.click())
  expect(mine.textContent).toBe('0/2')
})

it('offers only the filters you list, and you decide on the ones this form has nothing for', () => {
  let groups: { id: string; available: boolean }[] = []
  act(() =>
    root.render(
      <FormFiller
        pdf="x.pdf"
        fields={fields}
        views={['list']}
        listFilters={['answered', 'category']}
        renderFilters={(fs) => {
          groups = fs.groups.map(({ id, available }) => ({ id, available }))
          return null
        }}
      />,
    ),
  )
  expect(groups).toEqual([
    { id: 'answered', available: true },
    { id: 'category', available: false },
  ])
})

it('shows your labels instead of the English ones', () => {
  act(() =>
    root.render(
      <FormFiller
        pdf="x.pdf"
        fields={fields}
        onSave={() => {}}
        labels={{ submit: 'जमा करें', documentView: 'Doc', listView: 'Questions' }}
      />,
    ),
  )
  expect(button('जमा करें')).toBeTruthy()
  expect(button('Questions')).toBeTruthy()
  expect(button('Save draft')).toBeTruthy() // left out: stays English
})

it('onFieldChange: sees the answers after the change, sets other answers, opens a dialog of dialog-only fields', async () => {
  const withExtra: FieldDef[] = [
    ...fields,
    { id: '4', key: 'why', type: 'text', label: 'Why', source: 'manual', position: pos(0.4), dialogOnly: true },
  ]
  const seen: unknown[] = []
  const save = vi.fn().mockResolvedValue(undefined)
  await act(async () =>
    root.render(
      <FormFiller
        pdf="x.pdf"
        fields={withExtra}
        onSave={save}
        onError={vi.fn()}
        onFieldChange={(f, v, api) => {
          seen.push([f.key, v, api.answers.status])
          if (f.key === 'status' && v === 'Other') {
            api.setAnswer('company', 'n/a')
            api.openDialog(['why'], 'Tell us more')
          }
        }}
      />,
    ),
  )
  await flush()
  expect(input('Why')).toBeNull() // dialog-only: not on the page
  act(() => type(input('Status')!, 'Other'))
  expect(seen).toEqual([['status', 'Other', 'Other']])
  const dialog = document.querySelector('[role="dialog"][aria-label="Tell us more"]')!
  expect(dialog).not.toBeNull()
  act(() => type(dialog.querySelector<HTMLInputElement>('[aria-label="Why"]')!, 'Retired'))
  expect(seen).toHaveLength(2) // the dialog's field reports its change too; setAnswer did not
  await act(async () => button('Save draft').click())
  await flush()
  expect(save).toHaveBeenLastCalledWith({ status: 'Other', company: 'n/a', why: 'Retired' }, { submit: false, comments: {} })
})
