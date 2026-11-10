import { useRef, useState } from 'react'
import Button from './Button'

/**
 * Draw a signature with mouse, pen or finger. onSave gets a PNG data URL (transparent background).
 * Scaled down to at most `maxWidth` pixels wide so it stays small enough to send.
 */
export default function SignaturePad({
  onSave,
  onCancel,
  maxWidth = 600,
}: {
  onSave: (dataUrl: string) => void
  onCancel: () => void
  maxWidth?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * e.currentTarget.width,
      y: ((e.clientY - r.top) / r.height) * e.currentTarget.height,
    }
  }
  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = point(e)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f2540'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    setEmpty(false)
  }
  const clear = () => {
    const c = canvas.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setEmpty(true)
  }
  const save = () => {
    const c = canvas.current
    if (!c) return
    const scale = Math.min(1, maxWidth / c.width)
    const out = document.createElement('canvas')
    out.width = Math.round(c.width * scale)
    out.height = Math.round(c.height * scale)
    out.getContext('2d')?.drawImage(c, 0, 0, out.width, out.height)
    onSave(out.toDataURL('image/png'))
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvas}
        width={800}
        height={260}
        aria-label="Signature drawing area"
        className="h-[200px] w-full touch-none rounded-md border border-dashed border-line-strong bg-surface"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          last.current = point(e)
        }}
        onPointerMove={draw}
        onPointerUp={() => (last.current = null)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={clear}>
          Clear
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={empty} onClick={save}>
          Use signature
        </Button>
      </div>
    </div>
  )
}
