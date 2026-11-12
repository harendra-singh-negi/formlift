import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LayoutPage } from '../../core/form-logic'
import { toLines, type PdfTextItem, type TextLine } from '../../core/layout'
import { loadPdfJs } from '../pdfjs'
import { BASE_SCALE } from '../constants'
import { useLabels } from '../labels'

/** A PDF: URL, Blob / File, bytes, or a (possibly async) function returning one of those. */
export type PdfBytes = string | URL | Blob | ArrayBuffer | Uint8Array
export type PdfSource = PdfBytes | (() => PdfBytes | Promise<PdfBytes>)

export async function readPdf(src: PdfSource): Promise<ArrayBuffer | Uint8Array> {
  const v = typeof src === 'function' ? await src() : src
  if (typeof v === 'string' || v instanceof URL) {
    const res = await fetch(v)
    if (!res.ok) throw new Error(`Could not load the PDF (${res.status})`)
    return res.arrayBuffer()
  }
  // A copy: pdf.js hands the buffer to its worker, which would empty the caller's array.
  return v instanceof Blob ? v.arrayBuffer() : (v instanceof ArrayBuffer ? new Uint8Array(v) : v).slice()
}

export interface PageSize {
  width: number
  height: number
}

/**
 * The document, page under page: original PDF pages exactly as pdf.js draws them, and blank pages, in the order
 * of `pages` (the version's layout; omitted = the original pages in order). Pages are drawn when they scroll into
 * view and again after a zoom. `overlay(page)` is laid over each page in a box of the page's size: children
 * placed with percentage positions (utils/coords.ts boxStyle) stay on their spot at every zoom, and font sizes in
 * `cqh` scale with the page. With `withText`, overlay also gets the original text lines of the page.
 */
export default function PdfPages({
  load,
  zoom,
  pages,
  overlay,
  withText,
  onLoaded,
  onError,
}: {
  /** The PDF: a URL, its bytes, or a function returning either. Read once per mount. */
  load: PdfSource
  zoom: number
  pages?: LayoutPage[] | null
  overlay?: (page: number, lines: TextLine[] | undefined) => ReactNode
  withText?: boolean
  /** Sizes (points) of the original pages and the open document, once the PDF is open. */
  onLoaded?: (sizes: PageSize[], pdf: PDFDocumentProxy) => void
  onError?: (err: unknown) => void
}) {
  const L = useLabels()
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<PageSize[]>([])
  const loadRef = useRef(load)
  const callbacks = useRef({ onLoaded, onError })
  useEffect(() => {
    callbacks.current = { onLoaded, onError }
  })

  useEffect(() => {
    let live = true
    let opened: PDFDocumentProxy | null = null
    Promise.all([loadPdfJs(), readPdf(loadRef.current)])
      // isEvalSupported off (pdf.js < 5.5; newer never evals): pdf.js never compiles code from the document (fonts).
      .then(([lib, data]) => lib.getDocument({ data, ...({ isEvalSupported: false } as object) }).promise)
      .then(async (pdf) => {
        opened = pdf
        const list: PageSize[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const vp = (await pdf.getPage(i)).getViewport({ scale: 1 })
          list.push({ width: vp.width, height: vp.height })
        }
        if (!live) return
        setSizes(list)
        setDoc(pdf)
        callbacks.current.onLoaded?.(list, pdf)
      })
      .catch((err) => live && callbacks.current.onError?.(err))
    return () => {
      live = false
      void opened?.destroy()
    }
  }, [])

  if (!doc) return <p className="p-6 text-center text-[13px] text-muted">{L.loadingDocument}</p>
  const shown: LayoutPage[] = pages ?? sizes.map((s, i) => ({ source: i + 1, ...s }))
  return (
    // min-w-full + w-max: centred when narrower than the panel, fully scrollable (left edge too) when wider.
    <div className="flex w-max min-w-full flex-col gap-4 p-4">
      {shown.map((p, i) => (
        <PdfPage
          key={i}
          doc={doc}
          pageNo={i + 1}
          source={p.source}
          size={p.source ? (sizes[p.source - 1] ?? p) : p}
          zoom={zoom}
          withText={withText}
          overlay={overlay}
        />
      ))}
    </div>
  )
}

function PdfPage({
  doc,
  pageNo,
  source,
  size,
  zoom,
  withText,
  overlay,
}: {
  doc: PDFDocumentProxy
  pageNo: number
  source: number | null
  size: PageSize
  zoom: number
  withText?: boolean
  overlay?: (page: number, lines: TextLine[] | undefined) => ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [lines, setLines] = useState<{ source: number; lines: TextLine[] } | null>(null)
  const width = size.width * BASE_SCALE * zoom
  const height = size.height * BASE_SCALE * zoom

  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return setVisible(true)
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !source || !canvas.current) return
    let task: RenderTask | null = null
    let live = true
    const el = canvas.current
    void doc.getPage(source).then((page) => {
      if (!live) return
      const ratio = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: BASE_SCALE * zoom * ratio })
      el.width = Math.floor(viewport.width)
      el.height = Math.floor(viewport.height)
      task = page.render({ canvas: el, viewport })
      task.promise.catch(() => {}) // cancelled by a newer zoom
    })
    return () => {
      live = false
      task?.cancel()
    }
  }, [doc, source, visible, zoom])

  // The original's text lines, read once per page when asked for (Edit text).
  useEffect(() => {
    if (!withText || !visible || !source || lines?.source === source) return
    let live = true
    void doc
      .getPage(source)
      .then(async (page) => {
        const content = await page.getTextContent()
        // Real font names (for bold / italic) are known once the page's fonts are loaded by drawing it.
        const fontOf = (id: string) => {
          try {
            return page.commonObjs.has(id) ? (page.commonObjs.get(id) as { name?: string })?.name : undefined
          } catch {
            return undefined
          }
        }
        if (live) setLines({ source, lines: toLines(content.items as PdfTextItem[], page.view, fontOf) })
      })
      .catch(() => live && setLines({ source, lines: [] }))
    return () => {
      live = false
    }
  }, [doc, source, visible, withText, lines])

  return (
    <div
      ref={box}
      data-page={pageNo}
      className="relative mx-auto flex-none bg-white shadow-[0_1px_6px_rgba(15,23,42,0.18)]"
      style={{ width, height }}
    >
      {source && <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Page ${pageNo}`} />}
      <div className="absolute inset-0 [container-type:size]">
        {overlay?.(pageNo, withText && lines?.source === source ? lines.lines : undefined)}
      </div>
    </div>
  )
}
