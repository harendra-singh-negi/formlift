import type { FormliftComponents } from '../ui/slots'
import { Camera, Check, Paperclip, PenLine, Star } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  answerText,
  fileIds,
  perRowOf,
  multiAnswer,
  multiValue,
  rangeOf,
  type AnswerValue,
  type FieldDef,
  type FieldType,
} from '../../core/form-logic'
import { useLabels } from '../labels'
import { Button, inputClass, Modal, ModalBody, ModalFooter, ModalHeader, SignaturePad } from '../ui/slots'

// Text scales with the field's box (container query height), so it zooms with the page.
const boxText = 'text-[clamp(8px,62cqh,15px)]'
const boxBase =
  'h-full w-full rounded-sm border bg-primary-soft/70 px-1 text-navy outline-none focus:border-primary focus:bg-white disabled:cursor-not-allowed'
const box = `${boxBase} ${boxText}`
// A date or time shows its whole format ("dd / mm / yyyy" and its calendar button) in a narrow box too: its text
// also scales with the box's width.
const FIT_TEXT: Partial<Record<FieldType, string>> = {
  date: 'text-[length:clamp(8px,min(62cqh,10.5cqw),15px)]',
  time: 'text-[length:clamp(8px,min(62cqh,14cqw),15px)]',
  datetime: 'text-[length:clamp(8px,min(62cqh,6.5cqw),15px)]',
}

/** A phone or tablet: file fields also offer the camera. */
const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/** A PNG data URL (the signature pad's drawing) as a file to upload. */
function pngFile(dataUrl: string, name: string) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name.replace(/[\\/:*?"<>|]/g, '_'), { type: 'image/png' })
}

// Typed in the full-size box on phones. 16 px text: iOS zooms the page into any smaller input it focuses.
const SHEET_TYPES: FieldType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'email',
  'phone',
  'radio',
  'time',
  'datetime',
  'url',
  'currency',
]
const INPUT_TYPE: Partial<Record<FieldType, string>> = {
  number: 'number',
  date: 'date',
  email: 'email',
  phone: 'tel',
  time: 'time',
  datetime: 'datetime-local',
  url: 'url',
}

/** Every option with a checkbox: a checklist, or a multi-select's choices in its dialog. */
function OptionChecks({
  field,
  value,
  onChange,
  big,
  disabled,
}: {
  field: FieldDef
  value: AnswerValue | undefined
  onChange: (v: AnswerValue) => void
  /** Finger-sized rows (dialog), else as small as the box on the page. */
  big?: boolean
  disabled?: boolean
}) {
  const chosen = multiValue(value)
  const options = field.options ?? []
  const flip = (o: string) =>
    // kept in the order of the options, whatever order they were ticked in
    onChange(multiAnswer(options.filter((x) => (x === o ? !chosen.includes(o) : chosen.includes(x)))))
  return (
    <div role="group" aria-label={field.label || field.key} className={big ? 'flex flex-col gap-1' : 'contents'}>
      {options.map((o) => (
        <label
          key={o}
          className={
            big
              ? 'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 text-base'
              : 'inline-flex cursor-pointer items-center gap-1'
          }
        >
          <input
            type="checkbox"
            className={`accent-primary ${big ? 'h-5 w-5' : ''}`}
            checked={chosen.includes(o)}
            disabled={disabled}
            onChange={() => flip(o)}
          />
          {o}
        </label>
      ))}
    </div>
  )
}

