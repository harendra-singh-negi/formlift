import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

const variants = {
  primary: 'bg-primary text-white enabled:hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-white text-ink-2 enabled:hover:bg-hover',
  outline: 'border border-primary bg-white text-primary enabled:hover:bg-primary-soft',
  light: 'border border-line-strong bg-white text-primary enabled:hover:bg-primary-soft', // Filters
  heading: 'bg-heading text-white enabled:hover:bg-heading-hover', // matches panel headings
  success: 'bg-success text-white enabled:hover:bg-success-hover',
  brand: 'bg-brand text-white enabled:hover:bg-brand-hover',
  danger: 'bg-danger text-white enabled:hover:opacity-90',
}
const sizes = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2 text-[13.5px]' }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  /** Icon before the label. */
  icon?: LucideIcon
}

/** The app's button. `type` defaults to "button" so it never submits a form by accident. */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 15 : 16} />}
      {children}
    </button>
  )
}
