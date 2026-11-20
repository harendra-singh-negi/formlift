// The check of a form's fields before it is saved or published: shapes (the API gets them as JSON), unique keys,
// positions inside the page, options, regexes, condition references and circular conditions.

import { safeRegex } from './answers';
import { isGroup } from './conditions';
import { groupsOf } from './groups';
import { resolveLimits, type Limits } from './limits';
import { FIELD_TYPES, OPTION_TYPES, type Condition, type FieldDef } from './model';

/** What a field key may be: a letter, then letters, digits or _ (64 at most). */
export const KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function conditionKeys(c: Condition | undefined, into: Set<string>) {
  for (const r of c?.rules ?? []) {
    if (isGroup(r)) conditionKeys(r, into);
    else into.add(r.fieldKey);
  }
  return into;
}

export const inUnit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;


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
    if (OPTION_TYPES.includes(f.type) && !(Array.isArray(f.options) && f.options.length))
      errors.push(`${name}: needs at least one option`);
    if (f.pattern && !safeRegex(f.pattern)) errors.push(`${name}: regex is not valid`);
    if (f.rules != null && !(Array.isArray(f.rules) && f.rules.every((x) => typeof x === 'string')))
      errors.push(`${name}: rules must be a list of rule names`);
    for (const k of ['errorMessage', 'requiredMessage'] as const)
      if (f[k] != null && (typeof f[k] !== 'string' || f[k].length > 500)) errors.push(`${name}: ${k} must be text`);
    if (f.min != null && f.max != null && f.min > f.max) errors.push(`${name}: min is greater than max`);
    if (f.minLength != null && f.maxLength != null && f.minLength > f.maxLength)
      errors.push(`${name}: min length is greater than max length`);
    if (f.repeat != null) {
      const r = f.repeat;
      if (typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.row != null)
        errors.push(`${name}: repeatable row needs an id`);
      else if (r.max != null && !(Number.isInteger(r.max) && r.max >= 1)) errors.push(`${name}: most rows must be 1 or more`);
    }
    if (f.group != null) {
      const g = f.group;
      if (!['checkbox', 'toggle'].includes(f.type)) errors.push(`${name}: only checkboxes and toggles can be grouped`);
      if (typeof g.id !== 'string' || !g.id || (g.mode !== 'single' && g.mode !== 'multiple'))
        errors.push(`${name}: group needs an id and mode single or multiple`);
      if (g.min != null && g.max != null && g.min > g.max) errors.push(`${name}: group min is greater than max`);
    }
    if (f.followUp != null && !(Array.isArray(f.followUp.fields) && f.followUp.when && Array.isArray(f.followUp.when.rules)))
      errors.push(`${name}: follow-up needs a condition and a list of fields`);
  }
  if (errors.length) return errors;

  // Groups share settings; follow-ups ask existing dialog-only fields, each in one follow-up.
  for (const { group, members } of groupsOf(fields as FieldDef[]).values())
    if (members.some((x) => JSON.stringify(x.group) !== JSON.stringify(group)))
      errors.push(`Group "${group.id}": its members have different settings`);
  const byKey = new Map((fields as FieldDef[]).map((f) => [f.key, f]));
  const askedBy = new Map<string, string>();
  for (const f of fields as FieldDef[])
    for (const k of f.followUp?.fields ?? []) {
      const target = byKey.get(k);
      if (!target) errors.push(`Field "${f.label || f.key}": follow-up asks unknown field "${k}"`);
      else if (!target.dialogOnly) errors.push(`Field "${f.label || f.key}": follow-up field "${k}" must be dialog-only`);
      else if (askedBy.has(k)) errors.push(`Field "${k}" is asked by two follow-ups`);
      askedBy.set(k, f.key);
    }

  // Conditions may only point at other existing fields, and never in a circle (A depends on B depends on A).
  const deps = new Map<string, Set<string>>();
  for (const f of fields as FieldDef[]) {
    const refs = new Set<string>();
    for (const c of [f.visibleWhen, f.requiredWhen, f.readOnlyWhen]) conditionKeys(c, refs);
    // a follow-up's condition may use the field itself (answer "No" → ask why)
    for (const k of conditionKeys(f.followUp?.when, new Set()))
      if (!keys.has(k)) errors.push(`Field "${f.label || f.key}": follow-up uses unknown field "${k}"`);
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
