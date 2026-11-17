// The form as a list of questions (the List view): fields on one line of the document that belong together —
// "2.1.1 Were the Manager… – Y / N / NA" and the Remarks box beside them — become one question, so it can be
// searched and filtered as a whole. Grids of boxes and tables are one question each, laid out in the document's
// rows and columns. Titles are the document's own text when the page text is given.
//   group.ts     toQuestions: fields grouped into questions
//   titles.ts    titles from the document's text
//   sections.ts  categories, sections and tags
//   scales.ts    questions answered on one scale
//   answers.ts   a question's choices and what is picked
//   question.ts  what a question is, and the helpers every step uses

export { type PageText, type Question } from './question'
export { choicesOf, isFilled, pickedOf } from './answers'
export { toQuestions, type ToQuestionsOptions } from './group'
