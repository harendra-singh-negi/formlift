import { Search, SlidersHorizontal } from 'lucide-react'
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuestionFilter, type QuestionFilterState, type UseQuestionFilterOptions } from '../hooks/useQuestionFilter'
import { Button, Chip, ChipGroup, RemovableChip, EmptyText, Popover, Tag } from '../ui/slots'
import type { Answers, FieldDef, FieldType } from '../../core/form-logic'
import type { Question } from '../../core/questions'

const PAGE = 100

// Box for a control in the list (controls size their text to the box, as on the page).
const SIZE: Partial<Record<FieldType, string>> = {
  checkbox: 'h-7 w-7 lg:h-8 lg:w-8',
  textarea: 'h-20 w-full',
  signature: 'h-16 w-56',
  file: 'h-9 w-full sm:w-72',
  radio: 'h-9 w-full',
}
// Parts of an option grid: its rows (the rest of the parts come after it).
const gridSize = (q: Question) => q.rows?.reduce((a, b) => a + b, 0) ?? 0
const wide = (t: FieldType) => t === 'textarea' || t === 'radio' || t === 'file'

/**
 * The form as questions with search and filters: only the questions that match are shown. Answers are the
 * same as on the document; `control(field)` draws a field's answer control. Filters come from useQuestionFilter:
 * `filters` / `search` choose them, `filter` drives the list from your own useQuestionFilter, `renderToolbar`
 * draws your own bar, `toolbar={false}` none. Filters with nothing to offer in this form are left out unless
 * `hideUnavailable={false}`.
 */
