// The form model: a form is a list of fields (where each sits on its PDF page, its type, settings, conditions,
// group and follow-up), and the answers people give. Plain data, JSON as you store it.

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'email',
  'phone',
  'dropdown',
  'radio',
  'checkbox',
  'file',
  'signature',
  'multiselect',
  'checklist',
  'time',
  'datetime',
  'url',
  'currency',
  'rating',
  'slider',
  'toggle',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'startsWith',
  'endsWith',
  'greaterThan',
  'lessThan',
  'between',
  'isEmpty',
  'isNotEmpty',
] as const;
export type Operator = (typeof OPERATORS)[number];

export interface Rule {
  fieldKey: string;
  op: Operator;
  value?: string;
  /** Upper bound for `between`. */
  value2?: string;
}
/** AND / OR of rules and nested groups. */
export interface Condition {
  logic: 'and' | 'or';
  rules: (Rule | Condition)[];
}

/** Where a field sits: fractions (0..1) of its PDF page, so zoom and screen size never move it. */
export interface Position {
  page: number; // 1-based
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldDef {
  id: string;
  key: string;
  type: FieldType;
  label: string;
  /** 'ai' fields come from automatic detection (later phase); the admin edits both the same way. */
  source: 'manual' | 'ai';
  confidence?: number;
  position: Position;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  required?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  /** Shown instead of formlift's message when the answer breaks a rule of this field. */
  errorMessage?: string;
  /** Shown instead of "<label> is required" for this field. */
  requiredMessage?: string;
  /** Names of your own rules (AnswerOptions.rules) this field must pass, checked in order. */
  rules?: string[];
  /** dropdown / radio / multiselect / checklist choices. */
  options?: string[];
  /** currency: the symbol shown before the amount (₹, $, €…). */
  currency?: string;
  /** currency: digits after the decimal point. Default 2. */
  decimals?: number;
  /** slider: the step between values. Default 1. (min / max: the slider's range, default 0–100; rating: max = stars, default 5.) */
  step?: number;
  visibleWhen?: Condition;
  requiredWhen?: Condition;
  readOnlyWhen?: Condition;
  /**
   * checkbox / toggle: a member of a group of boxes. Every member carries the same settings. mode 'single': ticking
   * one unticks the others (Yes / No / NA as separate boxes); 'multiple': any number, within min / max. required:
   * at least one (or `min`).
   */
  group?: FieldGroup;
  /**
   * Opens a dialog with more questions when `when` turns true by the person's change (e.g. answer "No" → ask why).
   * `fields`: keys of dialog-only fields (`dialogOnly: true`). Their answers are ordinary answers.
   */
  followUp?: FollowUp;
  /** Not on the page: asked in a follow-up dialog (or one your onFieldChange opens). `position.page` = where it belongs. */
  dialogOnly?: boolean;
  /**
   * file: an attached photo (PNG / JPEG) is also drawn in the completed PDF, in the box, as width:height ("4:3",
   * "1:1"; cropped to it from the middle) or "fit" (whole, its own shape). Unset: the file is only attached.
   */
  photoRatio?: string;
  /** file: people may attach several files (the answer is a JSON list of file ids, like a multiselect's). */
  multiple?: boolean;
  /** file: in the list view, the file's name over as many lines as it needs ('multiple') or cut to one (default). */
  listRows?: 'single' | 'multiple';
  /** People can leave comments on this field (a 💬 next to it). Stored apart from the answers: see Comments. */
  comments?: boolean;
  /**
   * A field of a repeatable table row: every field of the row carries the same `id`, and the person can add copies
   * of the row under it ("+ Add row"), up to `max` rows. Copy k (2, 3…) of a field has the key `<key>__<k>`; how
   * many rows there are is the answer `<id>__rows` (see expandRows). `row`: set on the copies only.
   */
  repeat?: RepeatRow;
}

export interface RepeatRow {
  /** Same id on every field of the row. */
  id: string;
  /** Most rows (the first included). Default: no limit. */
  max?: number;
  /** On a copy: which row it is (2, 3…). */
  row?: number;
}

export interface FieldGroup {
  /** Same id on every member. */
  id: string;
  mode: 'single' | 'multiple';
  required?: boolean;
  /** 'multiple': fewest ticked (default 1 when required). */
  min?: number;
  /** 'multiple': most ticked. */
  max?: number;
}

export interface FollowUp {
  when: Condition;
  /** The dialog's heading. Default: the field's label. */
  title?: string;
  /** Keys of the dialog-only fields asked, in order. */
  fields: string[];
}

/** One comment on a field. `by`: your user's name or id; `at`: ISO time. */
export interface FieldComment {
  id: string;
  text: string;
  by?: string;
  at: string;
}
/** Field key → its comments, oldest first. Saved next to the answers (not inside them). */
export type Comments = Record<string, FieldComment[]>;

/**
 * checkbox and toggle = boolean, file and signature = stored file id (dffuid; a signature is a PNG file),
 * multiselect and checklist = the chosen options as a JSON array string ('["A","B"]'), everything else = string
 * (time 'HH:MM', datetime 'YYYY-MM-DDTHH:MM', rating / slider / currency a number as text). Signatures saved before they were files are PNG data URLs: still read, turned into files on save.
 */
export type AnswerValue = string | boolean | null;
export type Answers = Record<string, AnswerValue>;

/** Types whose answer is a boolean. */
export const BOOLEAN_TYPES: readonly FieldType[] = ['checkbox', 'toggle'];
/** Types whose answer is several options (a JSON array string). */
export const MULTI_TYPES: readonly FieldType[] = ['multiselect', 'checklist'];
/** Types with a list of options. */
export const OPTION_TYPES: readonly FieldType[] = ['dropdown', 'radio', ...MULTI_TYPES];
