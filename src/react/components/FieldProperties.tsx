import { useState, type ReactNode } from 'react'
import Checkbox from '../ui/Checkbox'
import { FormField, Select, TextArea, TextInput } from '../ui/FormField'
import { FIELD_TYPES, type Condition, type FieldDef, type FieldType } from '../../core/form-logic'
import { fitInPage } from '../../core/coords'
import { TYPE_LABEL } from '../constants'
import ConditionBuilder from './ConditionBuilder'

const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s))
const pct = (n: number) => Math.round(n * 1000) / 10

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3 border-b border-line px-3.5 py-3">
    <h4 className="m-0 text-[12px] font-bold tracking-wide text-muted uppercase">{title}</h4>
    {children}
  </section>
)

const CONDITIONS = [
  ['visibleWhen', 'Show only when'],
  ['requiredWhen', 'Required when'],
  ['readOnlyWhen', 'Read-only when'],
] as const

/** Everything about the selected field: identity, rules, options, conditions, position (in % of the page). */
export default function FieldProperties({
  field,
  fields,
  pageCount,
  onChange,
}: {
  field: FieldDef
  fields: FieldDef[]
  pageCount: number
  onChange: (f: FieldDef) => void
}) {
  const set = (patch: Partial<FieldDef>) => onChange({ ...field, ...patch })
  const others = fields.filter((f) => f.id !== field.id)
  const [optionsText, setOptionsText] = useState((field.options ?? []).join('\n'))
  const hasOptions = field.type === 'dropdown' || field.type === 'radio'
  const textual = !['checkbox', 'file', 'signature', 'dropdown', 'radio'].includes(field.type)
  const setPos = (k: 'x' | 'y' | 'width' | 'height', v: string) => {
    const n = num(v)
    if (n != null) set({ position: fitInPage({ ...field.position, [k]: n / 100 }) })
  }

  return (
    <div className="text-[13px]">
      <Section title="Field">
        {field.source === 'ai' && (
          <p className="m-0 rounded bg-folder/15 px-2 py-1 text-[12px]">
            Suggested automatically
            {field.confidence != null && ` (${Math.round(field.confidence * 100)}% sure)`}. Check it.
          </p>
        )}
        <p className="m-0 font-mono text-[11px] text-faint">ID {field.id}</p>
        <FormField label="Label">
          <TextInput value={field.label} onChange={(e) => set({ label: e.target.value })} />
        </FormField>
        {/* Made from the label (unique, kept in step by conditions), never typed: no clashes. */}
        <FormField label="Key (automatic, from the label)">
          <TextInput value={field.key} readOnly className="text-faint" />
        </FormField>
        <FormField label="Type">
          <Select className="w-full" value={field.type} onChange={(e) => set({ type: e.target.value as FieldType })}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </FormField>
        {textual && (
          <FormField label="Placeholder">
            <TextInput
              value={field.placeholder ?? ''}
              onChange={(e) => set({ placeholder: e.target.value || undefined })}
            />
          </FormField>
        )}
        {field.type !== 'file' && field.type !== 'signature' && (
          <FormField label={field.type === 'checkbox' ? 'Checked by default' : 'Default value'}>
            {field.type === 'checkbox' ? (
              <Checkbox
                label="Checked by default"
                checked={field.defaultValue === 'true'}
                onChange={(e) => set({ defaultValue: e.target.checked ? 'true' : undefined })}
              />
            ) : (
              <TextInput
                value={field.defaultValue ?? ''}
                onChange={(e) => set({ defaultValue: e.target.value || undefined })}
              />
            )}
          </FormField>
        )}
        <FormField label="Help text (shown as tooltip)">
          <TextInput value={field.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value || undefined })} />
        </FormField>
        <div className="flex flex-wrap gap-4">
          {(['required', 'readOnly', 'hidden'] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-1.5">
              <Checkbox label={k} checked={!!field[k]} onChange={(e) => set({ [k]: e.target.checked || undefined })} />
              {{ required: 'Required', readOnly: 'Read-only', hidden: 'Hidden' }[k]}
            </label>
          ))}
        </div>
      </Section>

      {hasOptions && (
        <Section title="Options (one per line)">
          <TextArea
            rows={4}
            value={optionsText}
            onChange={(e) => {
              setOptionsText(e.target.value)
              set({
                options: [
                  ...new Set(
                    e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                ],
              })
            }}
          />
        </Section>
      )}

      {textual && (
        <Section title="Validation">
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Min length">
              <TextInput
                type="number"
                min={0}
                value={field.minLength ?? ''}
                onChange={(e) => set({ minLength: num(e.target.value) })}
              />
            </FormField>
            <FormField label="Max length">
              <TextInput
                type="number"
                min={0}
                value={field.maxLength ?? ''}
                onChange={(e) => set({ maxLength: num(e.target.value) })}
              />
            </FormField>
            {field.type === 'number' && (
              <>
                <FormField label="Min value">
                  <TextInput
                    type="number"
                    value={field.min ?? ''}
                    onChange={(e) => set({ min: num(e.target.value) })}
                  />
                </FormField>
                <FormField label="Max value">
                  <TextInput
                    type="number"
                    value={field.max ?? ''}
                    onChange={(e) => set({ max: num(e.target.value) })}
                  />
                </FormField>
              </>
            )}
          </div>
          <FormField label="Regex (whole value must match)">
            <TextInput
              className="font-mono"
              value={field.pattern ?? ''}
              onChange={(e) => set({ pattern: e.target.value || undefined })}
            />
          </FormField>
        </Section>
      )}

      {CONDITIONS.map(([key, title]) => {
        const cond = field[key]
        return (
          <Section key={key} title={title}>
            {cond ? (
              <ConditionBuilder
                value={cond}
                fields={others}
                onChange={(c: Condition) => set({ [key]: c.rules.length ? c : undefined })}
              />
            ) : (
              <button
                type="button"
                disabled={!others.length}
                className="cursor-pointer text-primary hover:underline disabled:cursor-not-allowed disabled:text-faint"
                onClick={() =>
                  set({ [key]: { logic: 'and', rules: [{ fieldKey: others[0].key, op: 'equals', value: '' }] } })
                }
              >
                + Add condition
              </button>
            )}
          </Section>
        )
      })}

      <Section title="Position (% of page)">
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Page">
            <TextInput
              type="number"
              min={1}
              max={pageCount}
              value={field.position.page}
              onChange={(e) => {
                const p = num(e.target.value)
                if (p && Number.isInteger(p) && p >= 1 && p <= pageCount)
                  set({ position: { ...field.position, page: p } })
              }}
            />
          </FormField>
          <span />
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <FormField key={k} label={{ x: 'Left', y: 'Top', width: 'Width', height: 'Height' }[k]}>
              <TextInput
                type="number"
                step={0.1}
                value={pct(field.position[k])}
                onChange={(e) => setPos(k, e.target.value)}
              />
            </FormField>
          ))}
        </div>
      </Section>
    </div>
  )
}
