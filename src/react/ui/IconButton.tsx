import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Tooltip and accessible name. */
  title: string
  icon: LucideIcon
  /** Red on hover (delete). */
  danger?: boolean
  iconSize?: number
  /** On a coloured background (panel headings): white icon. */
  light?: boolean
}

/** Icon-only button: view, download, delete, edit, expand… */
export default function IconButton({
  title,
  icon: Icon,
  danger,
  iconSize = 18,
  light,
  className = '',
  ...rest
}: IconButtonProps) {
  const tone = light
    ? 'text-white opacity-90 hover:bg-white/15 hover:opacity-100'
    : `text-muted hover:bg-line-soft ${danger ? 'hover:text-danger' : 'hover:text-primary'}`
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`inline-flex cursor-pointer items-center justify-center rounded p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${className}`}
      {...rest}
    >
      <Icon size={iconSize} />
    </button>
  )
}
