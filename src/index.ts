// formlift core: the form model, validation, conditions, layout and PDF field auto-detection.
// No UI and no runtime dependencies: the same checks run in the browser and on your server.
export * from './core/form-logic'
export { detectDocument, detectFields, extractShapes, type Ops, type Rect, type Seg, type Shapes } from './core/detect'
export { toQuestions, matches, choicesOf, pickedOf, isFilled, NO_FILTER } from './core/questions'
export type { Question, QuestionFilter, Filled, PageText } from './core/questions'
export { toLines, type TextLine, type PdfTextItem } from './core/layout'
export { newField, duplicate, reorder, withField, uniqueKey, keyFor } from './core/fields'
export { fitInPage, moveBy, resizeBy, snap } from './core/coords'
