// pdf.js is loaded when the first document opens: it needs browser APIs (DOMMatrix) the moment it loads.
// The worker: whatever the app set (setPdfWorker or pdfjs GlobalWorkerOptions), else the matching build on a CDN.
export type PdfJs = typeof import('pdfjs-dist')

let workerSrc: string | undefined
let workerPort: Worker | undefined

/**
 * Where pdf.js loads its worker from. Call once before the first document opens, e.g. with Vite:
 * `setPdfWorker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href)`
 * or pass a Worker. Without it the worker comes from unpkg.com (same pdfjs-dist version).
 */
export function setPdfWorker(src: string | Worker) {
  if (typeof src === 'string') workerSrc = src
  else workerPort = src
}

let pdfjs: Promise<PdfJs> | null = null
export const loadPdfJs = () =>
  (pdfjs ??= import('pdfjs-dist').then((lib) => {
    const o = lib.GlobalWorkerOptions
    if (workerPort) o.workerPort = workerPort
    else if (workerSrc) o.workerSrc = workerSrc
    else if (!o.workerSrc && !o.workerPort)
      // ponytail: CDN fallback needs internet; self-host via setPdfWorker for offline / strict CSP.
      o.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`
    return lib
  }))
