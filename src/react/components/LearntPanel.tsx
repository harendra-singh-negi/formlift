import { useState } from 'react'
import type { FieldType } from '../../core/form-logic'
import type { Forget, Learnt, SettingsChange } from '../../core/learn'
import { typeName, useLabels, type Labels } from '../labels'
import { Button, ConfirmModal, EmptyText, PanelHeading } from '../ui/slots'

/** What a label's suggestions get, in a few words: "Text area · Required · renamed “Location”". */
const describe = (L: Labels, c: SettingsChange) =>
  Object.entries(c)
    .map(([k, v]) =>
      k === 'type'
        ? typeName(L, v as FieldType)
        : k === 'label'
          ? L.learntRenamed(String(v))
          : k === 'required'
            ? `${L.required}: ${v ? L.yes : L.no}`
            : `${k}: ${v === null ? '—' : Array.isArray(v) ? v.join(', ') : String(v)}`,
    )
    .join(' · ')

/** What auto-detect learnt from the admin's saves, each with Forget, and Forget everything. */
export default function LearntPanel({ learnt, onForget }: { learnt: Learnt; onForget: (what: Forget) => void }) {
  const L = useLabels()
  const [confirm, setConfirm] = useState(false)
  const nothing = !learnt.labels.length && !learnt.drawn.length && !learnt.pages && !learnt.patterns.boxes
  const forget = (what: Forget) => (
    <button type="button" className="flex-none cursor-pointer text-primary hover:underline" onClick={() => onForget(what)}>
      {L.forget}
    </button>
  )
  const row = 'flex items-start gap-2 border-b border-line-soft px-3 py-1.5'
  return (
    <div className="text-[12.5px]">
      <PanelHeading>{L.learntHeading}</PanelHeading>
      {nothing && <EmptyText>{L.learntNothing}</EmptyText>}
      <ul className="m-0 list-none p-0">
        {learnt.labels.map((r) => (
          <li key={r.hash} className={row}>
            <span className="min-w-0 flex-1">
              <b>{r.label}</b> <span className="text-muted">{r.drop ? L.learntLeftOut : describe(L, r.change)}</span>
            </span>
            {forget({ labels: [r.hash] })}
          </li>
        ))}
        {learnt.drawn.map((d) => (
          <li key={d.line} className={row}>
            <span className="min-w-0 flex-1">
              <b>{d.settings.label}</b>{' '}
              <span className="text-muted">
                {typeName(L, d.settings.type)} · {L.learntDrawn(d.times)}
              </span>
            </span>
            {forget({ drawn: [d.line] })}
          </li>
        ))}
      </ul>
      {learnt.patterns.boxes > 0 && (
        <div className={row}>
          <span className="min-w-0 flex-1 text-muted">{L.learntPatterns(learnt.patterns.boxes, learnt.patterns.saves)}</span>
          {forget({ patterns: true })}
        </div>
      )}
      {learnt.pages > 0 && <p className="m-0 px-3 py-2 text-muted">{L.learntPages(learnt.pages)}</p>}
      {learnt.corrections.length > 0 && (
        <div className="px-3 py-2">
          <div className="text-muted">{L.learntCorrections}</div>
          {/* One bar per save: the share of its fields auto-detect got wrong. Shorter and shorter: it is learning. */}
          <div className="mt-1 flex h-10 items-end gap-0.5" role="img" aria-label={L.learntCorrections}>
            {learnt.corrections.map((c) => (
              <span
                key={c.at}
                className="min-w-1 flex-1 rounded-t-sm bg-primary"
                style={{ height: `${Math.max(4, Math.min(100, (100 * c.corrections) / Math.max(1, c.fields)))}%` }}
                title={L.learntCorrectionsOf(c.corrections, c.fields)}
              />
            ))}
          </div>
          <div className="mt-1 text-muted">
            {learnt.corrections
              .slice(-5)
              .map((c) => L.learntCorrectionsOf(c.corrections, c.fields))
              .join(' · ')}
          </div>
        </div>
      )}
      {!nothing && (
        <div className="px-3 py-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
            {L.forgetEverything}
          </Button>
        </div>
      )}
      {confirm && (
        <ConfirmModal
          danger
          confirmLabel={L.forgetEverything}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            onForget({ all: true })
          }}
        >
          {L.confirmForgetEverything}
        </ConfirmModal>
      )}
    </div>
  )
}
