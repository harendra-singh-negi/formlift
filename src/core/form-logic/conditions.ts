// Conditions: AND / OR of rules on other fields' answers, and what they make of each field (visible, required,
// read-only) for a set of answers.

import type { Answers, Condition, FieldDef, Rule } from './model';
import { isEmpty, str } from './values';
import { expandRows } from './rows';

export const isGroup = (r: Rule | Condition): r is Condition => 'rules' in r;

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
export function fieldStates(form: FieldDef[], answers: Answers) {
  const fields = expandRows(form, answers); // added table rows too
  const states: Record<string, { visible: boolean; required: boolean; readOnly: boolean }> = {};
  // A follow-up's fields count only while it is open: its field shows (itself asked, when it is a follow-up's
  // question too) and its condition holds.
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const askers = new Map<string, FieldDef[]>();
  for (const t of fields) for (const k of t.followUp?.fields ?? []) askers.set(k, [...(askers.get(k) ?? []), t]);
  const shown = new Map<string, boolean>();
  const isShown = (f: FieldDef, path: Set<string>): boolean => {
    const known = shown.get(f.key);
    if (known !== undefined) return known;
    if (path.has(f.key)) return false; // a follow-up asking itself, through others: never open
    path.add(f.key);
    const own = !f.hidden && (!f.visibleWhen || evaluate(f.visibleWhen, answers));
    const by = askers.get(f.key);
    const asked = !by || by.some((t) => isShown(t, path) && evaluate(t.followUp!.when, answers));
    path.delete(f.key);
    shown.set(f.key, own && asked);
    return own && asked;
  };
  for (const f of fields) {
    const visible = isShown(byKey.get(f.key) ?? f, new Set());
    states[f.key] = {
      visible,
      required: visible && (!!f.required || (!!f.requiredWhen && evaluate(f.requiredWhen, answers))),
      readOnly: !!f.readOnly || (!!f.readOnlyWhen && evaluate(f.readOnlyWhen, answers)),
    };
  }
  return states;
}
