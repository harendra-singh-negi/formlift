import { useEffect, type RefObject } from 'react'

/**
 * Calls onClose on a mousedown outside `ref` or on Escape, while `open`. For dropdowns and menus.
 * composedPath(), not e.target: inside a shadow root a document listener sees e.target as the
 * shadow host, so every click (even on the dropdown's own checkbox) would look "outside".
 */
export function useOutsideClose(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => (ref.current && e.composedPath().includes(ref.current)) || onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, onClose])
}
