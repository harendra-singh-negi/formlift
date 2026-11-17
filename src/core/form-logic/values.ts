// Answer values: how each type keeps its answer, and how people read it.

import { MULTI_TYPES, type AnswerValue, type FieldDef } from './model';

/** The chosen options of a multiselect / checklist answer ([] for anything else). */
export function multiValue(v: AnswerValue | undefined): string[] {
  if (typeof v !== 'string' || !v.startsWith('[')) return [];
  try {
    const a: unknown = JSON.parse(v);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
/** A multiselect / checklist answer from its chosen options (null when none: an empty answer). */
export const multiAnswer = (chosen: string[]): AnswerValue => (chosen.length ? JSON.stringify(chosen) : null);

/** A slider's range and step, and a rating's number of stars. */
export const rangeOf = (f: FieldDef) =>
  f.type === 'rating'
    ? { min: 1, max: Math.max(1, Math.round(f.max ?? 5)), step: 1 }
    : { min: f.min ?? 0, max: f.max ?? 100, step: f.step && f.step > 0 ? f.step : 1 };

/**
 * An answer as people read it: on the page, in lists and in the completed PDF. Multiple choices joined with ", ",
 * a currency amount with its symbol, a rating as "4 / 5", booleans as yesText / noText.
 */
export function answerText(f: FieldDef, v: AnswerValue | undefined, yesText = 'Yes', noText = 'No'): string {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? yesText : noText;
  if (MULTI_TYPES.includes(f.type)) return multiValue(v).join(', ');
  if (f.type === 'currency' && Number.isFinite(Number(v)))
    return `${f.currency ?? ''}${Number(v).toFixed(f.decimals ?? 2)}`;
  if (f.type === 'rating') return `${v} / ${rangeOf(f).max}`;
  if (f.type === 'datetime') return v.replace('T', ' ');
  return v;
}

export const isEmpty = (v: AnswerValue | undefined) => v == null || v === '' || v === false || v === '[]';
export const str = (v: AnswerValue | undefined) => (v == null ? '' : String(v));
