// The form model (fields, conditions, layout) and its checks. Pure TypeScript, no imports, so the SAME rules run
// in the browser (instant feedback) and on your server (the check that counts).

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
  /** dropdown / radio choices. */
  options?: string[];
  visibleWhen?: Condition;
  requiredWhen?: Condition;
  readOnlyWhen?: Condition;
}

/**
 * checkbox = boolean, file and signature = stored file id (dffuid; a signature is a PNG file), everything else =
 * string. Signatures saved before they were files are PNG data URLs: still read, turned into files on save.
 */
export type AnswerValue = string | boolean | null;
export type Answers = Record<string, AnswerValue>;

/**
 * Size limits the validators enforce. Every one has a default; pass your own (all or some) to
 * validateFields / validateLayout / validateAnswers / checkAnswer and to FormEditor / FormFiller's `limits`.
 * Use the same values in the browser and on your server.
 */
export interface Limits {
  /** Fields in one form. Default 5000. */
  maxFields: number
  /** Pages in a layout. Default 1000. */
  maxPages: number
  /** Text / box / line items in a layout. Default 5000. */
  maxElements: number
  /** Characters in one text answer. Default 10000. */
  maxAnswerLength: number
  /** Characters of a signature saved as a PNG data URL. Default 300000. */
  maxSignatureChars: number
  /** Characters in one layout text item. Default 5000. */
  maxElementText: number
}

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxFields: 5000,
  maxPages: 1000,
  maxElements: 5000,
  maxAnswerLength: 10_000,
  maxSignatureChars: 300_000,
  maxElementText: 5000,
});

/** The defaults with your overrides applied. */
export const resolveLimits = (limits?: Partial<Limits>): Limits => ({ ...DEFAULT_LIMITS, ...limits });

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
  /** Named rules that fields list in `rules`, e.g. { imo: { label: 'IMO number', check: (v) => ... } }. */
  rules?: Record<string, AnswerRule>;
  /**
   * Runs first, for every visible field. Return a message (error), null (valid: skip formlift's checks) or
   * undefined (formlift checks as usual).
   */
  validate?: (field: FieldDef, value: AnswerValue | undefined, answers: Answers) => string | null | undefined;
};

/** @deprecated Use DEFAULT_LIMITS.maxFields; pass `limits` to change it. */
export const MAX_FIELDS = DEFAULT_LIMITS.maxFields;
/** @deprecated Use DEFAULT_LIMITS.maxSignatureChars; pass `limits` to change it. */
export const MAX_SIGNATURE_CHARS = DEFAULT_LIMITS.maxSignatureChars;
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{6,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isGroup = (r: Rule | Condition): r is Condition => 'rules' in r;
const isEmpty = (v: AnswerValue | undefined) => v == null || v === '' || v === false;
const str = (v: AnswerValue | undefined) => (v == null ? '' : String(v));

function testRule(rule: Rule, answers: Answers): boolean {
  const v = answers[rule.fieldKey];
  const a = str(v).toLowerCase();
  const b = (rule.value ?? '').toLowerCase();
  const num = (s: string | undefined) => (s == null || s.trim() === '' ? NaN : Number(s));
  switch (rule.op) {
    case 'equals':
      return a === b;
    case 'notEquals':
      return a !== b;
    case 'contains':
      return a.includes(b);
    case 'startsWith':
      return a.startsWith(b);
    case 'endsWith':
      return a.endsWith(b);
    case 'greaterThan':
      return num(str(v)) > num(rule.value);
    case 'lessThan':
      return num(str(v)) < num(rule.value);
    case 'between':
      return num(str(v)) >= num(rule.value) && num(str(v)) <= num(rule.value2);
    case 'isEmpty':
      return isEmpty(v);
    case 'isNotEmpty':
      return !isEmpty(v);
  }
}

export function evaluate(cond: Condition | undefined, answers: Answers): boolean {
  if (!cond || !cond.rules.length) return true;
  const results = cond.rules.map((r) => (isGroup(r) ? evaluate(r, answers) : testRule(r, answers)));
  return cond.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
}

/** What the conditions make of each field for these answers. A field hidden by its condition is never required. */
export function fieldStates(fields: FieldDef[], answers: Answers) {
  const states: Record<string, { visible: boolean; required: boolean; readOnly: boolean }> = {};
  for (const f of fields) {
    const visible = !f.hidden && (!f.visibleWhen || evaluate(f.visibleWhen, answers));
    states[f.key] = {
      visible,
      required: visible && (!!f.required || (!!f.requiredWhen && evaluate(f.requiredWhen, answers))),
      readOnly: !!f.readOnly || (!!f.readOnlyWhen && evaluate(f.readOnlyWhen, answers)),
    };
  }
  return states;
}

/** Answers to start a new submission with: each field's default value. */
export function defaultAnswers(fields: FieldDef[]): Answers {
  const out: Answers = {};
  for (const f of fields) {
    if (f.defaultValue == null || f.defaultValue === '') continue;
    out[f.key] = f.type === 'checkbox' ? f.defaultValue === 'true' : f.defaultValue;
  }
  return out;
}

function safeRegex(pattern: string): RegExp | null {
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
  if (f.type === 'checkbox') return typeof v === 'boolean' ? null : m.checkbox;
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
  }
  if (f.pattern && !safeRegex(f.pattern)?.test(v)) return m.pattern;
  return null;
}

