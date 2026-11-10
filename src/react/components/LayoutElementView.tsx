import type { CSSProperties } from 'react'
import type { LayoutElement } from '../../core/form-logic'
import { boxStyle } from '../../core/coords'

// Same faces as the completed PDF (Helvetica / Times / Courier), so screen and export match.
const FAMILY = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace',
}

/** Points on a page `pageHeight` points tall, as a size that zooms with the page (cqh of the page overlay). */
const ptToCqh = (pt: number, pageHeight: number) => `${(pt / pageHeight) * 100}cqh`

/**
 * One of the admin's items drawn on its page: text (with optional background that hides the original under it),
 * box, or line. Purely visual; the editor wraps it for selecting and dragging.
 */
export default function LayoutElementView({
  element: e,
  pageHeight,
  className = '',
  style,
}: {
  element: LayoutElement
  pageHeight: number
  className?: string
  style?: CSSProperties
}) {
  const stroke = ptToCqh(e.strokeWidth ?? 1, pageHeight)
  const base: CSSProperties = { ...boxStyle({ page: e.page, ...e.position }), ...style }

  if (e.type === 'line')
    return (
      <svg className={`absolute overflow-visible ${className}`} style={base} aria-hidden>
        {/* A flat side is drawn at 0, so a horizontal / vertical line stays straight in a box given a minimum size. */}
        <line
          x1="0"
          y1="0"
          x2={e.position.width > 0 ? '100%' : '0'}
          y2={e.position.height > 0 ? '100%' : '0'}
          stroke={e.stroke ?? '#000000'}
          style={{ strokeWidth: stroke }}
        />
      </svg>
    )

  return (
    <div
      className={`absolute overflow-hidden whitespace-pre-wrap ${className}`}
      style={{
        ...base,
        background: e.fill,
        border: e.type === 'box' && e.stroke ? `${stroke} solid ${e.stroke}` : undefined,
        color: e.color ?? '#000000',
        fontFamily: FAMILY[e.font ?? 'sans'],
        fontSize: ptToCqh(e.fontSize ?? 10, pageHeight),
        fontWeight: e.bold ? 700 : 400,
        fontStyle: e.italic ? 'italic' : 'normal',
        textAlign: e.align ?? 'left',
        lineHeight: 1.2,
        wordBreak: 'break-word',
      }}
    >
      {e.type === 'text' ? e.text : null}
    </div>
  )
}
