import { useEffect, useState } from 'react'
import { BASE_SCALE, ZOOMS } from '../constants'

// PdfPages pads the pages by 16 px on each side.
const PADDING = 32

/**
 * Zoom that fits a page `pageWidthPt` points wide into the scroll panel (a big screen gets a big page, up to the
 * highest zoom), following the
 * panel's size (phone, tablet, a resized window) until the user picks a zoom. Pass `ref` to the scroll panel.
 */
export function useFitZoom(pageWidthPt: number) {
  const [el, ref] = useState<HTMLElement | null>(null)
  const [fit, setFit] = useState(1)
  const [chosen, setZoom] = useState<number | null>(null)
  useEffect(() => {
    if (!el) return
    const measure = () => {
      const room = el.clientWidth - PADDING
      if (room > 0) setFit(Math.min(ZOOMS[ZOOMS.length - 1], Math.max(0.3, room / (pageWidthPt * BASE_SCALE))))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [el, pageWidthPt])
  return { zoom: chosen ?? fit, setZoom, ref }
}

/** Small screen or touch: answers are typed in a full-size box instead of on the page. */
export function useCompact() {
  const query = '(max-width: 767px), (pointer: coarse)'
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  const [compact, setCompact] = useState(get)
  useEffect(() => {
    const m = window.matchMedia?.(query)
    if (!m) return
    const on = () => setCompact(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return compact
}
