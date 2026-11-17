// The tools to drag onto a page (or tap, then tap the page): fields and layout items. A column on large screens, a
// drawer from the left below lg.

import type { FieldType } from '../../core/form-logic'
import type { ElementTool } from '../../core/layout'
import { toolName, typeName } from '../labels'
import { PanelHeading } from '../ui/slots'
import type { EditorScreen } from './useEditorScreen'

export default function Toolbox({ ui }: { ui: EditorScreen }) {
  const { shows, L, ed, preview, drawer, toolItem } = ui
  return (
    <>
      {/* Toolbox: a column on large screens, a drawer from the left below lg. */}
      {!preview && shows('tools') && (
        <aside
          className={`w-[170px] flex-none overflow-y-auto border-r border-line bg-white max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:w-[220px] max-lg:shadow-xl ${
            drawer === 'tools' ? '' : 'max-lg:hidden'
          }`}
        >
          {shows('fieldTools') && ed.fieldTools.length > 0 && (
            <>
              <PanelHeading>{L.fieldsHeading}</PanelHeading>
              <p className="m-0 px-3 pt-2 text-[11.5px] text-muted">
                {L.dragHint}
              </p>
              <div className="space-y-1 p-2">
                {ed.fieldTools.map((k) => toolItem(k, typeName(L, k.slice(6) as FieldType)))}
              </div>
            </>
          )}
          {shows('layoutTools') && ed.elementTools.length > 0 && (
            <>
              <PanelHeading>{L.layoutHeading}</PanelHeading>
              <div className="space-y-1 p-2">
                {ed.elementTools.map((k) => toolItem(k, toolName(L, k.slice(8) as ElementTool)))}
              </div>
            </>
          )}
        </aside>
      )}
    </>
  )
}
