// formlift/react: the form builder (FormEditor) and the fill-in view (FormFiller). Import 'formlift/style.css' once.
export { default as FormEditor } from './FormEditor'
export type { EditorPart, FormDoc, FormEditorHandle, FormEditorProps } from './FormEditor'
export { default as FormFiller } from './FormFiller'
export type { AnswerFileInfo, FillerPart, FormFillerProps } from './FormFiller'
export { default as FieldControl, AnswerControl } from './components/FieldControl'
export { default as PdfPages, readPdf } from './components/PdfPages'
export type { PdfSource, PdfBytes, PageSize } from './components/PdfPages'
export { setPdfWorker } from './pdfjs'
export { TYPE_LABEL } from './constants'

// Headless: all the logic, none of the UI. Build your own editor / filler around these.
export { useFormEditor } from './hooks/useFormEditor'
export type { FormEditorState, UseFormEditorOptions, Selection } from './hooks/useFormEditor'
export { useFormFiller } from './hooks/useFormFiller'
export type { FormFillerState, UseFormFillerOptions, SaveState } from './hooks/useFormFiller'
export { useQuestionFilter, defaultFilters } from './hooks/useQuestionFilter'
export type { FilterGroup, QuestionFilterState, UseQuestionFilterOptions } from './hooks/useQuestionFilter'
export { useUndo } from './hooks/useUndo'
export { useFitZoom } from './hooks/useFitZoom'
export { default as LayoutElementView } from './components/LayoutElementView'
export { default as QuestionList } from './components/QuestionList'
export type { FieldControlProps } from './components/FieldControl'

// Swap UI primitives (Button, Modal, Select…) everywhere, or reuse ours in your own UI.
export { FormliftProvider, defaultComponents } from './ui/slots'
export type { FormliftComponents, UIComponents } from './ui/slots'
