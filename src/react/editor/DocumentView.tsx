// The document: its pages, with the admin's layout items and fields on top (moved and resized by dragging), the
// original text lines to click in Edit text, and the answer controls in Preview.

import { applyAnswer } from '../../core/form-logic'
import { boxStyle } from '../../core/coords'
import { AnswerControl } from '../components/FieldControl'
import LayoutElementView from '../components/LayoutElementView'
import PdfPages from '../components/PdfPages'
import { toolName, typeName } from '../labels'
import { DRAG_TYPE, type EditorScreen } from './useEditorScreen'

export default function DocumentView({ ui }: { ui: EditorScreen }) {
  const {
    pdfSource, components, stickyPanels, L, ed, fields, layout, selection, preview, armed, snapOn, editText,
    setDrawer, compact, setLoadError, scroller, zoom, fitRef, previewStates, previewAnswers, pageHeight,
  } = ui
  return (
    <>
      {/* Document */}
      <div
        ref={(n) => {
          scroller.current = n
          fitRef(n)
        }}
        className={`min-w-0 flex-1 bg-hover ${stickyPanels ? 'overflow-auto' : 'overflow-x-auto'}`}
        onPointerDown={() => {
          if (!preview) ed.setSelection(null)
          setDrawer(null)
        }}
      >
        <PdfPages
          load={pdfSource}
          zoom={zoom}
          pages={layout?.pages}
          withText={editText && !preview}
          onLoaded={ed.onPdfLoaded}
          onError={() => setLoadError(L.documentLoadError)}
          overlay={(page, lines) => (
            <div
              className="absolute inset-0"
              style={
                snapOn && !preview
                  ? {
                      backgroundImage:
                        'linear-gradient(to right, color-mix(in srgb, var(--fl-primary) 7%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--fl-primary) 7%, transparent) 1px, transparent 1px)',
                      backgroundSize: '2% 2%',
                    }
                  : undefined
              }
              onDragOver={(e) => !preview && e.preventDefault()}
              onDrop={(e) => {
                const key = e.dataTransfer.getData(DRAG_TYPE)
                if (ed.placeNew(key, page, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
                  e.preventDefault()
              }}
              onClick={(e) => {
                if (!armed || preview) return
                ed.placeNew(armed, page, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
                ed.setArmed(null)
              }}
            >
              {/* Original text lines (Edit text): a click replaces the line with an editable copy. */}
              {lines?.map((line, i) => (
                <button
                  key={i}
                  type="button"
                  title={L.editLine(line.text)}
                  className="absolute cursor-text rounded-[1px] outline-1 outline-folder/60 hover:bg-folder/25 hover:outline-folder"
                  style={boxStyle({ page, ...line })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => ed.editLine(line, page)}
                />
              ))}

              {layout?.elements
                .filter((el) => el.page === page)
                .map((el) =>
                  preview ? (
                    <LayoutElementView key={el.id} element={el} pageHeight={pageHeight(page)} />
                  ) : (
                    <div
                      key={el.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${toolName(L, el.type)} ${el.text ?? ''}`}
                      className={`absolute cursor-move touch-none select-none ${
                        selection?.id === el.id
                          ? 'z-10 outline-2 outline-primary'
                          : 'hover:outline-1 hover:outline-primary/50'
                      }`}
                      style={boxStyle({ page, ...el.position, height: Math.max(el.position.height, 0.004) })}
                      onPointerDown={(e) =>
                        ed.startDrag(e, { kind: 'element', id: el.id }, { page, ...el.position }, 'move')
                      }
                      onPointerMove={ed.onDrag}
                      onPointerUp={ed.endDrag}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <LayoutElementView
                        element={el}
                        pageHeight={pageHeight(page)}
                        style={{ left: 0, top: 0, width: '100%', height: '100%' }}
                      />
                      {selection?.id === el.id && (
                        <span
                          aria-label={L.resize}
                          className="absolute -right-1 -bottom-1 h-2.5 w-2.5 cursor-se-resize rounded-sm border border-white bg-primary"
                          onPointerDown={(e) =>
                            ed.startDrag(e, { kind: 'element', id: el.id }, { page, ...el.position }, 'resize')
                          }
                          onPointerMove={ed.onDrag}
                          onPointerUp={ed.endDrag}
                        />
                      )}
                    </div>
                  ),
                )}

              {fields
                .filter((f) => f.position.page === page && !f.dialogOnly)
                .map((f) =>
                  preview ? (
                    previewStates[f.key]?.visible && (
                      <div key={f.id} className="absolute [container-type:size]" style={boxStyle(f.position)}>
                        <AnswerControl
                          components={components}
                          field={f}
                          value={previewAnswers[f.key]}
                          readOnly={previewStates[f.key].readOnly}
                          compact={compact}
                          onChange={(v) => ed.setPreviewAnswers((a) => applyAnswer(fields, a, f, v))}
                        />
                      </div>
                    )
                  ) : (
                    <div
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      aria-label={L.fieldOnPage(typeName(L, f.type), f.label || f.key)}
                      title={`${f.label || f.key} (${typeName(L, f.type)})`}
                      className={`absolute cursor-move touch-none rounded-sm border text-[10px] select-none [container-type:size] ${
                        selection?.id === f.id
                          ? 'z-10 border-primary bg-primary/20 ring-2 ring-primary/40'
                          : f.source === 'ai'
                            ? 'border-dashed border-folder bg-folder/15'
                            : 'border-primary/60 bg-primary/10 hover:bg-primary/15'
                      }`}
                      style={boxStyle(f.position)}
                      onPointerDown={(e) => ed.startDrag(e, { kind: 'field', id: f.id }, f.position, 'move')}
                      onPointerMove={ed.onDrag}
                      onPointerUp={ed.endDrag}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="pointer-events-none block truncate px-0.5 text-[clamp(7px,55cqh,12px)] leading-tight text-primary">
                        {f.label || f.key}
                        {f.required && <b className="text-danger"> *</b>}
                      </span>
                      {selection?.id === f.id && (
                        <span
                          aria-label={L.resize}
                          className="absolute -right-1 -bottom-1 h-2.5 w-2.5 cursor-se-resize rounded-sm border border-white bg-primary"
                          onPointerDown={(e) => ed.startDrag(e, { kind: 'field', id: f.id }, f.position, 'resize')}
                          onPointerMove={ed.onDrag}
                          onPointerUp={ed.endDrag}
                        />
                      )}
                    </div>
                  ),
                )}
            </div>
          )}
        />
      </div>
    </>
  )
}
