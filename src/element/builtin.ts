// What makes formlift/element work with no setup in the app: its CSS and pdf.js's worker are built into the
// package (tsup `define`), so there is no stylesheet to register and no worker file to copy as an asset.

declare const __FORMLIFT_CSS__: string
declare const __FORMLIFT_PDF_WORKER__: string

/**
 * Adds formlift's CSS once to the document (or the shadow root `el` is in), unless the app loaded
 * 'formlift/style.css' itself. App CSS keeps winning: theme variables, overrides.
 */
export function ensureStyles(el: HTMLElement) {
  if (typeof __FORMLIFT_CSS__ !== 'string') return // tests: no built CSS
  const root = el.getRootNode()
  const into = root instanceof ShadowRoot ? root : document.head
  if (into.querySelector('style[data-formlift]')) return
  // Already there (the app imports formlift/style.css)? A formlift utility works on a probe. Not a theme variable:
  // those inherit, so an app that themes :root would look "loaded" without the stylesheet.
  const probe = document.createElement('div')
  probe.className = 'fl-root bg-primary-soft'
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;--fl-primary-soft:rgb(1, 2, 3)'
  el.appendChild(probe)
  const loaded = getComputedStyle(probe).backgroundColor === 'rgb(1, 2, 3)'
  probe.remove()
  if (loaded) return
  const style = document.createElement('style')
  style.dataset.formlift = ''
  style.textContent = __FORMLIFT_CSS__
  into.prepend(style)
}

/** pdf.js's legacy worker as a module worker from a blob URL (needs `worker-src blob:` under a strict CSP). */
export async function builtinWorker(): Promise<Worker | undefined> {
  const code = (await import('./worker-code')).default
  if (!code) return undefined
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  return new Worker(url, { type: 'module' })
}
