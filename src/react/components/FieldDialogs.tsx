import { Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { FieldComment, FieldDef } from '../../core/form-logic'
import { useLabels } from '../labels'
import IconButton from '../ui/IconButton'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, TextArea } from '../ui/slots'
import { SIZE } from './QuestionList'

/** More questions in a dialog (a follow-up, or one onFieldChange opened): each field with its label and error. */
export function FieldDialog({
  title,
  fields,
  control,
  errors,
  onClose,
}: {
  title: string
  /** The visible fields to ask, in order. */
  fields: FieldDef[]
  control: (f: FieldDef) => ReactNode
  errors: Record<string, string>
  onClose: () => void
}) {
  const L = useLabels()
  return (
    <Modal onClose={onClose} width="w-[560px]" label={title}>
      <ModalHeader title={title} onClose={onClose} />
      <ModalBody>
        <div className="max-h-[65dvh] space-y-4 overflow-y-auto">
          {fields.map((f) => (
            <div key={f.id} className="flex flex-col gap-1.5">
              <span className="font-semibold">{f.label || f.key}</span>
              <div className={`relative [container-type:size] ${SIZE[f.type] ?? 'h-10 w-full'}`}>{control(f)}</div>
              {f.helpText && <small className="text-muted">{f.helpText}</small>}
              {errors[f.key] && <small className="text-danger">{errors[f.key]}</small>}
            </div>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>{L.done}</Button>
      </ModalFooter>
    </Modal>
  )
}

/** A field's comments: read them, add one, delete one (not while read-only). */
export function CommentsDialog({
  field,
  comments,
  readOnly,
  onAdd,
  onRemove,
  onClose,
}: {
  field: FieldDef
  comments: FieldComment[]
  readOnly?: boolean
  onAdd: (text: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const L = useLabels()
  const [text, setText] = useState('')
  return (
    <Modal onClose={onClose} width="w-[520px]" label={L.commentsTitle(field.label || field.key)}>
      <ModalHeader title={L.commentsTitle(field.label || field.key)} onClose={onClose} />
      <ModalBody>
        {comments.length ? (
          <ul className="m-0 max-h-[45dvh] list-none space-y-2 overflow-y-auto p-0">
            {comments.map((c) => (
              <li key={c.id} className="rounded-md border border-line bg-surface px-3 py-2">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="min-w-0 flex-1 truncate">
                    {c.by && <b className="text-ink-2">{c.by} · </b>}
                    {new Date(c.at).toLocaleString()}
                  </span>
                  {!readOnly && (
                    <IconButton icon={Trash2} title={L.deleteComment} iconSize={14} danger onClick={() => onRemove(c.id)} />
                  )}
                </div>
                <p className="m-0 text-[13.5px] whitespace-pre-wrap">{c.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-muted">{L.noComments}</p>
        )}
        {!readOnly && (
          <TextArea
            rows={3}
            aria-label={L.commentPlaceholder}
            placeholder={L.commentPlaceholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          {L.done}
        </Button>
        {!readOnly && (
          <Button
            disabled={!text.trim()}
            onClick={() => {
              onAdd(text)
              setText('')
            }}
          >
            {L.addComment}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  )
}
