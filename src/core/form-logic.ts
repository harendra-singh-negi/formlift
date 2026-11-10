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

export const MAX_FIELDS = 5000;
export const MAX_SIGNATURE_CHARS = 300_000;
const MAX_TEXT = 10_000;
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
export function checkAnswer(f: FieldDef, v: AnswerValue | undefined, required: boolean): string | null {
  if (isEmpty(v)) return required ? `${f.label || f.key} is required` : null;
  if (f.type === 'checkbox') return typeof v === 'boolean' ? null : 'Must be checked or unchecked';
  if (typeof v !== 'string') return 'Invalid value';
  if (f.type === 'signature')
    return FILE_ID.test(v) || (v.startsWith('data:image/png;base64,') && v.length <= MAX_SIGNATURE_CHARS)
      ? null
      : 'Invalid signature';
  if (v.length > MAX_TEXT) return `At most ${MAX_TEXT} characters`;
  if (f.minLength != null && v.length < f.minLength) return `At least ${f.minLength} characters`;
  if (f.maxLength != null && v.length > f.maxLength) return `At most ${f.maxLength} characters`;
  switch (f.type) {
    case 'number': {
      const n = Number(v);
      if (v.trim() === '' || !Number.isFinite(n)) return 'Must be a number';
      if (f.min != null && n < f.min) return `Must be at least ${f.min}`;
      if (f.max != null && n > f.max) return `Must be at most ${f.max}`;
      break;
    }
    case 'date':
      if (!DATE.test(v) || Number.isNaN(Date.parse(v))) return 'Must be a date (YYYY-MM-DD)';
      break;
    case 'email':
      if (!EMAIL.test(v)) return 'Must be an email address';
      break;
    case 'phone':
      if (!PHONE.test(v)) return 'Must be a phone number';
      break;
    case 'dropdown':
    case 'radio':
      if (!(f.options ?? []).includes(v)) return 'Pick one of the options';
      break;
  }
  if (f.pattern && !safeRegex(f.pattern)?.test(v)) return 'Has the wrong format';
  return null;
}

/** Every problem with these answers, by field key. Empty = valid. Hidden fields are skipped. */
export function validateAnswers(fields: FieldDef[], answers: Answers): Record<string, string> {
  const states = fieldStates(fields, answers);
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!states[f.key].visible) continue;
    const err = checkAnswer(f, answers[f.key], states[f.key].required);
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
export function validateFields(fields: unknown, pageCount: number): string[] {
  if (!Array.isArray(fields)) return ['fields must be a list'];
  if (fields.length > MAX_FIELDS) return [`At most ${MAX_FIELDS} fields`];
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

export const MAX_PAGES = 1000;
export const MAX_ELEMENTS = 5000;
const COLOR = /^#[0-9a-f]{6}$/i;

/** The layout of an untouched document: every original page once, in order, nothing drawn. */
export const defaultLayout = (sizes: { width: number; height: number }[]): Layout => ({
  pages: sizes.map((s, i) => ({ source: i + 1, width: s.width, height: s.height })),
  elements: [],
});

/** Problems in a layout; empty = fine. `pageCount` = pages of the original PDF. */
export function validateLayout(layout: unknown, pageCount: number): string[] {
  const l = layout as Layout;
  if (!l || typeof l !== 'object' || !Array.isArray(l.pages) || !Array.isArray(l.elements))
    return ['layout must have pages and elements'];
  if (!l.pages.length) return ['The document needs at least one page'];
  if (l.pages.length > MAX_PAGES) return [`At most ${MAX_PAGES} pages`];
  if (l.elements.length > MAX_ELEMENTS) return [`At most ${MAX_ELEMENTS} text/box/line items`];
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
    if (e.text != null && (typeof e.text !== 'string' || e.text.length > 5000)) errors.push(`${name}: text too long`);
    if (e.replaces != null && (typeof e.replaces !== 'string' || e.replaces.length > 5000))
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