/** A currency amount: its symbol, then the number. */
function CurrencyInput({
  field,
  text,
  onChange,
  className,
  inputClassName,
  ...rest
}: {
  field: FieldDef
  text: string
  onChange: (v: AnswerValue) => void
  className: string
  inputClassName: string
  autoFocus?: boolean
  disabled?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  'aria-label'?: string
  'aria-invalid'?: boolean
  title?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {field.currency && <span className="flex-none text-muted">{field.currency}</span>}
      <input
        {...rest}
        type="text"
        inputMode={field.decimals === 0 ? 'numeric' : 'decimal'}
        className={`min-w-0 flex-1 bg-transparent outline-none ${inputClassName}`}
        placeholder={field.placeholder}
        value={text}
        // digits and one decimal point only; the check on save does the rest
        onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ''))}
      />
    </div>
  )
}

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
  if (field.type === 'currency')
    return (
      <CurrencyInput
        autoFocus
        aria-label={field.label || field.key}
        field={field}
        text={text}
        onChange={onChange}
        className={`${inputClass} h-11 !text-base`}
        inputClassName=""
        onKeyDown={(e) => e.key === 'Enter' && onDone()}
      />
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

export interface FieldControlProps {
  field: FieldDef
  value: AnswerValue | undefined
  onChange: (v: AnswerValue) => void
  readOnly?: boolean
  error?: string
  fileName?: string
  /** A file field with `multiple`: its files (name per id). */
  files?: { id: string; fileName: string }[]
  onFile?: (file: File) => void
  /** Opens the file; with several, the one with this id. */
  onOpenFile?: (id?: string) => void
  /** A file field with photosPerRow: its photos, shown in the box as the completed PDF will draw them. */
  photos?: { id: string; src: string }[]
  /** A file field with `multiple`: takes this file off. */
  onRemoveFile?: (id: string) => void
  /** Image of a stored signature (the answer is its file id); signatures from before are data URLs. */
  signatureSrc?: string
  /** Phone / touch: typed answers open in a full-size box (the page's boxes are too small to type in). */
  compact?: boolean
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
  files,
  onFile,
  onOpenFile,
  onRemoveFile,
  photos,
  signatureSrc,
  compact,
}: FieldControlProps) {
  const L = useLabels()
  const [signing, setSigning] = useState(false)
  const [editing, setEditing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  // radio names are per document: a field drawn twice (page + a dialog) must not share one
  const radioName = useId()
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
            {answerText(field, value) || <span className="text-faint">{field.placeholder || ''}</span>}
          </span>
        </button>
        {editing && (
          <Modal onClose={() => setEditing(false)} width="w-[480px]" label={name}>
            <ModalHeader title={name} onClose={() => setEditing(false)} />
            <ModalBody>
              <SheetInput field={field} text={text} onChange={onChange} onDone={() => setEditing(false)} />
              {field.helpText && <p className="mt-2 mb-0 text-[13px] text-muted">{field.helpText}</p>}
              {error && <p className="mt-2 mb-0 text-[13px] text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <Button onClick={() => setEditing(false)}>{L.done}</Button>
            </ModalFooter>
          </Modal>
        )}
      </>
    )
  }

  // A multi-select, and a checklist on phones: the choices so far in the box, all options in a dialog.
  if (field.type === 'multiselect' || (field.type === 'checklist' && compact)) {
    const name = field.label || field.key
    const shown = answerText(field, value)
    return (
      <>
        <button
          type="button"
          {...common}
          // read-only still opens, to read every choice (the boxes inside are disabled)
          disabled={readOnly && !shown}
          onClick={() => setEditing(true)}
          className={`${box} ${border} flex cursor-pointer items-center overflow-hidden text-left leading-tight disabled:cursor-default`}
        >
          <span className="min-w-0 truncate">
            {shown || <span className="text-faint">{field.placeholder || L.chooseOptions}</span>}
          </span>
        </button>
        {editing && (
          <Modal onClose={() => setEditing(false)} width="w-[480px]" label={name}>
            <ModalHeader title={name} onClose={() => setEditing(false)} />
            <ModalBody>
              <div className="max-h-[60dvh] overflow-y-auto">
                <OptionChecks field={field} value={value} onChange={onChange} big disabled={readOnly} />
              </div>
              {field.helpText && <p className="mt-2 mb-0 text-[13px] text-muted">{field.helpText}</p>}
              {error && <p className="mt-2 mb-0 text-[13px] text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <Button onClick={() => setEditing(false)}>{L.done}</Button>
            </ModalFooter>
          </Modal>
        )}
      </>
    )
  }

  switch (field.type) {
    case 'checklist':
      return (
        // the group inside carries the name; this box only the tooltip
        <div
          title={common.title}
          aria-invalid={!!error}
          className={`flex h-full w-full flex-wrap content-start items-center gap-x-3 overflow-auto rounded-sm border px-1 text-[clamp(8px,18cqh,14px)] ${border} bg-primary-soft/50`}
        >
          <OptionChecks field={field} value={value} onChange={onChange} disabled={readOnly} />
        </div>
      )
    case 'currency':
      return (
        <CurrencyInput
          {...common}
          field={field}
          text={text}
          onChange={onChange}
          className={`${box} ${border}`}
          inputClassName="h-full"
        />
      )
    case 'rating': {
      const { max } = rangeOf(field)
      const n = Number(text) || 0
      return (
        <div
          role="radiogroup"
          {...common}
          className={`flex h-full w-full items-center gap-[2%] rounded-sm border px-1 ${border} bg-primary-soft/50`}
        >
          {Array.from({ length: max }, (_, i) => i + 1).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={n === k}
              aria-label={L.ratingStar(k, max)}
              disabled={readOnly}
              // a second tap on the chosen star clears it
              onClick={() => onChange(n === k ? null : String(k))}
              className="flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center disabled:cursor-default"
            >
              <Star
                className={`h-[min(80cqh,100%)] w-auto ${k <= n ? 'fill-folder text-folder' : 'text-faint'}`}
              />
            </button>
          ))}
        </div>
      )
    }
    case 'slider': {
      const { min, max, step } = rangeOf(field)
      return (
        <div
          className={`flex h-full w-full items-center gap-2 rounded-sm border px-1 text-[clamp(8px,55cqh,14px)] ${border} bg-primary-soft/50`}
        >
          <input
            {...common}
            type="range"
            className="min-w-0 flex-1 cursor-pointer accent-primary"
            min={min}
            max={max}
            step={step}
            value={text === '' ? min : Number(text)}
            onChange={(e) => onChange(e.target.value)}
            // empty, the thumb already sits on `min`: choosing min itself fires no change, so take it on release
            onPointerUp={(e) => text === '' && onChange(e.currentTarget.value)}
            onKeyUp={(e) => text === '' && onChange(e.currentTarget.value)}
          />
          <span className="min-w-[3ch] flex-none text-right tabular-nums">{text}</span>
        </div>
      )
    }
    case 'toggle':
      return (
        <div className={`flex h-full w-full items-center rounded-sm border px-1 ${border} bg-primary-soft/50`}>
          <button
            type="button"
            role="switch"
            aria-checked={value === true}
            {...common}
            onClick={() => onChange(value !== true)}
            className={`relative h-[min(70cqh,100%)] aspect-[2/1] flex-none cursor-pointer rounded-full transition-colors disabled:cursor-default ${
              value === true ? 'bg-primary' : 'bg-line-strong'
            }`}
          >
            <span
              className={`absolute top-[10%] h-[80%] aspect-square rounded-full bg-white shadow transition-[left] ${
                value === true ? 'left-[55%]' : 'left-[5%]'
              }`}
            />
          </button>
          <span className="ml-1 truncate text-[clamp(8px,55cqh,14px)]">{value === true ? L.yes : L.no}</span>
        </div>
      )
    case 'textarea':
      return (
        <textarea
          {...common}
          className={`${box} ${border} resize-none py-0.5 text-[length:var(--fl-text,clamp(8px,14cqh,15px))] [font-family:var(--fl-font,inherit)] [line-height:var(--fl-lh,normal)]`}
          placeholder={field.placeholder}
          value={text}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'text':
      // A textarea that looks like one line: a long answer wraps and its box grows (FormFiller), as in the PDF.
      return (
        <textarea
          {...common}
          rows={1}
          className={`${box} ${border} resize-none overflow-hidden py-0 text-[length:var(--fl-text,clamp(8px,62cqh,15px))] [font-family:var(--fl-font,inherit)] [line-height:var(--fl-lh,normal)]`}
          placeholder={field.placeholder}
          value={text}
          maxLength={field.maxLength}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, ' '))}
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
                name={radioName}
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
            {text && (text.startsWith('data:') || signatureSrc) ? (
              <img
                src={text.startsWith('data:') ? text : signatureSrc}
                alt={L.signature}
                className="max-h-full max-w-full object-contain"
              />
            ) : text ? (
              // Signed, its picture not at hand (loading, or kept where this page cannot read it).
              <span className="inline-flex items-center gap-1 text-[clamp(8px,45cqh,13px)] text-navy">
                <Check size={12} /> {L.signed}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[clamp(8px,45cqh,13px)] text-primary">
                <PenLine size={12} /> {L.sign}
              </span>
            )}
          </button>
          {signing && (
            <Modal onClose={() => setSigning(false)} width="w-[640px]" label={L.signTitle(field.label || field.key)}>
              <ModalHeader title={L.signTitle(field.label || field.key)} onClose={() => setSigning(false)} />
              <ModalBody>
                <SignaturePad
                  onCancel={() => setSigning(false)}
                  onSave={(url) => {
                    // Stored as a PNG file (the answer gets its id); without an upload (editor preview) kept as is.
                    if (onFile) onFile(pngFile(url, L.signatureFileName(field.label || field.key)))
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
      // Photos: a grid of photosPerRow cells a row (a row per box height), each photo whole in its cell, as the
      // completed PDF draws them. ✕ on each takes it off; the add buttons sit in the corner.
      if (field.photosPerRow && photos?.length) {
        const per = perRowOf(field)
        return (
          <div
            className={`relative grid h-full w-full content-start rounded-sm border ${border} bg-white`}
            style={{ gridTemplateColumns: `repeat(${per}, minmax(0, 1fr))`, gridAutoRows: field.multiple ? 'var(--fl-row, 6rem)' : '100%' }}
          >
            {photos.map((p) => (
              <div key={p.id} className="flex min-h-0 min-w-0 items-center justify-center p-0.5">
                {/* The ✕ sits on the photo's own corner (the photo keeps its shape inside the cell). */}
                <span className="relative inline-flex max-h-full max-w-full">
                  <button type="button" onClick={() => onOpenFile?.(field.multiple ? p.id : undefined)} className="flex max-h-full max-w-full cursor-pointer">
                    <img src={p.src} alt={files?.find((x) => x.id === p.id)?.fileName ?? fileName ?? ''} className="max-h-(--fl-row,6rem) max-w-full object-contain" />
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={L.removeFile(files?.find((x) => x.id === p.id)?.fileName ?? fileName ?? L.attachedFile)}
                      onClick={() => (field.multiple ? onRemoveFile?.(p.id) : onChange(null))}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-[11px] text-ink-2 shadow hover:text-danger"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            ))}
            {!readOnly && (
              <span className="absolute right-0.5 bottom-0.5 inline-flex gap-1.5 rounded bg-white/90 px-1 py-0.5 text-primary shadow-sm">
                {[fileInput, cameraInput].map((ref, i) => (
                  <input
                    key={i}
                    ref={ref}
                    type="file"
                    hidden
                    accept="image/*"
                    {...(i ? { capture: 'environment' as const } : {})}
                    multiple={!i && field.multiple}
                    onChange={(e) => {
                      for (const f of e.target.files ?? []) onFile?.(f)
                      e.target.value = ''
                    }}
                  />
                ))}
                <button type="button" {...common} className="cursor-pointer" aria-label={field.multiple ? L.attach : L.replace} onClick={() => fileInput.current?.click()}>
                  <Paperclip size={12} />
                </button>
                {touch && (
                  <button type="button" className="cursor-pointer" aria-label={L.takePhoto} onClick={() => cameraInput.current?.click()}>
                    <Camera size={12} />
                  </button>
                )}
              </span>
            )}
          </div>
        )
      }
      return (
        <div
          className={`flex h-full min-h-[inherit] w-full gap-1 rounded-sm border px-1 ${border} bg-primary-soft/50 in-[.fl-wrap-name]:flex-wrap in-[.fl-wrap-name]:[&>button]:text-[13px] ${field.multiple ? 'relative flex-wrap content-start items-center pr-12' : 'items-center'}`}
        >
          {[fileInput, cameraInput].map((ref, i) => (
            <input
              key={i}
              ref={ref}
              type="file"
              hidden
              {...(i ? { accept: 'image/*', capture: 'environment' as const } : {})}
              multiple={!i && field.multiple}
              onChange={(e) => {
                for (const f of e.target.files ?? []) onFile?.(f)
                e.target.value = ''
              }}
            />
          ))}
          {/* Several files: each name opens it, ✕ takes it off. */}
          {field.multiple &&
            fileIds(value).map((id) => {
              const name = files?.find((x) => x.id === id)?.fileName
              return (
                <span key={id} className="inline-flex h-(--fl-row,auto) max-w-full min-w-0 basis-full items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onOpenFile?.(id)}
                    title={name}
                    className="min-w-0 cursor-pointer truncate text-left text-[clamp(8px,50cqh,13px)] text-primary underline in-[.fl-wrap-name]:text-[13px] in-[.fl-wrap-name]:break-all in-[.fl-wrap-name]:whitespace-normal"
                  >
                    {name || L.attachedFile}
                  </button>
                  {!readOnly && onRemoveFile && (
                    <button
                      type="button"
                      aria-label={L.removeFile(name || L.attachedFile)}
                      onClick={() => onRemoveFile(id)}
                      className="flex-none cursor-pointer text-[clamp(8px,50cqh,13px)] text-muted hover:text-danger"
                    >
                      ✕
                    </button>
                  )}
                </span>
              )
            })}
          {!field.multiple && value && (
            <button
              type="button"
              onClick={() => onOpenFile?.()}
              title={fileName}
              className="min-w-0 flex-1 cursor-pointer truncate text-left text-[clamp(8px,50cqh,13px)] text-primary underline in-[.fl-wrap-name]:py-1 in-[.fl-wrap-name]:text-[13px] in-[.fl-wrap-name]:break-all in-[.fl-wrap-name]:whitespace-normal"
            >
              {fileName || L.attachedFile}
            </button>
          )}
          {!field.multiple && value && !readOnly && (
            <button
              type="button"
              aria-label={L.removeFile(fileName || L.attachedFile)}
              onClick={() => onChange(null)}
              className="flex-none cursor-pointer text-[clamp(8px,50cqh,13px)] text-muted hover:text-danger"
            >
              ✕
            </button>
          )}
          {/* Several files: the buttons (icons) sit in the corner, the rows stay as printed. On a phone: Camera too. */}
          {!readOnly && (
            <span className={field.multiple ? 'absolute right-0.5 bottom-0.5 inline-flex gap-1.5 rounded bg-white/90 px-1' : 'contents'}>
              <button
                type="button"
                {...common}
                aria-label={field.multiple ? L.attach : undefined}
                onClick={() => fileInput.current?.click()}
                className="inline-flex flex-none cursor-pointer items-center gap-1 text-[clamp(8px,50cqh,13px)] text-primary"
              >
                <Paperclip size={12} /> {!field.multiple && (value ? L.replace : L.attach)}
              </button>
              {touch && (
                <button
                  type="button"
                  aria-label={field.multiple ? L.takePhoto : undefined}
                  onClick={() => cameraInput.current?.click()}
                  className="inline-flex flex-none cursor-pointer items-center gap-1 text-[clamp(8px,50cqh,13px)] text-primary"
                >
                  <Camera size={12} /> {!field.multiple && L.takePhoto}
                </button>
              )}
            </span>
          )}
        </div>
      )
    default: {
      const type = INPUT_TYPE[field.type] ?? 'text'
      return (
        <input
          {...common}
          type={type}
          className={`${boxBase} ${FIT_TEXT[field.type] ?? boxText} ${border}`}
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

/** FieldControl, or the replacement from `components` (per field type first, then FieldControl). */
export function AnswerControl({ components, ...props }: FieldControlProps & { components?: FormliftComponents }) {
  const C = components?.fields?.[props.field.type] ?? components?.FieldControl ?? FieldControl
  return <C {...props} />
}
