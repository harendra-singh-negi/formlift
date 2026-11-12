import { useEffect, useRef, type RefObject } from 'react'

// Open layers (dialogs, popovers, dropdowns), newest last. Escape closes only the newest one, so a dropdown inside
// a dialog closes alone, and keys never reach the editor behind an open layer.
const layers: { close: () => void }[] = []

if (typeof document !== 'undefined')
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !layers.length) return
      e.stopPropagation()
      e.preventDefault()
      layers[layers.length - 1].close()
    },
    true, // capture: before anything else on the page sees it
  )

/** Is a dialog, popover or dropdown open (keyboard shortcuts of the page behind should wait)? */
export const layerOpen = () => layers.length > 0

/** While `open`, this layer is on the stack: Escape closes it when it is the newest. */
export function useEscapeLayer(open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const layer = { close: () => close.current() }
    layers.push(layer)
    return () => {
      const i = layers.indexOf(layer)
      if (i >= 0) layers.splice(i, 1)
    }
  }, [open])
}

/**
 * Calls onClose on a mousedown outside `ref` or on Escape, while `open`. For dropdowns and menus.
 * composedPath(), not e.target: inside a shadow root a document listener sees e.target as the
 * shadow host, so every click (even on the dropdown's own checkbox) would look "outside".
 */
export function useOutsideClose(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEscapeLayer(open, onClose)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => (ref.current && e.composedPath().includes(ref.current)) || onClose()
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [ref, open, onClose])
}