/** Every problem with these answers, by field key. Empty = valid. Hidden fields are skipped. */
export function validateAnswers(
  fields: FieldDef[],
  answers: Answers,
  options?: AnswerOptions,
): Record<string, string> {
  const states = fieldStates(fields, answers);
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!states[f.key].visible) continue;
    const err = checkAnswer(f, answers[f.key], states[f.key].required, options, answers);
    if (err) errors[f.key] = err;
  }
  return errors;
}

/** Keeps only answers of known fields, with the value type each field takes. */
export function cleanAnswers(fields: FieldDef[], answers: unknown): Answers {
  const input = (answers && typeof answers === 'object' ? answers : {}) as Record<string, unknown>;
  const out: Answers = {};
  for (const f of fields) {
    const v = input[f.key];
    if (v == null) continue;
    if (f.type === 'checkbox') out[f.key] = v === true;
    else if (typeof v === 'string') out[f.key] = v;
  }
  return out;
}

function conditionKeys(c: Condition | undefined, into: Set<string>) {
  for (const r of c?.rules ?? []) {
    if (isGroup(r)) conditionKeys(r, into);
    else into.add(r.fieldKey);
  }
  return into;
}

const inUnit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

/**
 * Problems in a field mapping; empty = it can be saved / published. Checks shapes (the API gets it as JSON),
 * unique keys, positions inside the page, options, regexes, condition references and circular conditions.
 */
