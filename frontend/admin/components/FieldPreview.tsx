import { __ } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { FieldMap } from '../lib/types'
import { NetBadge } from './ui'

/**
 * The filled link and post fields of a built share, for each network: text values that are not
 * empty, and options that are not the default.
 */
export function FieldPreview({ nets, fields, link }: { nets: string[]; fields: FieldMap | []; link?: string }) {
  const { network } = useStore()
  const map = Array.isArray(fields) ? {} : fields
  const rows = nets.flatMap((n) =>
    (network(n)?.post_fields ?? []).flatMap((field) => {
      const value = map[n]?.[field.name] ?? ''
      if (value === '' || (field.type !== 'text' && field.type !== 'textarea' && value === field.default)) return []
      const shown = field.type === 'select' ? field.options?.find((o) => o.value === value)?.label ?? value : field.type === 'toggle' ? __('On', 'social-integrations') : value
      return [{ key: `${n}-${field.name}`, net: n, label: field.label, shown }]
    }),
  )
  if (!link && rows.length === 0) return null

  return (
    <dl className="sint-field-preview">
      {link && (
        <div>
          <dt>{__('Link', 'social-integrations')}</dt>
          <dd>{link}</dd>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.key}>
          <dt>
            {nets.length > 1 && <NetBadge network={r.net} color={network(r.net)?.color} size={16} />}
            {r.label}
          </dt>
          <dd>{r.shown}</dd>
        </div>
      ))}
    </dl>
  )
}
