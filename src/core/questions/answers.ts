// A question's answer choices and which of them are picked: what the List view and its filters show.

import type { Answers, AnswerValue } from '../form-logic'
import type { Question } from './question'

export const isFilled = (v: AnswerValue | undefined) => v != null && v !== '' && v !== false

// The boxes that are a question's answer choices: its option grid, else its boxes ("Y / N / NA" on one line, or
// a lone "☐ Human").
export function choiceParts(q: Question) {
  if (q.columns) return []
  const size = q.rows?.reduce((a, b) => a + b, 0) ?? 0
  const boxes = (q.rows ? q.parts.slice(0, size) : q.parts).filter((p) => p.field.type === 'checkbox')
  return boxes
}
export const radioOf = (q: Question) => q.parts.find((p) => p.field.type === 'radio' && p.field.options?.length)?.field

/** A question's answer choices ("Yes", "No", "NA"), from its boxes or its radio buttons. */
export function choicesOf(q: Question): string[] {
  const boxes = choiceParts(q)
  if (boxes.length) return boxes.map((p) => (p.name || p.field.label).trim())
  return radioOf(q)?.options ?? []
}

/** The choices ticked in a question's answers. */
export function pickedOf(q: Question, answers: Answers): string[] {
  const boxes = choiceParts(q)
  if (boxes.length)
    return boxes.filter((p) => answers[p.field.key] === true).map((p) => (p.name || p.field.label).trim())
  const radio = radioOf(q)
  const v = radio && answers[radio.key]
  return typeof v === 'string' && v ? [v] : []
}
