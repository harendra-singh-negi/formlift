// Every UI building block formlift draws, swappable. `<FormliftProvider components={{ Button: MyButton }}>` (or the
// `components` prop of FormEditor / FormFiller) replaces it everywhere, inside the editor's panels too. Each
// replacement gets the same props as the built-in one (see UIComponents).
import { createContext, useContext, type ComponentType, type ReactNode } from 'react'
import BaseButton from './Button'
import BaseCheckbox from './Checkbox'
import * as chip from './Chip'
import * as form from './FormField'
import BaseIconButton from './IconButton'
import BaseModal, * as modal from './Modal'
import * as panel from './Panel'
import BasePopover from './Popover'
import BaseSegmentedTabs from './SegmentedTabs'
import BaseSignaturePad from './SignaturePad'
import * as tag from './Tag'
import type { FieldControlProps } from '../components/FieldControl'
import type { FieldType } from '../../core/form-logic'
import { LabelsProvider, useLabelOverrides, type Labels } from '../labels'

const base = {
  Button: BaseButton,
  IconButton: BaseIconButton,
  Checkbox: BaseCheckbox,
  FormField: form.FormField,
  TextInput: form.TextInput,
  Select: form.Select,
  TextArea: form.TextArea,
  Modal: BaseModal,
  ModalHeader: modal.ModalHeader,
  ModalBody: modal.ModalBody,
  ModalFooter: modal.ModalFooter,
  ConfirmModal: modal.ConfirmModal,
  PanelHeading: panel.PanelHeading,
  EmptyText: panel.EmptyText,
  SegmentedTabs: BaseSegmentedTabs,
  Chip: chip.Chip,
  ChipGroup: chip.ChipGroup,
  RemovableChip: chip.RemovableChip,
  Popover: BasePopover,
  Tag: tag.Tag,
  SignaturePad: BaseSignaturePad,
}

/** The built-in UI primitives. A replacement takes the same props: `ComponentProps<UIComponents['Button']>`. */
export type UIComponents = typeof base
export const defaultComponents: UIComponents = base

const UIContext = createContext<Partial<UIComponents>>({})

/**
 * Replaces formlift's UI primitives and texts (`labels`, any language) for everything under it.
 * Nested providers merge (inner wins).
 */
export function FormliftProvider({
  components,
  labels,
  children,
}: {
  components?: Partial<UIComponents>
  labels?: Partial<Labels>
  children: ReactNode
}) {
  const outer = useContext(UIContext)
  const outerLabels = useLabelOverrides()
  return (
    <UIContext.Provider value={components ? { ...outer, ...components } : outer}>
      <LabelsProvider value={labels ? { ...outerLabels, ...labels } : outerLabels}>{children}</LabelsProvider>
    </UIContext.Provider>
  )
}

function slot<K extends keyof UIComponents>(name: K): UIComponents[K] {
  const Slot = (props: object) => {
    const C = (useContext(UIContext)[name] ?? base[name]) as ComponentType<object>
    return <C {...props} />
  }
  Slot.displayName = `formlift.${name}`
  return Slot as unknown as UIComponents[K]
}

export const Button = slot('Button')
export const IconButton = slot('IconButton')
export const Checkbox = slot('Checkbox')
export const FormField = slot('FormField')
export const TextInput = slot('TextInput')
export const Select = slot('Select')
export const TextArea = slot('TextArea')
export const Modal = slot('Modal')
export const ModalHeader = slot('ModalHeader')
export const ModalBody = slot('ModalBody')
export const ModalFooter = slot('ModalFooter')
export const ConfirmModal = slot('ConfirmModal')
export const PanelHeading = slot('PanelHeading')
export const EmptyText = slot('EmptyText')
export const SegmentedTabs = slot('SegmentedTabs')
export const Chip = slot('Chip')
export const ChipGroup = slot('ChipGroup')
export const RemovableChip = slot('RemovableChip')
export const Popover = slot('Popover')
export const Tag = slot('Tag')
export const SignaturePad = slot('SignaturePad')
export { inputClass } from './FormField'

/**
 * What `components` on FormEditor / FormFiller takes: UI primitives, the answer control for every field
 * (`FieldControl`), or one per field type (`fields: { date: MyDatePicker }`; wins over FieldControl).
 */
export type FormliftComponents = Partial<UIComponents> & {
  FieldControl?: ComponentType<FieldControlProps>
  fields?: Partial<Record<FieldType, ComponentType<FieldControlProps>>>
}
