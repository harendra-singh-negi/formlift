import { Paperclip, PenLine } from 'lucide-react'
import { useRef, useState } from 'react'
import Button from '../ui/Button'
import { inputClass } from '../ui/FormField'
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal'
import SignaturePad from '../ui/SignaturePad'
import type { AnswerValue, FieldDef, FieldType } from '../../core/form-logic'

// Text scales with the field's box (container query height), so it zooms with the page.
const box =
  'h-full w-full rounded-sm border bg-primary-soft/70 px-1 text-[clamp(8px,62cqh,15px)] text-navy outline-none focus:border-primary focus:bg-white disabled:cursor-not-allowed'

/** A PNG data URL (the signature pad's drawing) as a file to upload. */
function pngFile(dataUrl: string, name: string) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name.replace(/[\\/:*?"<>|]/g, '_'), { type: 'image/png' })
}

// Typed in the full-size box on phones. 16 px text: iOS zooms the page into any smaller input it focuses.
const SHEET_TYPES: FieldType[] = ['text', 'textarea', 'number', 'date', 'email', 'phone', 'radio']
const INPUT_TYPE: Partial<Record<FieldType, string>> = { number: 'number', date: 'date', email: 'email', phone: 'tel' }

function SheetInput({
  field,
  text,
  onChange,
  onDone,
}: {
  field: FieldDef
  text: string
  onChange: (v: AnswerValue) => void
  onDone: () => void
}) {
  if (field.type === 'radio')
    return (
      <div role="radiogroup" aria-label={field.label || field.key} className="flex flex-col gap-1">
        {(field.options ?? []).map((o) => (
          <label
            key={o}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 text-base"
          >
            <input
              type="radio"
              className="h-5 w-5 accent-primary"
              name={`sheet-${field.id}`}
              checked={text === o}
              onChange={() => {
                onChange(o)
                onDone()
              }}
            />
            {o}
          </label>
        ))}
      </div>
    )
  if (field.type === 'textarea')
    return (
      <textarea
        autoFocus
        aria-label={field.label || field.key}
        className={`${inputClass} min-h-40 !text-base`}
        placeholder={field.placeholder}
        value={text}
        maxLength={field.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  return (
    <input
      autoFocus
      aria-label={field.label || field.key}
      type={INPUT_TYPE[field.type] ?? 'text'}
      className={`${inputClass} h-11 !text-base`}
      placeholder={field.placeholder}
      value={text}
      min={field.min}
      max={field.max}
      maxLength={field.maxLength}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onDone()}
    />
  )
}

/**
 * One answer control drawn inside its box on the page. `error` outlines it red; the message shows as a tooltip
 * and in the page's error list.
 */
export default function FieldControl({
  field,
  value,
  onChange,
  readOnly,
  error,
  fileName,
  onFile,
  onOpenFile,
  signatureSrc,
  compact,
}: {
  field: FieldDef
  value: AnswerValue | undefined
  onChange: (v: AnswerValue) => void
  readOnly?: boolean
  error?: string
  fileName?: string
  onFile?: (file: File) => void
  onOpenFile?: () => void
  /** Image of a stored signature (the answer is its file id); signatures from before are data URLs. */
  signatureSrc?: string
  /** Phone / touch: typed answers open in a full-size box (the page's boxes are too small to type in). */
  compact?: boolean
}) {
  const [signing, setSigning] = useState(false)
  const [editing, setEditing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const border = error ? 'border-danger' : 'border-primary/40'
  const common = {
    'aria-label': field.label || field.key,
    'aria-invalid': !!error,
    title: error || field.helpText || field.label,
    disabled: readOnly,
  }
  const text = typeof value === 'string' ? value : ''

  if (compact && !readOnly && SHEET_TYPES.includes(field.type)) {
    const name = field.label || field.key
    return (
      <>
        <button
          type="button"
          {...common}
          onClick={() => setEditing(true)}
          className={`${box} ${border} flex cursor-pointer overflow-hidden text-left leading-tight ${
            field.type === 'textarea' ? 'items-start py-0.5 text-[clamp(8px,14cqh,15px)]' : 'items-center'
          }`}
        >
          <span className={`min-w-0 ${field.type === 'textarea' ? 'line-clamp-[8] whitespace-pre-wrap' : 'truncate'}`}>
            {text || <span className="text-faint">{field.placeholder || ''}</span>}
          </span>
        </button>
        {editing && (
          <Modal onClose={() => setEditing(false)} width="w-[480px]">
            <ModalHeader title={name} onClose={() => setEditing(false)} />
            <ModalBody>
              <SheetInput field={field} text={text} onChange={onChange} onDone={() => setEditing(false)} />
              {field.helpText && <p className="mt-2 mb-0 text-[13px] text-muted">{field.helpText}</p>}
              {error && <p className="mt-2 mb-0 text-[13px] text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <Button onClick={() => setEditing(false)}>Done</Button>
            </ModalFooter>
          </Modal>
        )}
      </>
    )
  }

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          {...common}
          className={`${box} ${border} resize-none py-0.5 text-[clamp(8px,14cqh,15px)]`}
          placeholder={field.placeholder}
          value={text}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'dropdown':
      return (
        <select {...common} className={`${box} ${border}`} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.placeholder || ''}</option>
          {(field.options ?? []).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      )
    case 'radio':
      return (
        <div
          role="radiogroup"
          {...common}
          className={`flex h-full w-full flex-wrap items-center gap-x-3 rounded-sm border px-1 text-[clamp(8px,55cqh,14px)] ${border} bg-primary-soft/50`}
        >
          {(field.options ?? []).map((o) => (
            <label key={o} className="inline-flex cursor-pointer items-center gap-1">
              <input
                type="radio"
                className="accent-primary"
                name={field.id}
                checked={text === o}
                disabled={readOnly}
                onChange={() => onChange(o)}
              />
              {o}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return (
        <label
          className={`flex h-full w-full items-center justify-center rounded-sm border ${border} bg-primary-soft/50`}
        >
          <input
            type="checkbox"
            {...common}
            className="h-[min(80cqh,80cqw)] w-[min(80cqh,80cqw)] cursor-pointer accent-primary"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        </label>
      )
    case 'signature':
      return (
        <>
          <button
            type="button"
            {...common}
            onClick={() => setSigning(true)}
            className={`flex h-full w-full cursor-pointer items-center justify-center rounded-sm border ${border} bg-primary-soft/50 disabled:cursor-default`}
          >
            {text ? (
              <img
                src={text.startsWith('data:') ? text : signatureSrc}
                alt="Signature"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="inline-flex items-center gap-1 text-[clamp(8px,45cqh,13px)] text-primary">
                <PenLine size={12} /> Sign
              </span>
            )}
          </button>
          {signing && (
            <Modal onClose={() => setSigning(false)} width="w-[640px]">
              <ModalHeader title={`Sign: ${field.label || field.key}`} onClose={() => setSigning(false)} />
              <ModalBody>
                <SignaturePad
                  onCancel={() => setSigning(false)}
                  onSave={(url) => {
                    // Stored as a PNG file (the answer gets its id); without an upload (editor preview) kept as is.
                    if (onFile) onFile(pngFile(url, `Signature - ${field.label || field.key}.png`))
                    else onChange(url)
                    setSigning(false)
                  }}
                />
              </ModalBody>
            </Modal>
          )}
        </>
      )
    case 'file':
      return (
        <div className={`flex h-full w-full items-center gap-1 rounded-sm border px-1 ${border} bg-primary-soft/50`}>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile?.(f)
              e.target.value = ''
            }}
          />
          {value && (
            <button
              type="button"
              onClick={onOpenFile}
              className="min-w-0 flex-1 cursor-pointer truncate text-left text-[clamp(8px,50cqh,13px)] text-primary underline"
            >
              {fileName || 'Attached file'}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              {...common}
              onClick={() => fileInput.current?.click()}
              className="inline-flex flex-none cursor-pointer items-center gap-1 text-[clamp(8px,50cqh,13px)] text-primary"
            >
              <Paperclip size={12} /> {value ? 'Replace' : 'Attach'}
            </button>
          )}
        </div>
      )
    default: {
      const type = INPUT_TYPE[field.type] ?? 'text'
      return (
        <input
          {...common}
          type={type}
          className={`${box} ${border}`}
          placeholder={field.placeholder}
          value={text}
          min={field.min}
          max={field.max}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
  }
}
