// Answers: the messages for wrong ones, the check of one answer and of a whole submission, the answers a new
// submission starts with, and the cleaning of answers that come from the browser.

import { fieldStates } from './conditions';
import { groupsOf } from './groups';
import { resolveLimits, type Limits } from './limits';
import { BOOLEAN_TYPES, type Answers, type AnswerValue, type FieldDef, type FieldType } from './model';
import { isEmpty, multiValue, rangeOf } from './values';
import { expandRows, repeatIds, rowCount, rowsKey } from './rows';

/** Messages people see for wrong answers. Override any of them (other language, own wording). */
export interface AnswerMessages {
  required: (label: string) => string
  checkbox: string
  invalid: string
  signature: string
  tooShort: (min: number) => string
  tooLong: (max: number) => string
  number: string
  min: (min: number) => string
  max: (max: number) => string
  date: string
  email: string
  phone: string
  option: string
  pattern: string
  time: string
  datetime: string
  url: string
  decimals: (n: number) => string
  groupOne: string
  groupMin: (n: number) => string
  groupMax: (n: number) => string
}

export const DEFAULT_ANSWER_MESSAGES: Readonly<AnswerMessages> = Object.freeze({
  required: (label: string) => `${label} is required`,
  checkbox: 'Must be checked or unchecked',
  invalid: 'Invalid value',
  signature: 'Invalid signature',
  tooShort: (n: number) => `At least ${n} characters`,
  tooLong: (n: number) => `At most ${n} characters`,
  number: 'Must be a number',
  min: (n: number) => `Must be at least ${n}`,
  max: (n: number) => `Must be at most ${n}`,
  date: 'Must be a date (YYYY-MM-DD)',
  email: 'Must be an email address',
  phone: 'Must be a phone number',
  option: 'Pick one of the options',
  pattern: 'Has the wrong format',
  time: 'Must be a time (HH:MM)',
  datetime: 'Must be a date and time',
  url: 'Must be a web address (https://…)',
  decimals: (n: number) => (n ? `At most ${n} digits after the decimal point` : 'Must be a whole number'),
  groupOne: 'Tick exactly one',
  groupMin: (n: number) => (n === 1 ? 'Tick at least one' : `Tick at least ${n}`),
  groupMax: (n: number) => `Tick at most ${n}`,
});

/** One of your own validation rules. Give the same rules to FormEditor (to pick them), FormFiller and your server. */
export interface AnswerRule {
  /** Name shown in the builder when picking rules for a field. Default: the rule's id. */
  label?: string;
  /** Field types the rule can be picked for. Default: all. */
  types?: FieldType[];
  /** The problem as a message, or null when the answer is fine. Not called for empty answers. */
  check: (value: AnswerValue, field: FieldDef, answers: Answers) => string | null;
}

