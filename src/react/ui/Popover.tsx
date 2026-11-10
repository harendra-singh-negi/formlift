import type { LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useOutsideClose } from './useOutsideClose'

/** A button that opens a panel under it (closes on a click outside or Escape). `badge`: a count on the button. */
export default function Popover({
  label,
  icon: Icon,
  badge,
  align = 'left',
  children,
}: {
  label: string
  icon?: LucideIcon
  badge?: number
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useOutsideClose(box, open, () => setOpen(false))
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium ${
          open || badge
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-line-strong bg-white text-ink-2 hover:border-faint'
        }`}
      >
        {Icon && <Icon size={15} />}
        {label}
        {!!badge && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`absolute z-30 mt-1.5 w-[min(560px,calc(100vw-24px))] max-sm:fixed max-sm:inset-x-3 max-sm:max-h-[70dvh] max-sm:w-auto max-sm:overflow-y-auto rounded-lg border border-line bg-white p-4 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
