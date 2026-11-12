// formlift/element: FormEditor and FormFiller for any framework (Angular, Vue, Svelte, plain JS).
// React, react-dom and the icons are bundled in, so the app installs only `formlift`.
// Nothing to set up: the CSS is added on the first mount and pdf.js (with its worker) is built in. You may still
// import 'formlift/style.css' yourself or call setPdfWorker; formlift then uses yours.
import { createElement, createRef, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import FormEditor, { type FormEditorHandle, type FormEditorProps } from '../react/FormEditor'
import FormFiller, { type FormFillerProps } from '../react/FormFiller'

import { setBuiltinPdfWorker } from '../react/pdfjs'
import { builtinWorker, ensureStyles } from './builtin'

export { setPdfWorker } from '../react/pdfjs'

setBuiltinPdfWorker(builtinWorker)
export { DEFAULT_LABELS, type Labels } from '../react/labels'
export type { FormDoc, FormEditorHandle } from '../react/FormEditor'
export type { FieldChangeApi } from '../react/hooks/useFormFiller'
export * from '../index'

/** Props that take React content are left out; `title` is plain text here. */
type ReactOnly = 'title' | 'toolbar' | 'banner' | 'tabs' | 'components' | 'ref' | 'renderFieldExtras'
export type EditorOptions = Omit<FormEditorProps, ReactOnly> & { title?: string }
export type FillerOptions = Omit<FormFillerProps, ReactOnly | 'renderFilters'> & { title?: string }

export interface Mounted<O> {
  /** Change some options; the rest stay as they were. */
  update(options: Partial<O>): void
  /** Removes the component from the element. Call it when your view is destroyed. */
  unmount(): void
}

export interface MountedEditor extends Mounted<EditorOptions> {
  /** Saves now (if there are changes). false = invalid, or onSave failed. */
  save(): Promise<boolean>
  /** Unsaved changes? */
  readonly dirty: boolean
  /** The current form JSON: { fields, layout }. */
  readonly value: FormEditorHandle['value'] | undefined
}

function mount<O extends object>(component: ComponentType<any>, el: HTMLElement, options: O, extra: object = {}) {
  ensureStyles(el)
  const root = createRoot(el)
  let current = options
  const render = () => root.render(createElement(component, { ...current, ...extra }))
  render()
  return {
    update(next: Partial<O>) {
      current = { ...current, ...next }
      render()
    },
    unmount: () => root.unmount(),
  }
}

/**
 * Shows the form builder in `el`. The form is plain JSON ({ fields, layout }): onSave / onChange hand it to you,
 * and you store it wherever you like.
 *
 * @example
 * const editor = mountEditor(document.getElementById('editor')!, { pdf: '/forms/1.pdf', onSave: (doc) => store(doc) })
 * editor.unmount()
 */
export function mountEditor(el: HTMLElement, options: EditorOptions): MountedEditor {
  const ref = createRef<FormEditorHandle>()
  const m = mount(FormEditor, el, options, { ref })
  return {
    ...m,
    save: () => ref.current?.save() ?? Promise.resolve(false),
    get dirty() {
      return ref.current?.dirty ?? false
    },
    get value() {
      return ref.current?.value
    },
  }
}

/**
 * Shows the fill-in view in `el`. Answers are plain JSON ({ fieldKey: value }): onChange / onSave hand them to you.
 *
 * @example
 * const filler = mountFiller(el, { pdf, fields: form.fields, layout: form.layout, onChange: (answers) => keep(answers) })
 */
export function mountFiller(el: HTMLElement, options: FillerOptions): Mounted<FillerOptions> {
  return mount(FormFiller, el, options)
}
