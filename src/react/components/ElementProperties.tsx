import type { ReactNode } from 'react'
import { FONTS, type LayoutElement } from '../../core/form-logic'
import { fitInPage } from '../../core/coords'
import { Checkbox, FormField, Select, TextArea, TextInput } from '../ui/slots'

const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s))
const pct = (n: number) => Math.round(n * 1000) / 10

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3 border-b border-line px-3.5 py-3">
    <h4 className="m-0 text-[12px] font-bold tracking-wide text-muted uppercase">{title}</h4>
    {children}
  </section>
)

/** A colour picker with a "none" option (no background / no border). */
function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string
  value: string | undefined
  onChange: (v: string | undefined) => void
  allowNone?: boolean
}) {
  return (
    <FormField label={label}>
      <span className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="h-8 w-12 cursor-pointer rounded border border-line-strong bg-white"
          value={value ?? '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
        />
        {allowNone && (
          <label className="inline-flex items-center gap-1.5 text-[12.5px]">
            <Checkbox
              label={`No ${label.toLowerCase()}`}
              checked={!value}
              onChange={(e) => onChange(e.target.checked ? undefined : '#ffffff')}
            />
            None
          </label>
        )}
      </span>
    </FormField>
  )
}

/** Text, style, colours and position of the selected text / box / line. */
export default function ElementProperties({
  element: e,
  pageCount,
  onChange,
}: {
  element: LayoutElement
  pageCount: number
  onChange: (e: LayoutElement) => void
}) {
  const set = (patch: Partial<LayoutElement>) => onChange({ ...e, ...patch })
  const setPos = (k: 'x' | 'y' | 'width' | 'height', v: string) => {
    const n = num(v)
    if (n == null) return
    const p = { ...e.position, [k]: n / 100 }
    // A line may have zero height (horizontal) or zero width (vertical); boxes keep a minimum size.
    if (e.type === 'line')
      set({ position: { ...p, width: Math.min(p.width, 1 - p.x), height: Math.min(p.height, 1 - p.y) } })
    else {
      const { page: _page, ...fitted } = fitInPage({ page: e.page, ...p })
      void _page
      set({ position: fitted })
    }
  }

  return (
    <div className="text-[13px]">
      {e.type === 'text' && (
        <Section title="Text">
          {e.replaces != null && (
            <p className="m-0 rounded bg-primary-soft px-2 py-1 text-[12px] text-ink-2">
              Replaces the original: “{e.replaces}”
            </p>
          )}
          <TextArea
            rows={4}
            aria-label="Text"
            autoFocus
            value={e.text ?? ''}
            maxLength={5000}
            onChange={(ev) => set({ text: ev.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Font">
              <Select
                className="w-full"
                value={e.font ?? 'sans'}
                onChange={(ev) => set({ font: ev.target.value as LayoutElement['font'] })}
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {{ sans: 'Sans (Helvetica)', serif: 'Serif (Times)', mono: 'Mono (Courier)' }[f]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Size (pt)">
              <TextInput
                type="number"
                min={3}
                max={144}
                step={0.5}
                value={e.fontSize ?? 10}
                onChange={(ev) => {
                  const n = num(ev.target.value)
                  if (n != null && n >= 3 && n <= 144) set({ fontSize: n })
                }}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {(['bold', 'italic'] as const).map((k) => (
              <label key={k} className="inline-flex items-center gap-1.5">
                <Checkbox label={k} checked={!!e[k]} onChange={(ev) => set({ [k]: ev.target.checked || undefined })} />
                {k === 'bold' ? 'Bold' : 'Italic'}
              </label>
            ))}
            <Select
              aria-label="Alignment"
              value={e.align ?? 'left'}
              onChange={(ev) => set({ align: ev.target.value as LayoutElement['align'] })}
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </Select>
          </div>
          <ColorField label="Text colour" value={e.color ?? '#000000'} onChange={(v) => set({ color: v })} />
        </Section>
      )}

      <Section title="Colours">
        {e.type !== 'line' && (
          <ColorField label="Background" allowNone value={e.fill} onChange={(v) => set({ fill: v })} />
        )}
        {e.type !== 'text' && (
          <>
            <ColorField
              label={e.type === 'line' ? 'Line colour' : 'Border'}
              allowNone={e.type === 'box'}
              value={e.stroke}
              onChange={(v) => set({ stroke: v })}
            />
            <FormField label="Line width (pt)">
              <TextInput
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={e.strokeWidth ?? 1}
                onChange={(ev) => {
                  const n = num(ev.target.value)
                  if (n != null && n >= 0 && n <= 20) set({ strokeWidth: n })
                }}
              />
            </FormField>
          </>
        )}
        {e.fill === '#ffffff' && (
          <p className="m-0 text-[12px] text-muted">A white background hides the original under it.</p>
        )}
      </Section>

      <Section title="Position (% of page)">
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Page">
            <TextInput
              type="number"
              min={1}
              max={pageCount}
              value={e.page}
              onChange={(ev) => {
                const p = num(ev.target.value)
                if (p && Number.isInteger(p) && p >= 1 && p <= pageCount) set({ page: p })
              }}
            />
          </FormField>
          <span />
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <FormField key={k} label={{ x: 'Left', y: 'Top', width: 'Width', height: 'Height' }[k]}>
              <TextInput
                type="number"
                step={0.1}
                value={pct(e.position[k])}
                onChange={(ev) => setPos(k, ev.target.value)}
              />
            </FormField>
          ))}
        </div>
      </Section>
    </div>
  )
}