export function validateFields(fields: unknown, pageCount: number, limits?: Partial<Limits>): string[] {
  const { maxFields } = resolveLimits(limits);
  if (!Array.isArray(fields)) return ['fields must be a list'];
  if (fields.length > maxFields) return [`At most ${maxFields} fields`];
  const errors: string[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const f of fields as FieldDef[]) {
    const name = `Field "${f?.label || f?.key || '?'}"`;
    if (!f || typeof f !== 'object') {
      errors.push('Every field must be an object');
      continue;
    }
    if (typeof f.id !== 'string' || !f.id || ids.has(f.id)) errors.push(`${name}: missing or duplicate id`);
    ids.add(f.id);
    if (typeof f.key !== 'string' || !KEY.test(f.key))
      errors.push(`${name}: key must start with a letter and use letters, digits or _`);
    else if (keys.has(f.key)) errors.push(`${name}: key "${f.key}" is used twice`);
    keys.add(f.key);
    if (!FIELD_TYPES.includes(f.type)) errors.push(`${name}: unknown type`);
    if (typeof f.label !== 'string' || f.label.length > 255) errors.push(`${name}: label must be text`);
    if (f.source !== 'manual' && f.source !== 'ai') errors.push(`${name}: source must be manual or ai`);
    const p = f.position;
    if (
      !p ||
      !Number.isInteger(p.page) ||
      p.page < 1 ||
      p.page > pageCount ||
      ![p.x, p.y, p.width, p.height].every(inUnit) ||
      p.x + p.width > 1.0001 ||
      p.y + p.height > 1.0001 ||
      p.width <= 0 ||
      p.height <= 0
    )
      errors.push(`${name}: position must lie inside a page of the document`);
    if ((f.type === 'dropdown' || f.type === 'radio') && !(Array.isArray(f.options) && f.options.length))
      errors.push(`${name}: needs at least one option`);
    if (f.pattern && !safeRegex(f.pattern)) errors.push(`${name}: regex is not valid`);
    if (f.rules != null && !(Array.isArray(f.rules) && f.rules.every((x) => typeof x === 'string')))
      errors.push(`${name}: rules must be a list of rule names`);
    for (const k of ['errorMessage', 'requiredMessage'] as const)
      if (f[k] != null && (typeof f[k] !== 'string' || f[k].length > 500)) errors.push(`${name}: ${k} must be text`);
    if (f.min != null && f.max != null && f.min > f.max) errors.push(`${name}: min is greater than max`);
    if (f.minLength != null && f.maxLength != null && f.minLength > f.maxLength)
      errors.push(`${name}: min length is greater than max length`);
  }
  if (errors.length) return errors;

  // Conditions may only point at other existing fields, and never in a circle (A depends on B depends on A).
  const deps = new Map<string, Set<string>>();
  for (const f of fields as FieldDef[]) {
    const refs = new Set<string>();
    for (const c of [f.visibleWhen, f.requiredWhen, f.readOnlyWhen]) conditionKeys(c, refs);
    for (const k of refs) {
      if (!keys.has(k)) errors.push(`Field "${f.label || f.key}": condition uses unknown field "${k}"`);
      if (k === f.key) errors.push(`Field "${f.label || f.key}": condition uses the field itself`);
    }
    deps.set(f.key, refs);
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (k: string, path: string[]): string | null => {
    if (state.get(k) === 'done') return null;
    if (state.get(k) === 'visiting') return [...path, k].join(' → ');
    state.set(k, 'visiting');
    for (const d of deps.get(k) ?? []) {
      const cycle = visit(d, [...path, k]);
      if (cycle) return cycle;
    }
    state.set(k, 'done');
    return null;
  };
  for (const k of deps.keys()) {
    const cycle = visit(k, []);
    if (cycle) {
      errors.push(`Circular condition: ${cycle}`);
      break;
    }
  }
  return errors;
}

// ---------- layout: pages and the admin's own content on them ----------
// The original PDF is never changed. A version's layout says which pages are shown in which order (original
// pages and blank ones), and what the admin drew on them: text (new, or replacing a line of the original),
// boxes and lines. Positions are page fractions like fields; sizes in points (1/72 inch) of the page.

/** `source` = page number in the original PDF, null = blank page. width / height in points. */
export interface LayoutPage {
  source: number | null;
  width: number;
  height: number;
}

export const FONTS = ['sans', 'serif', 'mono'] as const;
export type FontName = (typeof FONTS)[number];

export interface LayoutElement {
  id: string;
  type: 'text' | 'box' | 'line';
  page: number; // 1-based, in layout.pages
  position: Omit<Position, 'page'>;
  /** text */
  text?: string;
  fontSize?: number; // points
  font?: FontName;
  bold?: boolean;
  italic?: boolean;
  color?: string; // #rrggbb
  align?: 'left' | 'center' | 'right';
  /** Background (text, box). '#ffffff' covers what the original shows there. */
  fill?: string;
  /** Border (box) or the line itself. */
  stroke?: string;
  strokeWidth?: number; // points
  /** The original line this text replaces (kept for reference). */
  replaces?: string;
}

export interface Layout {
  pages: LayoutPage[];
  elements: LayoutElement[];
}

/** @deprecated Use DEFAULT_LIMITS.maxPages; pass `limits` to change it. */
export const MAX_PAGES = DEFAULT_LIMITS.maxPages;
/** @deprecated Use DEFAULT_LIMITS.maxElements; pass `limits` to change it. */
export const MAX_ELEMENTS = DEFAULT_LIMITS.maxElements;
const COLOR = /^#[0-9a-f]{6}$/i;

/** The layout of an untouched document: every original page once, in order, nothing drawn. */
export const defaultLayout = (sizes: { width: number; height: number }[]): Layout => ({
  pages: sizes.map((s, i) => ({ source: i + 1, width: s.width, height: s.height })),
  elements: [],
});

/** Problems in a layout; empty = fine. `pageCount` = pages of the original PDF. */
export function validateLayout(layout: unknown, pageCount: number, limits?: Partial<Limits>): string[] {
  const { maxPages, maxElements, maxElementText } = resolveLimits(limits);
  const l = layout as Layout;
  if (!l || typeof l !== 'object' || !Array.isArray(l.pages) || !Array.isArray(l.elements))
    return ['layout must have pages and elements'];
  if (!l.pages.length) return ['The document needs at least one page'];
  if (l.pages.length > maxPages) return [`At most ${maxPages} pages`];
  if (l.elements.length > maxElements) return [`At most ${maxElements} text/box/line items`];
  const errors: string[] = [];
  l.pages.forEach((p, i) => {
    const okSource = p?.source === null || (Number.isInteger(p?.source) && p.source! >= 1 && p.source! <= pageCount);
    const okSize = [p?.width, p?.height].every((n) => typeof n === 'number' && n >= 72 && n <= 5000);
    if (!okSource || !okSize) errors.push(`Page ${i + 1}: invalid source page or size`);
  });
  const ids = new Set<string>();
  for (const e of l.elements) {
    const name = `Item on page ${e?.page ?? '?'}`;
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || ids.has(e.id)) {
      errors.push(`${name}: missing or duplicate id`);
      continue;
    }
    ids.add(e.id);
    if (!['text', 'box', 'line'].includes(e.type)) errors.push(`${name}: unknown type`);
    if (!Number.isInteger(e.page) || e.page < 1 || e.page > l.pages.length) errors.push(`${name}: page does not exist`);
    const p = e.position;
    if (!p || ![p.x, p.y, p.width, p.height].every(inUnit) || p.x + p.width > 1.0001 || p.y + p.height > 1.0001)
      errors.push(`${name}: position must lie inside the page`);
    if (e.text != null && (typeof e.text !== 'string' || e.text.length > maxElementText)) errors.push(`${name}: text too long`);
    if (e.replaces != null && (typeof e.replaces !== 'string' || e.replaces.length > maxElementText))
      errors.push(`${name}: invalid original text`);
    if (e.fontSize != null && !(typeof e.fontSize === 'number' && e.fontSize >= 3 && e.fontSize <= 144))
      errors.push(`${name}: font size must be 3–144`);
    if (e.strokeWidth != null && !(typeof e.strokeWidth === 'number' && e.strokeWidth >= 0 && e.strokeWidth <= 20))
      errors.push(`${name}: line width must be 0–20`);
    if (e.font != null && !FONTS.includes(e.font)) errors.push(`${name}: unknown font`);
    if (e.align != null && !['left', 'center', 'right'].includes(e.align)) errors.push(`${name}: unknown alignment`);
    for (const c of [e.color, e.fill, e.stroke])
      if (c != null && !COLOR.test(c)) errors.push(`${name}: colours must be #rrggbb`);
  }
  return errors.slice(0, 20);
}
