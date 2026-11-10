import type { ReactNode } from 'react'
import Button from './Button'

interface ModalProps {
  children: ReactNode
  onClose: () => void
  /** Tailwind width class, e.g. 'w-[560px]' */
  width: string
}

// Centered dialog over a dimmed backdrop; a click on the backdrop calls onClose.
export default function Modal({ children, onClose, width }: ModalProps) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-[rgba(15,23,42,0.45)]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className={`${width} max-w-[calc(100vw-32px)] rounded-[10px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.25)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** Title and × (disabled while e.g. an upload runs). */
export const ModalHeader = ({
  title,
  onClose,
  disabled,
}: {
  title: string
  onClose: () => void
  disabled?: boolean
}) => (
  <div className="flex items-center justify-between border-b border-line px-5 py-4">
    <h3 className="m-0 text-[17px] font-semibold">{title}</h3>
    <button
      type="button"
      aria-label="Close"
      disabled={disabled}
      onClick={onClose}
      className="cursor-pointer text-2xl leading-none text-muted enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      ×
    </button>
  </div>
)

export const ModalBody = ({ children }: { children: ReactNode }) => (
  <div className="space-y-4 px-5 py-4 text-[13.5px]">{children}</div>
)

/** Buttons, right-aligned. */
export const ModalFooter = ({ children }: { children: ReactNode }) => (
  <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{children}</div>
)

/** "Are you sure…?" with Yes / No. */
export function ConfirmModal({
  children,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
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
  return (
    <Modal onClose={onCancel} width="w-[420px]">
      <div className="px-6 pt-7 pb-6 text-sm">{children}</div>
      <ModalFooter>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
