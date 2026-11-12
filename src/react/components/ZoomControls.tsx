import { Minus, Plus } from 'lucide-react'
import { IconButton } from '../ui/slots'
import { useLabels } from '../labels'

import { ZOOMS } from '../constants'

/** − 100 % +. `zoom` may be in between the steps (fitted to the screen); the buttons go to the next step. */
export default function ZoomControls({
  zoom,
  onChange,
  steps = ZOOMS,
}: {
  zoom: number
  onChange: (z: number) => void
  steps?: readonly number[]
}) {
  const L = useLabels()
  const sorted = [...steps].sort((a, b) => a - b)
  const lower = [...sorted].reverse().find((z) => z < zoom - 0.01)
  const higher = sorted.find((z) => z > zoom + 0.01)
  return (
    <div className="inline-flex items-center gap-1 text-[13px]">
      <IconButton icon={Minus} title={L.zoomOut} disabled={lower == null} onClick={() => onChange(lower!)} />
      <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <IconButton icon={Plus} title={L.zoomIn} disabled={higher == null} onClick={() => onChange(higher!)} />
    </div>
  )
}
