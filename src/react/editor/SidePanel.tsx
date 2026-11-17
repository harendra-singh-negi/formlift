// The right panel: the selection's properties, the fill order of the fields, the pages, what auto-detect learnt,
// and your own tabs. A column on large screens, a drawer from the right below lg.

import { Copy, Trash2 } from 'lucide-react'
import { Fragment } from 'react'
import ElementProperties from '../components/ElementProperties'
import FieldOrderList from '../components/FieldOrderList'
import FieldProperties from '../components/FieldProperties'
import LearntPanel from '../components/LearntPanel'
import PagesPanel from '../components/PagesPanel'
import { toolName } from '../labels'
import { EmptyText, IconButton, PanelHeading, SegmentedTabs } from '../ui/slots'
import type { EditorScreen } from './useEditorScreen'

export default function SidePanel({ ui }: { ui: EditorScreen }) {
  const {
    tabs, options, shows, L, panelTabs, tab, setTab, ed, fields, layout, pageCount, selection, selectedField,
    selectedElement, drawer, setConfirmDeletePage, goToPage, counts, why, taught,
  } = ui
  return (
    <>
      {/* Right panel: a column on large screens, a drawer from the right below lg. */}
      {shows('panel') && panelTabs.length > 0 && (
        <aside
          className={`flex w-[350px] flex-none flex-col border-l border-line bg-white max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-[min(350px,92vw)] max-lg:shadow-xl ${
            drawer === 'panel' ? '' : 'max-lg:hidden'
          }`}
        >
          <div className="overflow-x-auto border-b border-line p-2 [&_button]:px-2.5">
            <SegmentedTabs
              options={[
                { value: 'props', label: L.propertiesTab },
                { value: 'fields', label: L.fieldsTab(fields.length) },
                { value: 'pages', label: L.pagesTab(pageCount) },
                { value: 'learnt', label: L.learntTab },
                ...tabs.map((t) => ({ value: t.id, label: t.label })),
              ].filter((o) => panelTabs.includes(o.value))}
              value={tab}
              onChange={setTab}
            />
          </div>
          {ed.problems.length > 0 && shows('problems') && (
            <ul className="m-0 border-b border-danger/30 bg-danger/5 py-2 pr-3 pl-7 text-[12px] text-danger">
              {ed.problems.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto" data-fl-scroll>
            {tab === 'props' && (
              <>
                <PanelHeading
                  actions={
                    selection && (
                      <>
                        <IconButton
                          icon={Copy}
                          title={L.duplicate}
                          light
                          iconSize={16}
                          onClick={ed.duplicateSelected}
                        />
                        <IconButton
                          icon={Trash2}
                          title={L.deleteSelected}
                          light
                          iconSize={16}
                          onClick={ed.removeSelected}
                        />
                      </>
                    )
                  }
                >
                  {selectedField
                    ? L.fieldHeading
                    : selectedElement
                      ? toolName(L, selectedElement.type).toUpperCase()
                      : L.propertiesHeading}
                </PanelHeading>
                {selectedField ? (
                  <FieldProperties
                    key={selectedField.id}
                    field={selectedField}
                    fields={fields}
                    pageCount={pageCount}
                    onChange={ed.updateField}
                    onFieldsChange={ed.setFields}
                    onSelect={(id) => ed.setSelection({ kind: 'field', id })}
                    rules={options.rules}
                    onForget={why && (() => ed.forget(why))}
                    taught={taught}
                  />
                ) : selectedElement ? (
                  <ElementProperties
                    key={selectedElement.id}
                    element={selectedElement}
                    pageCount={pageCount}
                    onChange={ed.updateElement}
                  />
                ) : (
                  <EmptyText>
                    {L.nothingSelected.split(L.editText).map((part, i) => (
                      <Fragment key={i}>
                        {i > 0 && <b>{L.editText}</b>}
                        {part}
                      </Fragment>
                    ))}
                  </EmptyText>
                )}
              </>
            )}

            {tab === 'fields' && (
              <>
                <PanelHeading>{L.fillOrderHeading}</PanelHeading>
                {!fields.length && <EmptyText>{L.noFields}</EmptyText>}
                <FieldOrderList
                  fields={fields}
                  selectedId={selection?.id}
                  onPick={(f) => {
                    ed.setSelection({ kind: 'field', id: f.id })
                    goToPage(f.position.page)
                  }}
                  onMove={ed.reorderField}
                />
              </>
            )}

            {tab === 'pages' &&
              (layout ? (
                <PagesPanel
                  pages={layout.pages}
                  counts={counts}
                  onGoTo={goToPage}
                  onMove={ed.movePage}
                  onInsertBlank={ed.insertBlankPage}
                  onDelete={(n) => (counts[n] ? setConfirmDeletePage(n) : ed.deletePage(n))}
                />
              ) : (
                <EmptyText>{L.loadingPages}</EmptyText>
              ))}

            {tab === 'learnt' && ed.learnt && <LearntPanel learnt={ed.learnt} onForget={ed.forget} />}

            {tabs.find((t) => t.id === tab)?.content}
          </div>
        </aside>
      )}
    </>
  )
}
