// Conditions and follow-up questions point at fields by key. A lesson names those fields p<page>_<field> instead
// (they get new keys in every form), and detection points them back at the fields they were set up with.

import type { Condition, FieldDef, Rule } from '../form-logic'
import { CONDITIONS } from './lesson'

// The fields a condition or follow-up uses.
function keysIn(c: Condition | undefined, into: string[] = []) {
  for (const r of c?.rules ?? []) {
    if ('rules' in r) keysIn(r, into)
    else into.push(r.fieldKey)
  }
  return into
}
export const usedBy = (f: FieldDef) => [
  ...CONDITIONS.flatMap((k) => keysIn(f[k])),
  ...keysIn(f.followUp?.when),
  ...(f.followUp?.fields ?? []),
]
/** `c` with its fields renamed by `to`; undefined when one has no new name. */
export function renamed(c: Condition, to: (key: string) => string | undefined): Condition | undefined {
  const rules: (Rule | Condition)[] = []
  for (const r of c.rules) {
    const x = 'rules' in r ? renamed(r, to) : to(r.fieldKey) && { ...r, fieldKey: to(r.fieldKey)! }
    if (!x) return
    rules.push(x)
  }
  return { ...c, rules }
}
