import { useState, type FocusEvent } from 'react'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { FieldMap, Network, PostField } from '../lib/types'
import { NetBadge, Toggle } from './ui'

/** Key of the values for all networks. */
export const ALL = '*'

/** Fields with the same meaning on each network; the "All networks" tab sets them for every network that has them. */
export const SHARED = ['format', 'title', 'description', 'first_comment']

/** One field as a tab shows it, with the networks it applies to. */
interface TabField {
  field: PostField
  nets: string[]
}

/** The fields of a tab: on 'all', each shared field of the networks once; otherwise the network's own fields. */
export function tabFields(nets: string[], tab: string, network: (key: string) => Network | undefined): TabField[] {
  if (tab !== 'all') return (network(tab)?.post_fields ?? []).map((field) => ({ field, nets: [tab] }))
  const out: TabField[] = []
  for (const n of nets) {
    for (const field of network(n)?.post_fields ?? []) {
      if (!SHARED.includes(field.name)) continue
      const found = out.find((x) => x.field.name === field.name)
      if (found) found.nets.push(n)
      else out.push({ field, nets: [n] })
    }
  }
  return out
}

/** The value that a network uses: its own, then the value for all networks, then `base`. */
export function fieldValue(map: FieldMap, net: string, field: PostField, base: string): string {
  return map[net]?.[field.name] ?? (SHARED.includes(field.name) ? map[ALL]?.[field.name] : undefined) ?? base
}

/** Final values for each network, as the composer sends them. */
export function resolveFields(map: FieldMap, nets: string[], network: (key: string) => Network | undefined, base: (net: string, field: PostField) => string): FieldMap {
  const out: FieldMap = {}
  for (const n of nets) {
    out[n] = {}
    for (const field of network(n)?.post_fields ?? []) out[n]![field.name] = fieldValue(map, n, field, base(n, field))
  }
  return out
}

/** A map without empty network entries, for a stable request body. */
const withValue = (map: FieldMap, key: string, name: string, value: string | undefined): FieldMap => {
  const values = { ...(map[key] ?? {}) }
  if (value === undefined) delete values[name]
  else values[name] = value
  const next = { ...map, [key]: values }
  if (Object.keys(values).length === 0) delete next[key]
  return next
}

interface Props {
  nets: string[]
  /** 'all' or a network key in `nets`. */
  tab: string
  value: FieldMap
  onChange: (map: FieldMap) => void
  /** The value when the map has none: the field default for a template, or the value built from the post. */
  base: (net: string, field: PostField) => string
  /** Token chips for template fields. Leave out when the values are final text, as in the composer. */
  tokens?: string[]
}

/** The post fields of a tab: link card, post format, first comment and the network's own options. */
export function PostFields({ nets, tab, value, onChange, base, tokens }: Props) {
  const { network } = useStore()
  // Token chips show below the field that has the focus.
  const [focus, setFocus] = useState('')
  const all = tab === 'all'
  const fields = tabFields(nets, tab, network)
  if (fields.length === 0) return null

  return (
    <fieldset className="sint-post-fields">
      <legend className="sint-label">{all ? __('Post options', 'social-integrations') : sprintf(__('Post options for %s', 'social-integrations'), network(tab)?.label ?? tab)}</legend>
      {fields.map(({ field, nets: on }) => {
        const id = `sint-pf-${tab}-${field.name}`
        // On a network tab, an empty shared text field uses the value for all networks.
        const inherits = !all && SHARED.includes(field.name)
        const inherited = all ? base(on[0]!, field) : fieldValue({ [ALL]: value[ALL] ?? {} }, tab, field, base(tab, field))
        const own = all ? value[ALL]?.[field.name] : value[tab]?.[field.name]
        const current = own ?? inherited
        const shown = inherits ? own ?? '' : current
        const set = (v: string | undefined) => onChange(withValue(value, all ? ALL : tab, field.name, v))
        const setText = (v: string) => set(inherits && v === '' ? undefined : v)
        // On 'all', a help text shows only when it is the same on each network.
        const help = all && on.some((n) => network(n)?.post_fields.find((f) => f.name === field.name)?.help !== field.help) ? '' : field.help
        const chips = tokens && field.tokens && focus === id
        const focusProps = { onFocus: () => setFocus(id), onBlur: (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setFocus('') } }
        const appliesTo = all && nets.length > 1 && (
          <span className="sint-post-field-nets" aria-label={sprintf(__('For %s', 'social-integrations'), on.map((n) => network(n)?.label ?? n).join(', '))}>
            {on.map((n) => <NetBadge key={n} network={n} color={network(n)?.color} size={16} />)}
          </span>
        )

        if (field.type === 'toggle') {
          return (
            <div key={field.name} className="sint-field">
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle checked={current === '1'} onChange={(v) => set(v ? '1' : '')} label={field.label} />
                {field.label}
                {appliesTo}
              </span>
              {help && <small>{help}</small>}
            </div>
          )
        }

        return (
          <div key={field.name} className="sint-field">
            <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>{field.label}{appliesTo}</label>
            {field.type === 'select' ? (
              <select id={id} className="sint-select" value={current} onChange={(e) => set(e.target.value)}>
                {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea id={id} className="sint-textarea" rows={2} value={shown} placeholder={inherits ? inherited : undefined} onChange={(e) => setText(e.target.value)} {...focusProps} />
            ) : (
              <input id={id} className="sint-input" value={shown} placeholder={inherits ? inherited : undefined} maxLength={tokens ? undefined : field.max || undefined} onChange={(e) => setText(e.target.value)} {...focusProps} />
            )}
            {chips && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} {...focusProps}>
                {tokens.map((t) => <button key={t} type="button" className="sint-chip" onClick={() => setText(shown + t)}>{t}</button>)}
              </span>
            )}
            {help && <small>{help}</small>}
            {inherits && field.type !== 'select' && <small>{__('Leave empty to use the value for all networks.', 'social-integrations')}</small>}
          </div>
        )
      })}
    </fieldset>
  )
}
