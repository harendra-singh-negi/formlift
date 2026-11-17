// Repeatable table rows. The admin gives the fields of one table row the same `repeat.id`; the person adds copies
// of the row under it. Copy k (2, 3…) of a field is the same field with the key `<key>__<k>`, and the number of
// rows is the answer `<id>__rows`. Everything reading answers (states, checks, cleaning, the PDF, the filler) works
// on the fields expanded with the copies the answers ask for.
import type { Answers, FieldDef } from './model';

/** The answer holding how many rows a repeatable row has (a number as text; missing = 1). */
export const rowsKey = (id: string) => `${id}__rows`;

/** Rows of the repeatable row `id` (1 and up, within `max`) in these answers. */
export function rowCount(fields: FieldDef[], id: string, answers: Record<string, unknown>): number {
  const max = fields.find((f) => f.repeat?.id === id)?.repeat?.max;
  const n = Math.floor(Number(answers[rowsKey(id)]) || 1);
  return Math.max(1, max ? Math.min(n, max) : n);
}

/** Copy `k` of a field of a repeatable row: its own key, and its own box group (Yes / No per row). */
export const rowCopy = (f: FieldDef, k: number): FieldDef => ({
  ...f,
  id: `${f.id}__${k}`,
  key: `${f.key}__${k}`,
  label: f.label ? `${f.label} (${k})` : f.label,
  repeat: { ...f.repeat!, row: k },
  ...(f.group ? { group: { ...f.group, id: `${f.group.id}__${k}` } } : {}),
  followUp: undefined,
});

/**
 * The form's fields with the row copies these answers ask for, each row's copies right after its last field.
 * Fields already expanded are expanded again from their originals (safe to call twice).
 */
export function expandRows(fields: FieldDef[], answers: Record<string, unknown> = {}): FieldDef[] {
  if (!fields.some((f) => f.repeat)) return fields;
  const base = fields.filter((f) => !f.repeat?.row);
  const out: FieldDef[] = [];
  base.forEach((f, i) => {
    out.push(f);
    const id = f.repeat?.id;
    if (!id || base.slice(i + 1).some((x) => x.repeat?.id === id)) return; // not the row's last field yet
    const row = base.filter((x) => x.repeat?.id === id);
    for (let k = 2; k <= rowCount(base, id, answers); k++) out.push(...row.map((x) => rowCopy(x, k)));
  });
  return out;
}

/** The ids of the repeatable rows, in form order. */
export const repeatIds = (fields: FieldDef[]) => [...new Set(fields.flatMap((f) => (f.repeat ? [f.repeat.id] : [])))];

/** Answers with row `k` of `id` taken out: later rows move up one, the row count drops by one. */
export function removeRow(fields: FieldDef[], answers: Answers, id: string, k: number): Answers {
  const n = rowCount(fields, id, answers);
  if (n < 2 || k < 1 || k > n) return answers;
  const row = fields.filter((f) => f.repeat?.id === id && !f.repeat.row);
  const keyOf = (f: FieldDef, r: number) => (r === 1 ? f.key : `${f.key}__${r}`);
  const out: Answers = { ...answers, [rowsKey(id)]: String(n - 1) };
  for (const f of row) {
    for (let r = k; r < n; r++) {
      const v = answers[keyOf(f, r + 1)];
      if (v === undefined) delete out[keyOf(f, r)];
      else out[keyOf(f, r)] = v;
    }
    delete out[keyOf(f, n)];
  }
  return out;
}
