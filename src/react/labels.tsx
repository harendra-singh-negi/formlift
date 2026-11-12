// Every piece of text the React UI shows, in English. Pass your own (any language) as `labels` on FormEditor /
// FormFiller / FormliftProvider; what you leave out stays English. Texts with a number or name in them are functions.
import { createContext, useContext, useMemo } from 'react'
import type { FieldType, Operator } from '../core/form-logic'
import type { ElementTool } from '../core/layout'

export const DEFAULT_LABELS = {
  // Shared
  back: 'Back',
  cancel: 'Cancel',
  yes: 'Yes',
  no: 'No',
  close: 'Close',
  done: 'Done',
  loadingDocument: 'Loading document…',
  documentLoadError: 'The document could not be shown',
  page: 'Page',
  left: 'Left',
  top: 'Top',
  width: 'Width',
  height: 'Height',
  positionSection: 'Position (% of page)',
  resize: 'Resize',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',

  // Field types
  typeText: 'Text',
  typeTextarea: 'Text area',
  typeNumber: 'Number',
  typeDate: 'Date',
  typeEmail: 'Email',
  typePhone: 'Phone',
  typeDropdown: 'Dropdown',
  typeRadio: 'Radio group',
  typeCheckbox: 'Checkbox',
  typeFile: 'File upload',
  typeSignature: 'Signature',

  // Layout tools (their uppercase is the panel heading of a selected item)
  toolText: 'Text',
  toolBox: 'Box',
  toolWhiteout: 'White-out (hide)',
  toolLine: 'Line',

  // Editor toolbar
  add: 'Add',
  properties: 'Properties',
  panel: 'Panel',
  unsavedChanges: 'Unsaved changes',
  allChangesSaved: 'All changes saved',
  undo: 'Undo (Ctrl+Z)',
  redo: 'Redo (Ctrl+Y)',
  snapOn: 'Snap to grid: on',
  snapOff: 'Snap to grid: off',
  editText: 'Edit text',
  editTextHint: 'Click any line of the document to change its text',
  autoDetect: 'Auto-detect',
  autoDetectHint: 'Find answer lines, checkboxes and table cells and suggest fields for them',
  preview: 'Preview',
  backToEditing: 'Back to editing',
  edit: 'Edit',
  save: 'Save',
  detecting: (done: number, total: number) => `Detecting fields… page ${done} of ${total}`,
  stop: 'Stop',
  tapToPlace: (what: string) => `Tap the page where the ${what} should go.`,
  editTextBanner:
    'Edit text: click a line of the document to replace it with an editable copy (same place and size). The uploaded file itself never changes.',

  // Editor tools, document, panel
  fieldsHeading: 'FIELDS',
  layoutHeading: 'LAYOUT',
  dragHint: 'Drag onto the document, or tap one, then the page',
  editLine: (text: string) => `Edit: ${text}`,
  fieldOnPage: (type: string, name: string) => `${type} field ${name}`,
  propertiesTab: 'Properties',
  fieldsTab: (n: number) => `Fields (${n})`,
  pagesTab: (n: number) => `Pages (${n})`,
  duplicate: 'Duplicate (Ctrl+D)',
  deleteSelected: 'Delete (Del)',
  fieldHeading: 'FIELD',
  propertiesHeading: 'PROPERTIES',
  nothingSelected:
    "Select something on the document, drag a field or layout item in from the left, or use Edit text to change the document's own text.",
  fillOrderHeading: 'FILL ORDER',
  noFields: 'No fields yet.',
  searchFields: 'Search fields',
  pageShort: (n: number) => `p${n}`,
  suggestedTag: 'AI',
  moveUp: 'Move up',
  moveDown: 'Move down',
  loadingPages: 'Loading pages…',
  deletePage: 'Delete page',
  confirmDeletePage: (page: number, items: number) =>
    `Delete page ${page}? Its ${items} fields and items go with it. (Undo brings them back; the uploaded file is not changed.)`,

  // Editor messages (notify)
  saved: 'Saved',
  fieldsSuggested: (n: number, stoppedEarly: boolean) =>
    `${n} fields suggested${stoppedEarly ? ' (stopped early)' : ''}. Check the dashed ones, then Save.`,
  noFieldsFoundAuto: 'No fields found automatically. Drag them in from the left.',
  noNewFieldsFound: 'No new fields found',

  // Pages panel
  blankPageAtStart: 'Blank page at the start',
  pageItem: (n: number) => `Page ${n}`,
  originalPage: (n: number) => `· original p.${n}`,
  blankPage: '· blank',
  pageItemCount: (n: number) => ` · ${n} items`,
  movePageUp: 'Move page up',
  movePageDown: 'Move page down',
  addBlankPageAfter: 'Add blank page after',

  // Field properties
  fieldSection: 'Field',
  suggestedAutomatically: (sure: number | null) =>
    `Suggested automatically${sure != null ? ` (${sure}% sure)` : ''}. Check it.`,
  fieldId: (id: string) => `ID ${id}`,
  label: 'Label',
  keyAutomatic: 'Key (automatic, from the label)',
  type: 'Type',
  placeholder: 'Placeholder',
  checkedByDefault: 'Checked by default',
  defaultValue: 'Default value',
  helpText: 'Help text (shown as tooltip)',
  required: 'Required',
  readOnly: 'Read-only',
  hidden: 'Hidden',
  optionsSection: 'Options (one per line)',
  validationSection: 'Validation',
  minLength: 'Min length',
  maxLength: 'Max length',
  minValue: 'Min value',
  maxValue: 'Max value',
  regex: 'Regex (whole value must match)',
  messagesSection: 'Messages and rules',
  requiredMessage: 'Message when empty',
  errorMessage: 'Message when invalid',
  messageHint: 'Leave empty for the standard message',
  rulesLabel: 'Rules',
  visibleWhen: 'Show only when',
  requiredWhen: 'Required when',
  readOnlyWhen: 'Read-only when',
  addCondition: '+ Add condition',

  // Conditions
  match: 'Match',
  matchAllOrAny: 'Match all or any',
  matchAll: 'ALL (AND)',
  matchAny: 'ANY (OR)',
  removeGroup: 'Remove group',
  removeRule: 'Remove rule',
  field: 'Field',
  operator: 'Operator',
  value: 'Value',
  upperValue: 'Upper value',
  rule: 'Rule',
  group: 'Group',
  opEquals: 'equals',
  opNotEquals: 'does not equal',
  opContains: 'contains',
  opStartsWith: 'starts with',
  opEndsWith: 'ends with',
  opGreaterThan: 'is greater than',
  opLessThan: 'is less than',
  opBetween: 'is between',
  opIsEmpty: 'is empty',
  opIsNotEmpty: 'is not empty',

  // Layout item properties
  textSection: 'Text',
  replacesOriginal: (text: string) => `Replaces the original: “${text}”`,
  text: 'Text',
  font: 'Font',
  fontSans: 'Sans (Helvetica)',
  fontSerif: 'Serif (Times)',
  fontMono: 'Mono (Courier)',
  fontSize: 'Size (pt)',
  bold: 'Bold',
  italic: 'Italic',
  alignment: 'Alignment',
  alignLeft: 'Left',
  alignCenter: 'Centre',
  alignRight: 'Right',
  textColour: 'Text colour',
  coloursSection: 'Colours',
  background: 'Background',
  lineColour: 'Line colour',
  border: 'Border',
  lineWidth: 'Line width (pt)',
  noColour: (what: string) => `No ${what.toLowerCase()}`,
  none: 'None',
  whiteHides: 'A white background hides the original under it.',

  // Filler
  documentView: 'Document',
  listView: 'List',
  draftSaved: 'Draft saved',
  unsaved: 'Unsaved',
  saving: 'Saving…',
  notSaved: 'Not saved',
  saveDraft: 'Save draft',
  submit: 'Submit',
  attachments: 'Attachments',
  download: (name: string) => `Download ${name}`,
  errorOnPage: (page: number, error: string) => `Page ${page}: ${error}`,
  confirmSubmit: 'Submit this form? You cannot change the answers afterwards.',
  submitted: 'Submitted',
  answersNeedAttention: 'Some answers need attention',
  fileOpenError: 'Unable to open the file',

  // Answer controls
  signature: 'Signature',
  sign: 'Sign',
  signTitle: (name: string) => `Sign: ${name}`,
  signatureFileName: (name: string) => `Signature - ${name}.png`,
  attachedFile: 'Attached file',
  attach: 'Attach',
  replace: 'Replace',
  signatureArea: 'Signature drawing area',
  clear: 'Clear',
  useSignature: 'Use signature',

  // Question list and its filters
  searchQuestions: 'Search questions',
  searchPlaceholder: 'Search questions, sections, answers…',
  filters: 'Filters',
  questionsCount: (shown: number, total: number) => `${shown} of ${total} questions`,
  clearAll: 'Clear all',
  all: 'All',
  noQuestionMatches: 'No question matches these filters.',
  showMore: (left: number) => `Show more (${left} left)`,
  pageTag: (n: number) => `p.${n}`,
  remove: (what: string) => `Remove ${what}`,
  filterAnswered: 'Answered',
  filterNotAnswered: 'Not answered',
  filterRemarks: 'Remarks',
  filterComments: 'Comments',
  filterWritten: 'Written',
  filterEmpty: 'Empty',
  filterHasOption: 'Has option',
  filterAnsweredWith: 'Answered with',
  filterCategory: 'Category',
  filterAnswerType: 'Answer type',
  sectionProgress: 'Progress',
  sectionAnswers: 'Answers',
  sectionAnswerType: 'Answer type',
  sectionQuestionDetails: 'Question details',
}