export default function QuestionList({
  questions,
  answers,
  control,
  filter: external,
  filters,
  search,
  hideUnavailable = true,
  toolbar = true,
  renderToolbar,
}: {
  questions: Question[]
  answers: Answers
  control: (f: FieldDef) => ReactNode
  filter?: QuestionFilterState
  filters?: UseQuestionFilterOptions['filters']
  search?: boolean
  hideUnavailable?: boolean
  toolbar?: boolean
  renderToolbar?: (fs: QuestionFilterState) => ReactNode
}) {
  const own = useQuestionFilter(questions, answers, { filters, search })
  const fs = external ?? own
  const { list } = fs
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [fs.version])
  const groups = fs.groups.filter((g) => g.available || !hideUnavailable)
  const bar = groups.filter((g) => g.section === 'bar')
  const menu = groups.filter((g) => g.section !== 'bar')
  const sections = [...new Set(menu.map((g) => g.section ?? ''))]

  return (
    <div className="w-full p-3 sm:p-4 lg:px-6">
      {renderToolbar
        ? renderToolbar(fs)
        : toolbar && (
            <div className="sticky top-0 z-10 -mx-3 mb-3 flex flex-col gap-2 border-b border-line bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
              <div className="flex flex-wrap items-center gap-2">
                {fs.search != null && (
                  <label className="relative min-w-0 flex-1 basis-full sm:basis-72">
                    <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      aria-label="Search questions"
                      placeholder="Search questions, sections, answers…"
                      value={fs.search}
                      onChange={(e) => fs.setSearch(e.target.value)}
                      className="w-full rounded-full border border-line-strong bg-surface py-1.5 pr-3 pl-9 text-[13px] outline-none focus:border-primary focus:bg-white max-sm:text-base"
                    />
                  </label>
                )}
                {menu.length > 0 && (
                  <Popover label="Filters" icon={SlidersHorizontal} badge={fs.inUse.length} align="right">
                    <div className="flex flex-col gap-4">
                      {sections.map((sec) => (
                        <FilterSection key={sec} title={sec}>
                          {menu
                            .filter((g) => (g.section ?? '') === sec)
                            .map((g) => (
                              <ChipGroup
                                key={g.id}
                                title={g.title}
                                value={g.value}
                                onChange={g.set}
                                options={g.options}
                              />
                            ))}
                        </FilterSection>
                      ))}
                    </div>
                  </Popover>
                )}
                <span className="text-[12.5px] text-muted sm:ml-auto" aria-live="polite">
                  <b className="font-semibold text-ink-2">{list.length}</b> of {fs.total} questions
                </span>
                {fs.active && (
                  <Button variant="secondary" size="sm" onClick={fs.clear}>
                    Clear all
                  </Button>
                )}
              </div>
              {bar.map((g) => (
                <div key={g.id} role="group" aria-label={g.title} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{g.title}</span>
                  <Chip label="All" count={fs.total} active={g.value == null} onClick={() => g.set(null)} />
                  {g.options.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      count={o.count}
                      active={g.value === o.value}
                      onClick={() => g.set(g.value === o.value ? null : o.value)}
                    />
                  ))}
                </div>
              ))}
              {fs.inUse.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {fs.inUse.map((f) => (
                    <RemovableChip key={f.id} label={f.label} onRemove={f.clear} />
                  ))}
                </div>
              )}
            </div>
          )}

      {list.length === 0 && <EmptyText>No question matches these filters.</EmptyText>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.slice(0, shown).map((q, i, all) => (
          <Fragment key={q.id}>
            {/* The numbered question these answers belong to, once over its run of answers. */}
            {q.section && q.section !== all[i - 1]?.section && (
              <li className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-1">
                <span className="text-[13.5px] font-semibold text-primary lg:text-[15px]">{q.section}</span>
                {Object.entries(q.tags ?? {}).map(([k, v]) => (
                  <Tag key={k} tone="muted">
                    {k}: {v}
                  </Tag>
                ))}
              </li>
            )}
            {/* What a run of rows on one scale asks, once over them. */}
            {q.intro && (q.intro !== all[i - 1]?.intro || q.section !== all[i - 1]?.section) && (
              <li className="rounded-md border-l-4 border-primary bg-primary-soft px-3 py-2 text-[13px] font-medium text-ink-2 lg:text-[14px]">
                {q.intro}
              </li>
            )}
            <li className="rounded-lg border border-line bg-white p-3">
              <div className="mb-2 flex items-start gap-2">
                <p className="m-0 min-w-0 flex-1 text-[13.5px] font-semibold whitespace-pre-line text-ink-2 lg:text-[15px]">
                  {q.title}
                </p>
                {q.category && <Tag tone="muted">{q.category}</Tag>}
                <Tag tone="muted">p.{q.page}</Tag>
              </div>
              {q.columns ? (
                <TableGrid q={q} control={control} />
              ) : (
                <>
                  {q.rows && <OptionGrid rows={q.rows} parts={q.parts.slice(0, gridSize(q))} control={control} />}
                  {/* Parts after an option grid (the "Finding" box under its options) are laid out on their own. */}
                  {q.parts.length > gridSize(q) && (
                    <div className={`flex flex-wrap items-end gap-x-4 gap-y-2 ${q.rows ? 'mt-3' : ''}`}>
                      {q.parts.slice(gridSize(q)).map(({ field, name }) => (
                        <div
                          key={field.id}
                          className={`flex min-w-0 flex-col gap-1 ${wide(field.type) ? 'basis-full' : ''} ${
                            field.type === 'checkbox'
                              ? 'flex-row-reverse items-center justify-end gap-2'
                              : 'max-sm:basis-full'
                          }`}
                        >
                          {name && <span className="text-[12px] text-muted lg:text-[13.5px]">{name}</span>}
                          <div
                            className={`relative [container-type:size] ${SIZE[field.type] ?? 'h-9 w-full sm:w-80 lg:h-10 lg:w-96'}`}
                          >
                            {control(field)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </li>
          </Fragment>
        ))}
      </ul>
      {list.length > shown && (
        <div className="mt-3 text-center">
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({list.length - shown} left)
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Checkboxes of one grid as on the document: each line of the form is a row, a box left of its label; columns
 * as many as the widest line (2 on phones).
 */
function OptionGrid({
  rows,
  parts,
  control,
}: {
  rows: number[]
  parts: Question['parts']
  control: (f: FieldDef) => ReactNode
}) {
  const starts = new Set(rows.map((_, i) => rows.slice(0, i).reduce((a, b) => a + b, 0)))
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      style={{ '--cols': Math.max(...rows) } as CSSProperties}
    >
      {parts.map(({ field, name }, i) => (
        <div
          key={field.id}
          className={`flex min-w-0 items-center gap-2 text-[13px] text-ink-2 lg:text-[14.5px] ${starts.has(i) ? 'sm:col-start-1' : ''}`}
        >
          <div className="relative h-6 w-6 shrink-0 [container-type:size] lg:h-7 lg:w-7">{control(field)}</div>
          {/* The control is its own <label>: a click on the name ticks the box the same way. */}
          <span
            className="min-w-0 cursor-pointer break-words"
            onClick={(e) => e.currentTarget.parentElement?.querySelector('input')?.click()}
          >
            {name}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A table as on the document: its column names over the rows, each row's name on its left when it has one. */
function TableGrid({ q, control }: { q: Question; control: (f: FieldDef) => ReactNode }) {
  const rows = q.rows!.map((n, i) => q.parts.slice(q.rows!.slice(0, i).reduce((a, b) => a + b, 0)).slice(0, n))
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-x-2 border-spacing-y-1.5 text-left">
        <thead className={q.columns!.some(Boolean) ? '' : 'sr-only'}>
          <tr>
            {q.rowNames && <th />}
            {q.columns!.map((c, i) => (
              <th key={i} scope="col" className="min-w-32 px-0 text-[12px] font-medium text-muted lg:text-[13.5px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row[0].field.id}>
              {q.rowNames && (
                <th
                  scope="row"
                  className="w-px pr-2 text-[12.5px] font-semibold whitespace-nowrap text-ink-2 lg:text-[14px]"
                >
                  {q.rowNames[r]}
                </th>
              )}
              {/* Controls are size containers (no width of their own): each cell gets a minimum width. */}
              {row.map(({ field }) => (
                <td key={field.id} className="p-0 align-middle">
                  <div
                    className={`relative [container-type:size] ${field.type === 'checkbox' ? 'h-7 w-7' : `${field.type === 'textarea' ? 'h-16' : 'h-9 lg:h-10'} w-full min-w-32`}`}
                  >
                    {control(field)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A titled block of filters in the Filters panel. */
function FilterSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-line-soft pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 text-[13px] font-semibold text-ink">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}
