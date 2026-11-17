// The document as a flow, for the list view: each page's text with its look (bold, italic, underline, colour,
// highlight, size), its tables (ruled cells and shaded bars, with their fill), its pictures and the form's fields
// where they sit, in reading order. Drawn as plain HTML it reads like the PDF and reflows on any screen.
// Everything comes from pdf.js (getTextContent, and the operator list through extractShapes): no AI, no server.
//   read.ts        readPage: a page's text runs, cells, shaded boxes and pictures
//   page.ts        pageFlow: a page as blocks in reading order
//   pieces.ts      the items of a line, and list markers and blanks
//   paragraphs.ts  lines into paragraphs, and lines laid out by position
//   segments.ts    the flow's text, and its segments by question
//   types.ts       the flow's shapes

export { type FlowBlock, type FlowCell, type FlowImage, type FlowPara, type FlowPart, type FlowRun, type FlowSegment, type PageRead } from './types'
export { readPage } from './read'
export { pageFlow } from './page'
export { flowSegments, flowText } from './segments'
