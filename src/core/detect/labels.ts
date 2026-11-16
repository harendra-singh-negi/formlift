// What the text next to a box says: its label, cleaned up, and the field type that label asks for.

import type { FieldType } from '../form-logic'

// Labels that say little on their own ("Comments:" under an item); named after the item above them.
export const GENERIC = /^(comments?|remarks?|notes?|observations?|findings?)$/i
// The answers printed in place of boxes: "Yes/No/NA", "Y / N", "Pass | Fail", "OK/Not OK", "Satisfactory/Unsatisfactory".
const ANSWER = String.raw`(?:yes|no|n\.?\s?a\.?|y|n|ok|not ok|pass|fail|true|false|sat|unsat|satisfactory|unsatisfactory|good|fair|poor|done|not done|complied|not complied)`
export const PRINTED_CHOICES = new RegExp(String.raw`^\s*${ANSWER}(?:\s*[/|]\s*${ANSWER}){1,4}\s*$`, 'i')
// A list item: "-not working", "• HC", "a. …", "1) …", "A1. …".
export const LIST_ITEM = /^([-–•●▪◦*]|\(?(\d{1,2}|[a-z]|[A-Z]\d{1,2})[.)]\s)/
// A label is short; a long sentence next to a line is prose, not the line's name. One that ends in ":" is a
// label whatever its length (shortened).
export const cleanLabel = (s: string) => {
  const t = s
    .replace(/[:.\s_]+$/, '')
    .replace(/^[\s•▪\-–☐☑☒□]+/, '')
    .trim()
  if (t.length <= 60) return t
  return /:\s*$/.test(s) ? t.slice(0, 57).trimEnd() + '…' : ''
}

// The type a field's name suggests. Names are often "Row – Column" or "1.1.8 Date … – Comments": a "Comments"
// box takes text whatever its item asks; "From" / "To" mean dates only as a name of their own (a column), not as
// a word in a sentence ("Name of person to contact").
export function typeFor(label: string): FieldType {
  const parts = label.split(' – ').map(cleanLabel)
  if (parts.some((p) => GENERIC.test(p))) return 'text'
  if (/\bsign(ature)?\b/i.test(label)) return 'signature'
  if (/\bdates?\b|\bdob\b/i.test(label) || parts.some((p) => /^(from|to)$/i.test(p))) return 'date'
  if (/e-?mail/i.test(label)) return 'email'
  if (/phone|mobile|\btel\b|contact no/i.test(label)) return 'phone'
  return 'text'
}