/** Options of checkAnswer / validateAnswers: limits, your wording, your own rules and full control. */
export type AnswerOptions = Partial<Limits> & {
  /** Your own wording for formlift's answer errors (any language). */
  messages?: Partial<AnswerMessages>;
  /** Named rules that fields list in `rules`, e.g. { permit: { label: 'Permit number', check: (v) => ... } }. */
  rules?: Record<string, AnswerRule>;
  /**
   * Runs first, for every visible field. Return a message (error), null (valid: skip formlift's checks) or
   * undefined (formlift checks as usual).
   */
  validate?: (field: FieldDef, value: AnswerValue | undefined, answers: Answers) => string | null | undefined;
};

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{6,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Answers to start a new submission with: each field's default value. */
export function defaultAnswers(fields: FieldDef[]): Answers {
  const out: Answers = {};
  for (const f of fields) {
    if (f.defaultValue == null || f.defaultValue === '') continue;
    out[f.key] = BOOLEAN_TYPES.includes(f.type) ? f.defaultValue === 'true' : f.defaultValue;
  }
  return out;
}

export function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

/** One answer's problem, or null. Used per field while typing and for the whole form on submit. */
export function checkAnswer(
  f: FieldDef,
  v: AnswerValue | undefined,
  required: boolean,
  options?: AnswerOptions,
  /** All answers, for rules that compare fields. */
  answers: Answers = {},
): string | null {
  const own = options?.validate?.(f, v, answers);
  if (own !== undefined) return own;
  if (isEmpty(v)) {
    if (!required) return null;
    const m: AnswerMessages = { ...DEFAULT_ANSWER_MESSAGES, ...options?.messages };
    return f.requiredMessage || m.required(f.label || f.key);
  }
  const err = builtinCheck(f, v as AnswerValue, options);
  if (err) return f.errorMessage || err;
  for (const name of f.rules ?? []) {
    const ruleErr = options?.rules?.[name]?.check(v as AnswerValue, f, answers);
    if (ruleErr) return f.errorMessage || ruleErr;
  }
  return null;
}

/** formlift's own checks of a non-empty answer. */
function builtinCheck(f: FieldDef, v: AnswerValue, options?: AnswerOptions): string | null {
  const { maxAnswerLength, maxSignatureChars } = resolveLimits(options);
  const m: AnswerMessages = { ...DEFAULT_ANSWER_MESSAGES, ...options?.messages };
  if (BOOLEAN_TYPES.includes(f.type)) return typeof v === 'boolean' ? null : m.checkbox;
  if (typeof v !== 'string') return m.invalid;
  if (f.type === 'signature')
    return FILE_ID.test(v) || (v.startsWith('data:image/png;base64,') && v.length <= maxSignatureChars)
      ? null
      : m.signature;
  if (v.length > maxAnswerLength) return m.tooLong(maxAnswerLength);
  if (f.minLength != null && v.length < f.minLength) return m.tooShort(f.minLength);
  if (f.maxLength != null && v.length > f.maxLength) return m.tooLong(f.maxLength);
  switch (f.type) {
    case 'number': {
      const n = Number(v);
      if (v.trim() === '' || !Number.isFinite(n)) return m.number;
      if (f.min != null && n < f.min) return m.min(f.min);
      if (f.max != null && n > f.max) return m.max(f.max);
      break;
    }
    case 'date':
      if (!DATE.test(v) || Number.isNaN(Date.parse(v))) return m.date;
      break;
    case 'email':
      if (!EMAIL.test(v)) return m.email;
      break;
    case 'phone':
      if (!PHONE.test(v)) return m.phone;
      break;
    case 'dropdown':
    case 'radio':
      if (!(f.options ?? []).includes(v)) return m.option;
      break;
    case 'multiselect':
    case 'checklist': {
      const chosen = multiValue(v);
      if (!v.startsWith('[') || !chosen.length || chosen.some((o) => !(f.options ?? []).includes(o))) return m.option;
      if (f.min != null && chosen.length < f.min) return m.min(f.min);
      if (f.max != null && chosen.length > f.max) return m.max(f.max);
      return null; // pattern / length rules are for typed text
    }
    case 'time':
      if (!TIME.test(v)) return m.time;
      break;
    case 'datetime': {
      const d = DATETIME.exec(v);
      if (!d || Number.isNaN(Date.parse(d[1]))) return m.datetime;
      break;
    }
    case 'url': {
      let ok = false;
      try {
        ok = /^https?:$/.test(new URL(v).protocol);
      } catch {
        ok = false;
      }
      if (!ok) return m.url;
      break;
    }
    case 'currency': {
      const n = Number(v);
      if (v.trim() === '' || !Number.isFinite(n)) return m.number;
      const places = f.decimals ?? 2;
      if ((v.split('.')[1] ?? '').length > places) return m.decimals(places);
      if (f.min != null && n < f.min) return m.min(f.min);
      if (f.max != null && n > f.max) return m.max(f.max);
      break;
    }
    case 'rating':
    case 'slider': {
      const n = Number(v);
      const { min, max, step } = rangeOf(f);
      if (v.trim() === '' || !Number.isFinite(n)) return m.number;
      if (n < min) return m.min(min);
      if (n > max) return m.max(max);
      // on the step grid (with float slack: 0.1 + 0.2)
      const k = (n - min) / step;
      if (Math.abs(k - Math.round(k)) > 1e-9) return m.invalid;
      break;
    }
  }
  if (f.pattern && !safeRegex(f.pattern)?.test(v)) return m.pattern;
  return null;
}

/** Every problem with these answers, by field key. Empty = valid. Hidden fields are skipped. */
export function validateAnswers(
  form: FieldDef[],
  answers: Answers,
  options?: AnswerOptions,
): Record<string, string> {
  const fields = expandRows(form, answers); // added table rows too
  const states = fieldStates(fields, answers);
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!states[f.key].visible) continue;
    const err = checkAnswer(f, answers[f.key], states[f.key].required, options, answers);
    if (err) errors[f.key] = err;
  }
  // Groups of boxes: how many are ticked, shown at the first visible member.
  const m: AnswerMessages = { ...DEFAULT_ANSWER_MESSAGES, ...options?.messages };
  for (const { group, members } of groupsOf(fields).values()) {
    const shown = members.filter((f) => states[f.key].visible);
    if (!shown.length || shown.some((f) => errors[f.key])) continue;
    const ticked = shown.filter((f) => answers[f.key] === true).length;
    const min = group.min ?? (group.required ? 1 : 0);
    let err: string | null = null;
    if (group.mode === 'single') {
      if (ticked > 1 || (group.required && ticked === 0)) err = m.groupOne;
    } else if (ticked < min && (ticked > 0 || group.required)) err = m.groupMin(min);
    else if (group.max != null && ticked > group.max) err = m.groupMax(group.max);
    if (err) errors[shown[0].key] = err;
  }
  return errors;
}

/** Keeps only answers of known fields, with the value type each field takes. */
export function cleanAnswers(form: FieldDef[], answers: unknown): Answers {
  const input = (answers && typeof answers === 'object' ? answers : {}) as Record<string, unknown>;
  const out: Answers = {};
  // How many rows each repeatable row has, then the answers of those rows too.
  for (const id of repeatIds(form)) if (rowCount(form, id, input) > 1) out[rowsKey(id)] = String(rowCount(form, id, input));
  const fields = expandRows(form, out);
  for (const f of fields) {
    // The person's photo size for a file field with several photos (perRowOf), 1–6.
    const per = Number(input[`${f.key}__per`]);
    if (f.type === 'file' && f.multiple && f.photosPerRow && per >= 1 && per <= 6) out[`${f.key}__per`] = String(Math.round(per));
    const v = input[f.key];
    if (v == null) continue;
    if (BOOLEAN_TYPES.includes(f.type)) out[f.key] = v === true;
    else if (typeof v === 'string') out[f.key] = v;
  }
  return out;
}
