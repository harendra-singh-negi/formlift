import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldDef } from '../../core/form-logic'
import { typeName, useLabels } from '../labels'
import { TextInput } from '../ui/FormField'
import IconButton from '../ui/IconButton'

const ROW = 32 // px, every row: fixed so only the rows on screen need to exist
const OVERSCAN = 10

/**
 * The fill order: search, jump to a field, move it up / down. Windowed, so a form with thousands of fields
 * renders only the few dozen rows in view. Scrolls with the nearest `[data-fl-scroll]` ancestor.
 */
export default function FieldOrderList({
  fields,
  selectedId,
  onPick,
  onMove,
}: {
  fields: FieldDef[]
  selectedId?: string
  onPick: (f: FieldDef) => void
  onMove: (id: string, by: -1 | 1) => void
}) {
  const L = useLabels()
  const [query, setQuery] = useState('')
  const list = useRef<HTMLOListElement>(null)
  const [range, setRange] = useState({ from: 0, to: 60 })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = fields.map((f, i) => ({ f, i }))
    return q ? all.filter(({ f }) => `${f.label} ${f.key}`.toLowerCase().includes(q)) : all
  }, [fields, query])

  useEffect(() => {
    const el = list.current
    const box = el?.closest<HTMLElement>('[data-fl-scroll]')
    if (!el || !box) return
    const update = () => {
      const top = box.scrollTop - el.offsetTop
      const from = Math.max(0, Math.floor(top / ROW) - OVERSCAN)
      const to = Math.ceil((top + box.clientHeight) / ROW) + OVERSCAN
      setRange((r) => (r.from === from && r.to === to ? r : { from, to }))
    }
    update()
    box.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(box)
    return () => {
      box.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [])

  const shown = rows.slice(range.from, range.to)
  return (
    <>
      <div className="p-2">
        <TextInput
          type="search"
          value={query}
          placeholder={L.searchFields}
          aria-label={L.searchFields}
          className="py-1.5 text-[12.5px]"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ol
        ref={list}
        className="relative m-0 list-none p-0"
        style={{ height: rows.length * ROW }}
        aria-rowcount={rows.length}
      >
        {shown.map(({ f, i }, n) => (
          <li
            key={f.id}
            className={`absolute inset-x-0 flex items-center gap-1 overflow-hidden border-b border-line-soft px-2 text-[12.5px] ${
              selectedId === f.id ? 'bg-primary-tint' : ''
            }`}
            style={{ top: (range.from + n) * ROW, height: ROW }}
          >
            <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left" onClick={() => onPick(f)}>
              <span className="text-faint">{L.pageShort(f.position.page)}</span> {f.label || f.key}{' '}
              <span className="text-muted">· {typeName(L, f.type)}</span>
              {f.source === 'ai' && <span className="text-folder"> · {L.suggestedTag}</span>}
            </button>
            <IconButton icon={ArrowUp} title={L.moveUp} iconSize={13} disabled={i === 0} onClick={() => onMove(f.id, -1)} />
            <IconButton
              icon={ArrowDown}
              title={L.moveDown}
              iconSize={13}
              disabled={i === fields.length - 1}
              onClick={() => onMove(f.id, 1)}
            />
          </li>
        ))}
      </ol>
    </>
  )
}
