// Comments people leave on a field, kept apart from the answers.

import { resolveLimits, type Limits } from './limits';
import type { Comments, FieldComment, FieldDef } from './model';

/**
 * Comments kept to the fields that take them, each a short text with a time: what to store on your server
 * (comments come from the browser, like answers).
 */
export function cleanComments(fields: FieldDef[], comments: unknown, limits?: Partial<Limits>): Comments {
  const { maxComments, maxAnswerLength } = resolveLimits(limits);
  const input = (comments && typeof comments === 'object' ? comments : {}) as Record<string, unknown>;
  const out: Comments = {};
  for (const f of fields) {
    const list = input[f.key];
    if (!f.comments || !Array.isArray(list)) continue;
    const kept = list
      .filter(
        (c): c is FieldComment =>
          !!c &&
          typeof c === 'object' &&
          typeof c.id === 'string' &&
          typeof c.text === 'string' &&
          c.text.trim() !== '' &&
          c.text.length <= maxAnswerLength &&
          typeof c.at === 'string' &&
          (c.by == null || typeof c.by === 'string'),
      )
      .slice(-maxComments)
      .map(({ id, text, by, at }) => (by == null ? { id, text, at } : { id, text, by, at }));
    if (kept.length) out[f.key] = kept;
  }
  return out;
}
