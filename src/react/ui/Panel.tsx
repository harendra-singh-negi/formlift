import type { ReactNode } from 'react'

/** White bordered box: the tree, the files list, the folder structure columns. */
export const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`overflow-hidden rounded-lg border border-line bg-white ${className}`}>{children}</div>
)

/** Blue panel heading (FOLDER HIERARCHY, MODULES…) with optional buttons on the right. */
export const PanelHeading = ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
  <div className="flex items-center justify-between bg-heading px-3.5 py-[11px] text-[13px] font-bold tracking-[0.02em] text-white">
    {children}
    {actions && <span className="flex items-center gap-1 tracking-normal">{actions}</span>}
  </div>
)

/** Grey hint in an empty list ("No folders yet.", "Loading…"). */
export const EmptyText = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`m-0 px-3.5 py-3 text-[13px] text-muted ${className}`}>{children}</div>
)
