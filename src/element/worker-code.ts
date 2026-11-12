// pdf.js's legacy worker as text, put in at build time (a lazy chunk: loaded with the first document).
declare const __FORMLIFT_PDF_WORKER__: string
export default typeof __FORMLIFT_PDF_WORKER__ === 'string' ? __FORMLIFT_PDF_WORKER__ : ''