/** Every text of the UI. Override any of them with `labels: Partial<Labels>`. */
export type Labels = typeof DEFAULT_LABELS

const LabelsContext = createContext<Partial<Labels>>({})
export const LabelsProvider = LabelsContext.Provider
export const useLabelOverrides = () => useContext(LabelsContext)

/** The texts in effect here: your `labels` over the English defaults. */
export function useLabels(extra?: Partial<Labels>): Labels {
  const ctx = useContext(LabelsContext)
  return useMemo(() => ({ ...DEFAULT_LABELS, ...ctx, ...extra }), [ctx, extra])
}

/** A field type's name. */
export const typeName = (L: Labels, t: FieldType) =>
  ({
    text: L.typeText,
    textarea: L.typeTextarea,
    number: L.typeNumber,
    date: L.typeDate,
    email: L.typeEmail,
    phone: L.typePhone,
    dropdown: L.typeDropdown,
    radio: L.typeRadio,
    checkbox: L.typeCheckbox,
    file: L.typeFile,
    signature: L.typeSignature,
  })[t]

/** A layout tool's name. */
export const toolName = (L: Labels, t: ElementTool) =>
  ({ text: L.toolText, box: L.toolBox, whiteout: L.toolWhiteout, line: L.toolLine })[t]

/** A condition operator's name. */
export const operatorName = (L: Labels, op: Operator) =>
  ({
    equals: L.opEquals,
    notEquals: L.opNotEquals,
    contains: L.opContains,
    startsWith: L.opStartsWith,
    endsWith: L.opEndsWith,
    greaterThan: L.opGreaterThan,
    lessThan: L.opLessThan,
    between: L.opBetween,
    isEmpty: L.opIsEmpty,
    isNotEmpty: L.opIsNotEmpty,
  })[op]
