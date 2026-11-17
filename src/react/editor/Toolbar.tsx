// The editor's toolbar (back, panels on small screens, title, status, undo, snap, zoom, Edit text, Auto-detect,
// Preview, Save, your own items), your banner, and the status lines under it (detecting, placing a tool, Edit text).

import { ArrowLeft, Eye, Grid3x3, PanelRight, Pencil, Plus, Redo2, Save, Type, Undo2, Wand2 } from 'lucide-react'
import ZoomControls from '../components/ZoomControls'
import { Button, IconButton } from '../ui/slots'
import type { EditorScreen } from './useEditorScreen'

export default function Toolbar({ ui }: { ui: EditorScreen }) {
  const {
    title, onBack, toolbar, banner, zoomSteps, stickyToolbar, shows, L, ed, layout, selection, preview, armed, snapOn,
    editText, drawer, setDrawer, zoom, setZoom, armedLabel,
  } = ui
  return (
    <>
      {/* Toolbar */}
      <div
        className={`flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2.5 max-sm:px-3 max-sm:py-2 ${stickyToolbar ? 'sticky top-0 z-20' : ''}`}
      >
        {onBack && shows('back') && (
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
            {L.back}
          </Button>
        )}
        {!preview && shows('tools') && (
          <Button
            variant={drawer === 'tools' ? 'primary' : 'secondary'}
            size="sm"
            icon={Plus}
            className="lg:hidden"
            onClick={() => setDrawer((d) => (d === 'tools' ? null : 'tools'))}
          >
            {L.add}
          </Button>
        )}
        {shows('panel') && (
          <Button
            variant={drawer === 'panel' ? 'primary' : 'secondary'}
            size="sm"
            icon={PanelRight}
            className="lg:hidden"
            onClick={() => setDrawer((d) => (d === 'panel' ? null : 'panel'))}
          >
            {selection ? L.properties : L.panel}
          </Button>
        )}
        {title != null && shows('title') && (
          <h2 className="m-0 min-w-0 truncate text-[17px] font-semibold max-sm:flex-1 max-sm:text-[15px]">{title}</h2>
        )}
        {shows('status') && (
          // phones: the Save button being enabled already says "unsaved"
          <span className="text-[12px] text-muted max-sm:hidden">{ed.dirty ? L.unsavedChanges : L.allChangesSaved}</span>
        )}
        {/* phones: one row that scrolls sideways instead of wrapping into several */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:flex-nowrap max-sm:overflow-x-auto">
          {shows('undo') && (
            <>
              <IconButton icon={Undo2} title={L.undo} disabled={!ed.canUndo || preview} onClick={ed.undo} />
              <IconButton icon={Redo2} title={L.redo} disabled={!ed.canRedo || preview} onClick={ed.redo} />
            </>
          )}
          {shows('snap') && (
            <IconButton
              icon={Grid3x3}
              title={snapOn ? L.snapOn : L.snapOff}
              className={snapOn ? '!text-primary' : ''}
              onClick={() => ed.setSnapOn(!snapOn)}
            />
          )}
          {shows('zoom') && (
            <div className="max-sm:hidden">
              <ZoomControls zoom={zoom} onChange={setZoom} steps={zoomSteps} />
            </div>
          )}
          {!preview && shows('editText') && (
            <Button
              variant={editText ? 'primary' : 'secondary'}
              size="sm"
              icon={Type}
              disabled={!layout}
              title={L.editTextHint}
              onClick={() => ed.setEditText(!editText)}
            >
              <span className="max-sm:hidden">{L.editText}</span>
            </Button>
          )}
          {!preview && shows('autoDetect') && (
            <Button
              variant="secondary"
              size="sm"
              icon={Wand2}
              disabled={!ed.pdf || !layout || !!ed.detecting}
              title={L.autoDetectHint}
              onClick={() => void ed.detect()}
            >
              <span className="max-sm:hidden">{L.autoDetect}</span>
            </Button>
          )}
          {shows('preview') && (
            <Button
              variant="secondary"
              size="sm"
              icon={preview ? Pencil : Eye}
              title={preview ? L.backToEditing : L.preview}
              onClick={() => ed.setPreview(!preview)}
            >
              <span className="max-sm:hidden">{preview ? L.edit : L.preview}</span>
            </Button>
          )}
          {shows('save') && (
            <Button
              size="sm"
              icon={Save}
              title={L.save}
              className="max-sm:ml-auto"
              disabled={!ed.dirty || ed.busy}
              onClick={() => void ed.save()}
            >
              <span className="max-sm:hidden">{L.save}</span>
            </Button>
          )}
          {toolbar}
        </div>
      </div>
      {banner}
      {ed.detecting && (
        <div className="flex items-center gap-3 bg-folder/15 px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
          {L.detecting(ed.detecting.done, ed.detecting.total)}
          <div className="h-1.5 w-40 overflow-hidden rounded bg-white">
            <div
              className="h-full bg-folder"
              style={{ width: `${(100 * ed.detecting.done) / Math.max(1, ed.detecting.total)}%` }}
            />
          </div>
          <button
            type="button"
            className="cursor-pointer text-primary hover:underline"
            onClick={() => ed.detecting?.stop.abort()}
          >
            {L.stop}
          </button>
        </div>
      )}
      {armed && !preview && (
        <p className="m-0 flex items-center gap-3 bg-primary-soft px-4 py-1.5 text-[12.5px] text-ink-2" role="status">
          {L.tapToPlace(armedLabel)}
          <button
            type="button"
            className="cursor-pointer text-primary hover:underline"
            onClick={() => ed.setArmed(null)}
          >
            {L.cancel}
          </button>
        </p>
      )}
      {editText && (
        <p className="m-0 bg-folder/15 px-4 py-1.5 text-[12.5px] text-ink-2">
          {L.editTextBanner}
        </p>
      )}
    </>
  )
}
