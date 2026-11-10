import { X } from 'lucide-react'

export interface ChipOption {
  value: string
  label: string
  /** How many items have it, shown after the label. */
  count?: number
}

/** A pill that can be switched on and off (a filter value). */
export function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] whitespace-nowrap transition-colors ${
        active
          ? 'border-primary bg-primary-tint font-semibold text-primary'
          : 'border-line-strong bg-white text-ink-2 hover:border-faint hover:bg-surface'
      }`}
    >
      {label}
      {count != null && (
        <span
          className={`rounded-full px-1.5 text-[11px] font-semibold ${active ? 'bg-primary text-white' : 'bg-hover text-muted'}`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** One pick out of a few pills; a click on the picked one clears it. Optional title before them. */
export function ChipGroup({
  title,
  options,
  value,
  onChange,
}: {
  title?: string
  options: ChipOption[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <div role="group" aria-label={title} className="flex flex-wrap items-center gap-1.5">
      {title && (
        <span className="mr-1 min-w-28 text-[11.5px] max-sm:basis-full font-semibold tracking-wide text-muted uppercase">
          {title}
        </span>
      )}
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          count={o.count}
          active={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
        />
      ))}
    </div>
  )
}

/** A filter in use, with × to take it off. */
export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-tint py-0.5 pr-1 pl-2.5 text-[12px] font-medium text-primary">
      {label}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex h-4.5 w-4.5 cursor-pointer items-center justify-center rounded-full hover:bg-primary hover:text-white"
      >
        <X size={12} />
      </button>
    </span>
  )
}
