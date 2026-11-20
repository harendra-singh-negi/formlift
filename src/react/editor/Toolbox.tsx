// The tools to drag onto a page (or tap, then tap the page): fields and layout items. A column on large screens, a
// drawer from the left below lg.

import { useState } from 'react'
import type { FieldType } from '../../core/form-logic'
import type { ElementTool } from '../../core/layout'
import { toolName, typeName } from '../labels'
import { PanelHeading, TextInput } from '../ui/slots'
import type { EditorScreen } from './useEditorScreen'

export default function Toolbox({ ui }: { ui: EditorScreen }) {
  const { shows, L, ed, preview, drawer, toolItem } = ui
  // Search: the tools whose name (or type, "url") has what is typed.
  const [q, setQ] = useState('')
  const has = (name: string, type: string) => `${name} ${type}`.toLowerCase().includes(q.trim().toLowerCase())
  const fieldTools = ed.fieldTools.map((k) => [k, typeName(L, k.slice(6) as FieldType)] as const).filter(([k, n]) => has(n, k.slice(6)))
  const elementTools = ed.elementTools.map((k) => [k, toolName(L, k.slice(8) as ElementTool)] as const).filter(([k, n]) => has(n, k.slice(8)))
  return (
    <>
      {/* Toolbox: a column on large screens, a drawer from the left below lg. */}
      {!preview && shows('tools') && (
        <aside
          className={`w-[170px] flex-none overflow-y-auto border-r border-line bg-white max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:w-[220px] max-lg:shadow-xl ${
            drawer === 'tools' ? '' : 'max-lg:hidden'
          }`}
        >
          <div className="sticky top-0 z-10 border-b border-line bg-white p-2">
            <TextInput type="search" value={q} placeholder={L.searchTools} aria-label={L.searchTools} onChange={(e) => setQ(e.target.value)} />
          </div>
          {q && !fieldTools.length && !elementTools.length && <p className="m-0 px-3 pt-2 text-[12px] text-muted">{L.noTools}</p>}
          {shows('fieldTools') && fieldTools.length > 0 && (
            <>
              <PanelHeading>{L.fieldsHeading}</PanelHeading>
              <p className="m-0 px-3 pt-2 text-[11.5px] text-muted">
                {L.dragHint}
              </p>
              <div className="space-y-1 p-2">
                {fieldTools.map(([k, n]) => toolItem(k, n))}
              </div>
            </>
          )}
          {shows('layoutTools') && elementTools.length > 0 && (
            <>
              <PanelHeading>{L.layoutHeading}</PanelHeading>
              <div className="space-y-1 p-2">
                {elementTools.map(([k, n]) => toolItem(k, n))}
              </div>
            </>
          )}
        </aside>
      )}
    </>
  )
}
