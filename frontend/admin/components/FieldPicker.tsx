import { useEffect, useRef, useState } from 'react'
import { __, sprintf } from '../lib/i18n'
import type { CustomField } from '../lib/types'
import { Icon } from './ui'

interface Props {
  /** The text of the button, such as "Custom field". */
  label: string
  fields: CustomField[]
  loading: boolean
  onPick: (field: CustomField) => void
}

/**
 * A chip that opens the custom fields of a post type. Each row shows the name of the field and a value
 * from a recent post, so the user sees what the field adds. A click on a row picks the field.
 */
export function FieldPicker({ label, fields, loading, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // A search shows only for a long list.
  const searchable = fields.length > 8

  useEffect(() => {
    if (!open) return setQuery('')
    ;(search.current ?? box.current?.querySelector<HTMLButtonElement>('.sint-fp-list button'))?.focus()
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    // Escape closes the list only. The listener is on the field, so a modal around it does not get the key.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    const el = box.current
    document.addEventListener('mousedown', away)
    el?.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      el?.removeEventListener('keydown', esc)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const shown = q ? fields.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)) : fields

  return (
    <div className="sint-fp" ref={box}>
      <button ref={trigger} type="button" className="sint-chip" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="plus" size={14} stroke={2.4} />
        {label}
      </button>
      {open && (
        <div className="sint-fp-panel" role="group" aria-label={label}>
          {searchable && (
            <input ref={search} type="search" className="sint-input" placeholder={__('Search', 'social-integrations')} aria-label={sprintf(__('Search: %s', 'social-integrations'), label)} value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          {loading && <p className="sint-fp-empty">{__('Wait…', 'social-integrations')}</p>}
          {!loading && fields.length === 0 && <p className="sint-fp-empty">{__('The posts of this type have no custom fields.', 'social-integrations')}</p>}
          {!loading && fields.length > 0 && shown.length === 0 && <p className="sint-fp-empty">{__('No field matches the search.', 'social-integrations')}</p>}
          <ul className="sint-fp-list">
            {shown.map((f) => (
              <li key={f.key}>
                <button type="button" onClick={() => { onPick(f); setOpen(false); trigger.current?.focus() }}>
                  <span className="t">{f.label}</span>
                  <span className="sint-code">{f.key}</span>
                  {f.sample && <span className="s">{sprintf(__('For example: %s', 'social-integrations'), f.sample)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
