// Groups of boxes (Y / N / NA: one answer, or several) and follow-up questions that a change opens.

import { evaluate } from './conditions';
import type { Answers, AnswerValue, FieldDef, FieldGroup } from './model';

/** Groups of boxes by id: their members (form order) and settings (the first member's). */
export function groupsOf(fields: FieldDef[]): Map<string, { group: FieldGroup; members: FieldDef[] }> {
  const out = new Map<string, { group: FieldGroup; members: FieldDef[] }>();
  for (const f of fields) {
    if (!f.group?.id) continue;
    const g = out.get(f.group.id);
    if (g) g.members.push(f);
    else out.set(f.group.id, { group: f.group, members: [f] });
  }
  return out;
}

/**
 * The answers after setting one field: what every UI should use instead of `{ ...answers, [key]: v }`. Ticking a
 * box of a 'single' group unticks the other members.
 */
export function applyAnswer(fields: FieldDef[], answers: Answers, field: FieldDef, value: AnswerValue): Answers {
  const next: Answers = { ...answers, [field.key]: value };
  if (value === true && field.group?.mode === 'single')
    for (const m of fields) if (m.group?.id === field.group.id && m.key !== field.key && next[m.key] === true) next[m.key] = false;
  return next;
}

/** The follow-ups that `before` → `after` opened: fields whose followUp condition just turned true. */
export function openedFollowUps(fields: FieldDef[], before: Answers, after: Answers): FieldDef[] {
  return fields.filter((f) => f.followUp && !evaluate(f.followUp.when, before) && evaluate(f.followUp.when, after));
}
