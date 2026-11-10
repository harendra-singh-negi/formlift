/** Pill toggle between a few views ("Chats | New Chats"). `sm`: a small one inside a panel. */
export default function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-brand p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-full font-semibold transition ${size === 'sm' ? 'px-3 py-0.5 text-[12px]' : 'px-5 py-1 text-[13px]'} ${
            o.value === value ? 'bg-brand text-white' : 'text-brand hover:bg-primary-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
