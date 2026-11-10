import { Plus, X } from 'lucide-react'
import Button from '../ui/Button'
import IconButton from '../ui/IconButton'
import { Select, TextInput } from '../ui/FormField'
import { OPERATORS, type Condition, type FieldDef, type Operator, type Rule } from '../../core/form-logic'

const OP_LABEL: Record<Operator, string> = {
  equals: 'equals',
  notEquals: 'does not equal',
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  greaterThan: 'is greater than',
  lessThan: 'is less than',
  between: 'is between',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
}
const isGroup = (r: Rule | Condition): r is Condition => 'rules' in r

/**
 * IF <field> <operator> <value> rows joined by AND / OR, with nested groups. `fields` = the fields a rule may
 * point at (every field but the one being edited). The API rejects unknown and circular references again.
 */
export default function ConditionBuilder({
  value,
  onChange,
  fields,
  depth = 0,
}: {
  value: Condition
  onChange: (c: Condition) => void
  fields: FieldDef[]
  depth?: number
}) {
  const setRule = (i: number, r: Rule | Condition) =>
    onChange({ ...value, rules: value.rules.map((x, j) => (j === i ? r : x)) })
  const remove = (i: number) => onChange({ ...value, rules: value.rules.filter((_, j) => j !== i) })
  const newRule = (): Rule => ({ fieldKey: fields[0]?.key ?? '', op: 'equals', value: '' })

  return (
    <div className={`space-y-2 ${depth ? 'rounded-md border border-line bg-surface p-2' : ''}`}>
      <div className="flex items-center gap-2 text-[12px]">
        Match
        <Select
          aria-label="Match all or any"
          value={value.logic}
          onChange={(e) => onChange({ ...value, logic: e.target.value as Condition['logic'] })}
        >
          <option value="and">ALL (AND)</option>
          <option value="or">ANY (OR)</option>
        </Select>
      </div>
      {value.rules.map((r, i) =>
        isGroup(r) ? (
          <div key={i} className="flex items-start gap-1">
            <div className="flex-1">
              <ConditionBuilder value={r} onChange={(c) => setRule(i, c)} fields={fields} depth={depth + 1} />
            </div>
            <IconButton icon={X} title="Remove group" danger iconSize={14} onClick={() => remove(i)} />
          </div>
        ) : (
          <div key={i} className="flex flex-wrap items-center gap-1">
            <Select
              aria-label="Field"
              value={r.fieldKey}
              onChange={(e) => setRule(i, { ...r, fieldKey: e.target.value })}
            >
              {!fields.some((f) => f.key === r.fieldKey) && <option value={r.fieldKey}>{r.fieldKey || '—'}</option>}
              {fields.map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label || f.key}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Operator"
              value={r.op}
              onChange={(e) => setRule(i, { ...r, op: e.target.value as Operator })}
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {OP_LABEL[op]}
                </option>
              ))}
            </Select>
            {r.op !== 'isEmpty' && r.op !== 'isNotEmpty' && (
              <TextInput
                aria-label="Value"
                className="!w-24 !py-1"
                value={r.value ?? ''}
                onChange={(e) => setRule(i, { ...r, value: e.target.value })}
              />
            )}
            {r.op === 'between' && (
              <TextInput
                aria-label="Upper value"
                className="!w-24 !py-1"
                value={r.value2 ?? ''}
                onChange={(e) => setRule(i, { ...r, value2: e.target.value })}
              />
            )}
            <IconButton icon={X} title="Remove rule" danger iconSize={14} onClick={() => remove(i)} />
          </div>
        ),
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          disabled={!fields.length}
          onClick={() => onChange({ ...value, rules: [...value.rules, newRule()] })}
        >
          Rule
        </Button>
        {depth < 2 && (
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            disabled={!fields.length}
            onClick={() => onChange({ ...value, rules: [...value.rules, { logic: 'and', rules: [newRule()] }] })}
          >
            Group
          </Button>
        )}
      </div>
    </div>
  )
}
