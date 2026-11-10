import type { ReactNode } from 'react'

const tones = {
  success: 'bg-success/15 text-success',
  info: 'bg-heading/20 text-primary',
  muted: 'bg-hover text-muted',
}

/** Small coloured pill: a status or label on a row (Primary, Secondary…). */
export const Tag = ({ tone = 'info', children }: { tone?: keyof typeof tones; children: ReactNode }) => (
  <span
    className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tones[tone]}`}
  >
    {children}
  </span>
)
