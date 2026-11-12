import { useState, type ReactNode } from 'react'
import { FIELD_TYPES, type AnswerRule, type Condition, type FieldDef, type FieldType } from '../../core/form-logic'
import { fitInPage } from '../../core/coords'
import { typeName, useLabels } from '../labels'
import ConditionBuilder from './ConditionBuilder'
import { Checkbox, FormField, Select, TextArea, TextInput } from '../ui/slots'

const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s))
const pct = (n: number) => Math.round(n * 1000) / 10

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3 border-b border-line px-3.5 py-3">
    <h4 className="m-0 text-[12px] font-bold tracking-wide text-muted uppercase">{title}</h4>
    {children}
  </section>
)

const CONDITIONS = ['visibleWhen', 'requiredWhen', 'readOnlyWhen'] as const

/** Everything about the selected field: identity, rules, options, conditions, position (in % of the page). */
export default function FieldProperties({
  field,
  fields,
  pageCount,
  onChange,
  rules = {},
}: {
  field: FieldDef
  fields: FieldDef[]
  pageCount: number
  onChange: (f: FieldDef) => void
  /** The app's own rules the admin can pick for this field. */
  rules?: Record<string, AnswerRule>
}) {
  const L = useLabels()
  const set = (patch: Partial<FieldDef>) => onChange({ ...field, ...patch })
  const pickable = Object.entries(rules).filter(([, r]) => !r.types || r.types.includes(field.type))
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
      <Section title={L.fieldSection}>
        {field.source === 'ai' && (
          <p className="m-0 rounded bg-folder/15 px-2 py-1 text-[12px]">
            {L.suggestedAutomatically(field.confidence != null ? Math.round(field.confidence * 100) : null)}
          </p>
        )}
        <p className="m-0 font-mono text-[11px] text-faint">{L.fieldId(field.id)}</p>
        <FormField label={L.label}>
          <TextInput value={field.label} onChange={(e) => set({ label: e.target.value })} />
        </FormField>
        {/* Made from the label (unique, kept in step by conditions), never typed: no clashes. */}
        <FormField label={L.keyAutomatic}>
          <TextInput value={field.key} readOnly className="text-faint" />
        </FormField>
        <FormField label={L.type}>
          <Select className="w-full" value={field.type} onChange={(e) => set({ type: e.target.value as FieldType })}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeName(L, t)}
              </option>
            ))}
          </Select>
        </FormField>
        {textual && (
          <FormField label={L.placeholder}>
            <TextInput
              value={field.placeholder ?? ''}
              onChange={(e) => set({ placeholder: e.target.value || undefined })}
            />
          </FormField>
        )}
        {field.type !== 'file' && field.type !== 'signature' && (
          <FormField label={field.type === 'checkbox' ? L.checkedByDefault : L.defaultValue}>
            {field.type === 'checkbox' ? (
              <Checkbox
                label={L.checkedByDefault}
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
        <FormField label={L.helpText}>
          <TextInput value={field.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value || undefined })} />
        </FormField>
        <div className="flex flex-wrap gap-4">
          {(['required', 'readOnly', 'hidden'] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-1.5">
              <Checkbox label={L[k]} checked={!!field[k]} onChange={(e) => set({ [k]: e.target.checked || undefined })} />
              {L[k]}
            </label>
          ))}
        </div>
      </Section>

      {hasOptions && (
        <Section title={L.optionsSection}>
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
        <Section title={L.validationSection}>
          <div className="grid grid-cols-2 gap-2">
            <FormField label={L.minLength}>
              <TextInput
                type="number"
                min={0}
                value={field.minLength ?? ''}
                onChange={(e) => set({ minLength: num(e.target.value) })}
              />
            </FormField>
            <FormField label={L.maxLength}>
              <TextInput
                type="number"
                min={0}
                value={field.maxLength ?? ''}
                onChange={(e) => set({ maxLength: num(e.target.value) })}
              />
            </FormField>
            {field.type === 'number' && (
              <>
                <FormField label={L.minValue}>
                  <TextInput
                    type="number"
                    value={field.min ?? ''}
                    onChange={(e) => set({ min: num(e.target.value) })}
                  />
                </FormField>
                <FormField label={L.maxValue}>
                  <TextInput
                    type="number"
                    value={field.max ?? ''}
                    onChange={(e) => set({ max: num(e.target.value) })}
                  />
                </FormField>
              </>
            )}
          </div>
          <FormField label={L.regex}>
            <TextInput
              className="font-mono"
              value={field.pattern ?? ''}
              onChange={(e) => set({ pattern: e.target.value || undefined })}
            />
          </FormField>
        </Section>
      )}

      <Section title={L.messagesSection}>
        <FormField label={L.requiredMessage}>
          <TextInput
            value={field.requiredMessage ?? ''}
            placeholder={L.messageHint}
            onChange={(e) => set({ requiredMessage: e.target.value || undefined })}
          />
        </FormField>
        <FormField label={L.errorMessage}>
          <TextInput
            value={field.errorMessage ?? ''}
            placeholder={L.messageHint}
            onChange={(e) => set({ errorMessage: e.target.value || undefined })}
          />
        </FormField>
        {pickable.length > 0 && (
          <FormField label={L.rulesLabel}>
            <div className="flex flex-col gap-1.5">
              {pickable.map(([id, rule]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <Checkbox
                    label={rule.label ?? id}
                    checked={!!field.rules?.includes(id)}
                    onChange={(e) => {
                      const next = (field.rules ?? []).filter((r) => r !== id)
                      if (e.target.checked) next.push(id)
                      set({ rules: next.length ? next : undefined })
                    }}
                  />
                  {rule.label ?? id}
                </label>
              ))}
            </div>
          </FormField>
        )}
      </Section>

      {CONDITIONS.map((key) => {
        const cond = field[key]
        return (
          <Section key={key} title={L[key]}>
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
                {L.addCondition}
              </button>
            )}
          </Section>
        )
      })}

      <Section title={L.positionSection}>
        <div className="grid grid-cols-2 gap-2">
          <FormField label={L.page}>
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
            <FormField key={k} label={{ x: L.left, y: L.top, width: L.width, height: L.height }[k]}>
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
