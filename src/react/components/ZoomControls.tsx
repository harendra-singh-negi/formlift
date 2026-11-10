import { Minus, Plus } from 'lucide-react'
import IconButton from '../ui/IconButton'

import { ZOOMS } from '../constants'

/** − 100 % +. `zoom` may be in between the steps (fitted to the screen); the buttons go to the next step. */
export default function ZoomControls({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const lower = [...ZOOMS].reverse().find((z) => z < zoom - 0.01)
  const higher = ZOOMS.find((z) => z > zoom + 0.01)
  return (
    <div className="inline-flex items-center gap-1 text-[13px]">
      <IconButton icon={Minus} title="Zoom out" disabled={lower == null} onClick={() => onChange(lower!)} />
      <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <IconButton icon={Plus} title="Zoom in" disabled={higher == null} onClick={() => onChange(higher!)} />
    </div>
  )
}
