import type { InputHTMLAttributes } from 'react'

/** The app's checkbox (theme colour). `label` = accessible name when there is no visible text. */
export default function Checkbox({
  label,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className={`h-[18px] w-[18px] flex-none cursor-pointer accent-primary ${className}`}
      {...rest}
    />
  )
}
