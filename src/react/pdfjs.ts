// pdf.js is loaded when the first document opens: it needs browser APIs (DOMMatrix) the moment it loads.
// The worker: whatever the app set (setPdfWorker or pdfjs GlobalWorkerOptions), else the matching build on a CDN.
//
// pdf.js 5's modern build calls Promise.try (Chrome 128+, Firefox 134+, Safari 18.2+) in both the page and the
// worker; elsewhere every document stops loading partway ("Promise.try is not a function"). formlift uses the
// legacy build, which pdf.js ships with those polyfills, and its worker matches.
export type PdfJs = typeof import('pdfjs-dist')

let workerSrc: string | undefined
let workerPort: Worker | undefined

/**
 * Where pdf.js loads its worker from. Call once before the first document opens, e.g. with Vite:
 * `setPdfWorker(new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href)`
 * or pass a Worker. Use the legacy worker (as formlift does for the page) so older browsers work too.
 * Without it the worker comes from unpkg.com (same pdfjs-dist version).
 */
export function setPdfWorker(src: string | Worker) {
  if (typeof src === 'string') workerSrc = src
  else workerPort = src
}

// formlift/element brings its own worker (same pdf.js version, no asset to copy): used when the app set none.
let builtinWorker: (() => Promise<Worker | undefined>) | undefined
/** @internal formlift/element's own worker. */
export function setBuiltinPdfWorker(make: () => Promise<Worker | undefined>) {
  builtinWorker = make
}

const hasPromiseTry = () => typeof (Promise as { try?: unknown }).try === 'function'

let pdfjs: Promise<PdfJs> | null = null
export const loadPdfJs = () =>
  (pdfjs ??= (import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJs>).then(async (lib) => {
    const o = lib.GlobalWorkerOptions
    if (workerPort) o.workerPort = workerPort
    else if (workerSrc) o.workerSrc = workerSrc
    else if (!o.workerSrc && !o.workerPort && builtinWorker) o.workerPort = (await builtinWorker()) ?? null
    if (!o.workerSrc && !o.workerPort)
      // ponytail: CDN fallback needs internet; self-host via setPdfWorker for offline / strict CSP.
      o.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version}/legacy/build/pdf.worker.min.mjs`
    if (!hasPromiseTry() && typeof o.workerSrc === 'string' && !o.workerSrc.includes('legacy'))
      console.warn(
        `formlift: this browser lacks Promise.try, which the modern pdf.js worker (${o.workerSrc}) needs: documents ` +
          'will stop loading. Point setPdfWorker at pdfjs-dist/legacy/build/pdf.worker.min.mjs.',
      )
    return lib
  }))
