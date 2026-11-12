import { useState, type ReactNode } from 'react'
import {
  BOOLEAN_TYPES,
  FIELD_TYPES,
  MULTI_TYPES,
  OPTION_TYPES,
  rangeOf,
  type AnswerRule,
  type Condition,
  type FieldDef,
  type FieldGroup,
  type FieldType,
} from '../../core/form-logic'
import { fitInPage } from '../../core/coords'
import { newFollowUpField } from '../../core/fields'
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
  onFieldsChange,
  onSelect,
  rules = {},
}: {
  field: FieldDef
  fields: FieldDef[]
  pageCount: number
  onChange: (f: FieldDef) => void
  /** Changes to several fields at once (a group's settings, a follow-up's new question). */
  onFieldsChange?: (update: (fields: FieldDef[]) => FieldDef[]) => void
  /** Select another field (a follow-up's question). */
  onSelect?: (id: string) => void
  /** The app's own rules the admin can pick for this field. */
  rules?: Record<string, AnswerRule>
}) {
  const L = useLabels()
  const set = (patch: Partial<FieldDef>) => onChange({ ...field, ...patch })
  const pickable = Object.entries(rules).filter(([, r]) => !r.types || r.types.includes(field.type))
  const others = fields.filter((f) => f.id !== field.id)
  const [optionsText, setOptionsText] = useState((field.options ?? []).join('\n'))
  // options changed elsewhere (undo, a type change): show them, keeping the person's half-typed lines otherwise
  const optionsKey = (field.options ?? []).join('\n')
  const typed = [...new Set(optionsText.split('\n').map((x) => x.trim()).filter(Boolean))].join('\n')
  if (typed !== optionsKey && optionsText !== optionsKey) setOptionsText(optionsKey)
  const hasOptions = OPTION_TYPES.includes(field.type)
  const isBool = BOOLEAN_TYPES.includes(field.type)
  // typed answers: placeholder, length, regex
  const textual = ['text', 'textarea', 'number', 'date', 'email', 'phone', 'time', 'datetime', 'url', 'currency'].includes(
    field.type,
  )
  const numberInput = (label: string, k: 'min' | 'max' | 'step' | 'decimals', extra?: { min?: number }) => (
    <FormField label={label}>
      <TextInput type="number" {...extra} value={field[k] ?? ''} onChange={(e) => set({ [k]: num(e.target.value) })} />
    </FormField>
  )
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
        {!['file', 'signature', ...MULTI_TYPES].includes(field.type) && (
          <FormField label={isBool ? L.checkedByDefault : L.defaultValue}>
            {isBool ? (
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
          <label className="inline-flex items-center gap-1.5">
            <Checkbox
              label={L.allowComments}
              checked={!!field.comments}
              onChange={(e) => set({ comments: e.target.checked || undefined })}
            />
            {L.allowComments}
          </label>
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
          {MULTI_TYPES.includes(field.type) && (
            <div className="grid grid-cols-2 gap-2">
              {numberInput(L.minChoices, 'min', { min: 0 })}
              {numberInput(L.maxChoices, 'max', { min: 1 })}
            </div>
          )}
        </Section>
      )}

      {(field.type === 'slider' || field.type === 'rating') && (
        <Section title={L.validationSection}>
          {field.type === 'rating' ? (
            <FormField label={L.stars}>
              <TextInput
                type="number"
                min={1}
                max={10}
                value={rangeOf(field).max}
                onChange={(e) => {
                  const n = num(e.target.value)
                  if (n && n >= 1 && n <= 10) set({ max: Math.round(n) })
                }}
              />
            </FormField>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {numberInput(L.minValue, 'min')}
              {numberInput(L.maxValue, 'max')}
              {numberInput(L.stepValue, 'step', { min: 0 })}
            </div>
          )}
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
            {field.type === 'currency' && (
              <>
                <FormField label={L.currencySymbol}>
                  <TextInput
                    value={field.currency ?? ''}
                    maxLength={5}
                    onChange={(e) => set({ currency: e.target.value || undefined })}
                  />
                </FormField>
                {numberInput(L.decimalPlaces, 'decimals', { min: 0 })}
              </>
            )}
            {(field.type === 'number' || field.type === 'currency') && (
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

      {onFieldsChange && (field.type === 'checkbox' || field.type === 'toggle') && (
        <GroupSection field={field} fields={fields} onFieldsChange={onFieldsChange} />
      )}

      {onFieldsChange && !field.dialogOnly && (
        <Section title={L.followUpSection}>
          <p className="m-0 text-[12px] text-muted">{L.followUpHint}</p>
          {field.followUp && (
            <>
              <FormField label={L.followUpWhen}>
                <ConditionBuilder
                  value={field.followUp.when}
                  fields={fields.filter((f) => !f.dialogOnly)}
                  onChange={(c: Condition) => set({ followUp: { ...field.followUp!, when: c } })}
                />
              </FormField>
              <FormField label={L.followUpTitle}>
                <TextInput
                  value={field.followUp.title ?? ''}
                  placeholder={field.label}
                  onChange={(e) => set({ followUp: { ...field.followUp!, title: e.target.value || undefined } })}
                />
              </FormField>
              <ol className="m-0 space-y-1 pl-5">
                {field.followUp.fields.map((k) => {
                  const q = fields.find((f) => f.key === k)
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        className="cursor-pointer text-primary hover:underline"
                        onClick={() => q && onSelect?.(q.id)}
                      >
                        {q?.label || k}
                      </button>{' '}
                      <span className="text-muted">· {q ? typeName(L, q.type) : '?'}</span>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={L.followUpAdd}
              value=""
              onChange={(e) => {
                const type = e.target.value as FieldType
                if (type) onFieldsChange((l) => newFollowUpField(type, field, l))
              }}
            >
              <option value="">{L.followUpAdd}</option>
              {FIELD_TYPES.filter((t) => t !== 'signature').map((t) => (
                <option key={t} value={t}>
                  {typeName(L, t)}
                </option>
              ))}
            </Select>
            {field.followUp && (
              <button
                type="button"
                className="cursor-pointer text-danger hover:underline"
                onClick={() =>
                  onFieldsChange((l) => {
                    const drop = new Set(field.followUp!.fields)
                    return l.filter((f) => !drop.has(f.key)).map((f) => (f.id === field.id ? { ...f, followUp: undefined } : f))
                  })
                }
              >
                {L.followUpRemove}
              </button>
            )}
          </div>
        </Section>
      )}

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

/** A checkbox / toggle's group: join or leave one, and the group's settings (written to every member). */
function GroupSection({
  field,
  fields,
  onFieldsChange,
}: {
  field: FieldDef
  fields: FieldDef[]
  onFieldsChange: (update: (fields: FieldDef[]) => FieldDef[]) => void
}) {
  const L = useLabels()
  const ids = [...new Set(fields.map((f) => f.group?.id).filter((x): x is string => !!x))]
  const g = field.group
  const members = g ? fields.filter((f) => f.group?.id === g.id) : []
  const setGroup = (next: FieldGroup) =>
    onFieldsChange((l) => l.map((f) => (f.group?.id === g!.id ? { ...f, group: next } : f)))
  const join = (id: string) =>
    onFieldsChange((l) => {
      const settings = l.find((f) => f.group?.id === id)?.group ?? { id, mode: 'single' as const }
      return l.map((f) => (f.id === field.id ? { ...f, group: id ? settings : undefined } : f))
    })
  return (
    <Section title={L.groupSection}>
      <Select
        className="w-full"
        aria-label={L.groupSection}
        value={g?.id ?? ''}
        onChange={(e) => {
          if (e.target.value !== '\u0000new') return join(e.target.value)
          let n = 1
          while (ids.includes(`group_${n}`)) n++
          join(`group_${n}`)
        }}
      >
        <option value="">{L.groupNone}</option>
        {ids.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
        <option value={'\u0000new'}>{L.groupNew}</option>
      </Select>
      {g && (
        <>
          <p className="m-0 text-[12px] text-muted">{L.groupMembers(members.length)}</p>
          <FormField label={L.groupMode}>
            <Select
              className="w-full"
              value={g.mode}
              onChange={(e) =>
                setGroup(
                  e.target.value === 'single'
                    ? { id: g.id, mode: 'single', required: g.required }
                    : { ...g, mode: 'multiple' },
                )
              }
            >
              <option value="single">{L.groupSingle}</option>
              <option value="multiple">{L.groupMultiple}</option>
            </Select>
          </FormField>
          <label className="inline-flex items-center gap-1.5">
            <Checkbox
              label={L.groupRequired}
              checked={!!g.required}
              onChange={(e) => setGroup({ ...g, required: e.target.checked || undefined })}
            />
            {L.groupRequired}
          </label>
          {g.mode === 'multiple' && (
            <div className="grid grid-cols-2 gap-2">
              {(['min', 'max'] as const).map((k) => (
                <FormField key={k} label={k === 'min' ? L.minChoices : L.maxChoices}>
                  <TextInput
                    type="number"
                    min={0}
                    value={g[k] ?? ''}
                    onChange={(e) => setGroup({ ...g, [k]: num(e.target.value) })}
                  />
                </FormField>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  )
}
