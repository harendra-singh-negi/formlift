import { useState, type CSSProperties, type ReactNode } from 'react'
import { useEscapeLayer } from './useOutsideClose'
import { createPortal } from 'react-dom'
import Button from './Button'
import { useLabels } from '../labels'

interface ModalProps {
  children: ReactNode
  onClose: () => void
  /** Tailwind width class, e.g. 'w-[560px]' */
  width: string
  /** The dialog's accessible name (usually its heading). */
  label?: string
}

// Keep in step with the --fl-* variables in style.css (a test checks it).
export const THEME_VARS = [
  '--fl-font', '--fl-primary', '--fl-primary-hover', '--fl-primary-soft', '--fl-primary-tint', '--fl-brand',
  '--fl-brand-hover', '--fl-success', '--fl-success-hover', '--fl-danger', '--fl-heading', '--fl-heading-hover',
  '--fl-ink', '--fl-ink-2', '--fl-ink-3', '--fl-muted', '--fl-faint', '--fl-line', '--fl-line-strong',
  '--fl-line-soft', '--fl-hover', '--fl-surface', '--fl-accent', '--fl-z-modal',
]

// The host's theme, read where the modal opens and carried into the portal (variables set on a parent of the
// editor would not reach document.body).
const themeVars = (el: Element): CSSProperties => {
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const name of THEME_VARS) {
    const v = cs.getPropertyValue(name)
    if (v) out[name] = v
  }
  return out
}

// Centered dialog over a dimmed backdrop; a click on the backdrop or Escape calls onClose. Rendered into
// document.body (or the shadow root the editor lives in, whose styles it needs), so a transformed or clipping host
// ancestor can't misplace or cut it.
export default function Modal({ children, onClose, width, label }: ModalProps) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null)
  useEscapeLayer(true, onClose)
  const root = anchor?.getRootNode()
  return (
    <span ref={setAnchor} hidden>
      {anchor &&
        createPortal(
          <div className="fl-root" style={themeVars(anchor)}>
            <Backdrop onClose={onClose} width={width} label={label}>
              {children}
            </Backdrop>
          </div>,
          root instanceof ShadowRoot ? root : document.body,
        )}
    </span>
  )
}

function Backdrop({ children, onClose, width, label }: ModalProps) {
  return (
    <div className="fixed inset-0 z-[var(--fl-z-modal)] flex items-center justify-center bg-[rgba(15,23,42,0.45)]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={label}
        className={`${width} max-w-[calc(100vw-32px)] rounded-[10px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.25)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** Title and × (disabled while e.g. an upload runs). */
export function ModalHeader({ title, onClose, disabled }: { title: string; onClose: () => void; disabled?: boolean }) {
  const L = useLabels()
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-4">
      <h3 className="m-0 text-[17px] font-semibold">{title}</h3>
      <button
        type="button"
        aria-label={L.close}
        disabled={disabled}
        onClick={onClose}
        className="cursor-pointer text-2xl leading-none text-muted enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        ×
      </button>
    </div>
  )
}

export const ModalBody = ({ children }: { children: ReactNode }) => (
  <div className="space-y-4 px-5 py-4 text-[13.5px]">{children}</div>
)

/** Buttons, right-aligned. */
export const ModalFooter = ({ children }: { children: ReactNode }) => (
  <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{children}</div>
)

/** "Are you sure…?" with Yes / No (labels `yes` / `no` by default). */
export function ConfirmModal({
  children,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button (deletes). */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const L = useLabels()
  return (
    <Modal onClose={onCancel} width="w-[420px]">
      <div className="px-6 pt-7 pb-6 text-sm">{children}</div>
      <ModalFooter>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel ?? L.no}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel ?? L.yes}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
