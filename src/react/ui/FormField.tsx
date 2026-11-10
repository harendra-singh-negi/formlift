import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export const inputClass =
  'w-full rounded-md border border-line-strong bg-white px-3 py-2 text-[13.5px] outline-none focus:border-primary'

/** Label, the control, and its error under it. */
export function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block text-[13.5px]">
      <span className="mb-1 block font-semibold">
        {label} {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {error && <small className="text-danger">{error}</small>}
    </label>
  )
}

export const TextInput = ({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={`${inputClass} ${className}`} {...rest} />
)

export const Select = ({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={`rounded-md border border-line-strong bg-white px-2.5 py-1.5 text-[13px] outline-none ${className}`}
    {...rest}
  />
)

export const TextArea = ({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={`${inputClass} resize-none ${className}`} {...rest} />
)
