import type { FieldType } from '../core/form-logic'

export const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  textarea: 'Text area',
  number: 'Number',
  date: 'Date',
  email: 'Email',
  phone: 'Phone',
  dropdown: 'Dropdown',
  radio: 'Radio group',
  checkbox: 'Checkbox',
  file: 'File upload',
  signature: 'Signature',
}

/** Default zoom steps; FormEditor / FormFiller take your own as `zoomSteps`. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/** CSS width of a page at zoom 1 is its width in points (72 dpi) × this. */
export const BASE_SCALE = 96 / 72
