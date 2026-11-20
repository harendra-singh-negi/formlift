// The form model (fields, conditions, layout) and its checks. Pure TypeScript with no imports from outside this
// folder, so the SAME rules run in the browser (instant feedback) and on your server (the check that counts).
//   model.ts       fields, conditions and answers: the shapes, as you store them
//   limits.ts      the size limits every check enforces
//   values.ts      how each type keeps its answer, and how people read it
//   conditions.ts  what the conditions make of each field for a set of answers
//   groups.ts      groups of boxes, and the follow-up questions a change opens
//   answers.ts     checking answers (one, or a whole submission), defaults, cleaning what the browser sends
//   comments.ts    comments on fields
//   validate.ts    checking a form's fields before it is saved
//   layout.ts      pages shown and what the admin drew on them
//   rows.ts        repeatable table rows: the copies people add (expandRows)
//   grow.ts        long text answers growing their box, pushing the page down (screen and PDF)

export {
  FIELD_TYPES,
  OPERATORS,
  BOOLEAN_TYPES,
  MULTI_TYPES,
  OPTION_TYPES,
  type FieldType,
  type Operator,
  type Rule,
  type Condition,
  type Position,
  type FieldDef,
  type FieldGroup,
  type FollowUp,
  type FieldComment,
  type Comments,
  type AnswerValue,
  type Answers,
  type RepeatRow,
} from './model';
export {
  DEFAULT_LIMITS,
  resolveLimits,
  MAX_FIELDS,
  MAX_SIGNATURE_CHARS,
  MAX_PAGES,
  MAX_ELEMENTS,
  type Limits,
} from './limits';
export {
  multiValue,
  multiAnswer,
  fileIds,
  ratioOf,
  rangeOf,
  answerText,
} from './values';
export {
  evaluate,
  fieldStates,
} from './conditions';
export {
  groupsOf,
  applyAnswer,
  openedFollowUps,
} from './groups';
export {
  DEFAULT_ANSWER_MESSAGES,
  defaultAnswers,
  checkAnswer,
  validateAnswers,
  cleanAnswers,
  type AnswerMessages,
  type AnswerRule,
  type AnswerOptions,
} from './answers';
export {
  cleanComments,
} from './comments';
export {
  validateFields,
} from './validate';
export {
  FONTS,
  defaultLayout,
  validateLayout,
  type LayoutPage,
  type FontName,
  type LayoutElement,
  type Layout,
} from './layout';
export {
  GROWING_TYPES,
  wrapText,
  textFit,
  fileRows,
  textSize,
  pageCuts,
  movedDown,
  pageGrowth,
  pageSheets,
  sheetOf,
  onSheets,
  sheetPieces,
  lineGaps,
  BREAK_MARGIN,
  type Cut,
  type RowCut,
  ROW_PAD,
  type Sheet,
  type WidthOf,
} from './grow';
export {
  rowsKey,
  rowCount,
  expandRows,
  removeRow,
  repeatIds,
} from './rows';
