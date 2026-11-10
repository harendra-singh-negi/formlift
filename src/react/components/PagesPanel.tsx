import { ArrowDown, ArrowUp, FilePlus2, Trash2 } from 'lucide-react'
import IconButton from '../ui/IconButton'
import type { LayoutPage } from '../../core/form-logic'

/**
 * The document's pages in order: original pages (with their number in the uploaded PDF) and blank ones.
 * Move, delete, add a blank page after. `onGoTo` scrolls the document to a page.
 */
export default function PagesPanel({
  pages,
  counts,
  onMove,
  onDelete,
  onInsertBlank,
  onGoTo,
}: {
  pages: LayoutPage[]
  /** Fields + items per page (1-based index), shown so deleting a page is not a surprise. */
  counts: Record<number, number>
  onMove: (page: number, step: -1 | 1) => void
  onDelete: (page: number) => void
  onInsertBlank: (after: number) => void
  onGoTo: (page: number) => void
}) {
  return (
    <div className="text-[12.5px]">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 border-b border-line-soft px-3 py-2 text-primary hover:bg-primary-soft"
        onClick={() => onInsertBlank(0)}
      >
        <FilePlus2 size={14} /> Blank page at the start
      </button>
      <ol className="m-0 list-none p-0">
        {pages.map((p, i) => {
          const n = i + 1
          return (
            <li key={i} className="flex items-center gap-1 border-b border-line-soft px-2 py-1">
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate text-left"
                onClick={() => onGoTo(n)}
              >
                <b>Page {n}</b> <span className="text-muted">{p.source ? `· original p.${p.source}` : '· blank'}</span>
                {counts[n] ? <span className="text-faint"> · {counts[n]} items</span> : null}
              </button>
              <IconButton
                icon={ArrowUp}
                title="Move page up"
                iconSize={13}
                disabled={n === 1}
                onClick={() => onMove(n, -1)}
              />
              <IconButton
                icon={ArrowDown}
                title="Move page down"
                iconSize={13}
                disabled={n === pages.length}
                onClick={() => onMove(n, 1)}
              />
              <IconButton
                icon={FilePlus2}
                title="Add blank page after"
                iconSize={13}
                onClick={() => onInsertBlank(n)}
              />
              <IconButton
                icon={Trash2}
                title="Delete page"
                danger
                iconSize={13}
                disabled={pages.length <= 1}
                onClick={() => onDelete(n)}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
