// formlift core: the form model, validation, conditions, layout and PDF field auto-detection.
// No UI and no runtime dependencies: the same checks run in the browser and on your server.
export * from './core/form-logic'
export { detectDocument, detectFields, extractShapes, lessonFor, type Ops, type Rect, type Seg, type Shapes } from './core/detect'
export { addLesson, forgetting, learnt, taughtBy, validateLesson, whyLearnt, LEARNT, REMEMBERED } from './core/learn'
export type {
  DrawnNote,
  EditSession,
  Example,
  FieldSettings,
  Forget,
  LabelNote,
  Learnt,
  Lesson,
  Mark,
  PageMemory,
  Place,
  RememberedField,
  Score,
  SettingsChange,
} from './core/learn'
export { toQuestions, choicesOf, pickedOf, isFilled } from './core/questions'
export type { Question, PageText, ToQuestionsOptions } from './core/questions'
export {
  answeredFilter,
  builtinFilters,
  categoryFilter,
  choiceFilter,
  customFilter,
  filterQuestions,
  partFilter,
  pickedFilter,
  resolveFilters,
  searchText,
  tagFilter,
  tagFilters,
  typeFilter,
} from './core/filters'
export type { FilterOption, FilterSource, FilterValues, QuestionFilterDef } from './core/filters'
export { toLines, type TextLine, type PdfTextItem } from './core/layout'
export { readPage, pageFlow, flowSegments, flowText } from './core/flow'
export type { FlowBlock, FlowCell, FlowImage, FlowPara, FlowPart, FlowRun, FlowSegment, PageRead } from './core/flow'
export { newField, duplicate, reorder, withField, withoutField, newFollowUpField, uniqueKey, keyFor } from './core/fields'
export { fitInPage, moveBy, resizeBy, snap } from './core/coords'
