import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { NetBadge } from '../../components/ui'
import { __, sprintf } from '../../lib/i18n'
import { useStore } from '../../lib/store'
import { measure, TOKENS } from './helpers'

interface Props {
  /** Networks of the selected accounts; each gets a tab. */
  nets: string[]
  /** 'all' or a network key. */
  tab: string
  setTab: (tab: string) => void
  /** Networks with their own caption or post options. */
  edited: (network: string) => boolean
  text: string
  setText: (text: string) => void
  captionFor: (network: string) => string
  /** Values for {title}, {url}… when a post is selected. */
  tokens?: Record<string, string>
  /** Ctrl/Cmd + Enter. */
  onSubmit: () => void
  /** Buttons in the toolbar, before the character counts. */
  actions: ReactNode
}

/** More networks than this: a tab shows only its logo, except the selected tab. */
const COMPACT = 5

/** Caption tabs, the text box, and a toolbar with tokens, actions and the character count. */
export function CaptionEditor({ nets, tab, setTab, edited, text, setText, captionFor, tokens, onSubmit, actions }: Props) {
  const { network } = useStore()
  const area = useRef<HTMLTextAreaElement>(null)
  const compact = nets.length > COMPACT
  // The count: on 'all', one line when every caption fits, and a chip for each network that is over.
  const counts = (tab === 'all' ? nets : [tab]).map((n) => ({ n, len: measure(captionFor(n), network(n)), limit: network(n)?.char_limit ?? 0 }))
  const over = counts.filter((c) => c.len > c.limit)

  // Tabs pattern: Left, Right, Home and End move between tabs; Tab goes on to the caption.
  const tabKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['all', ...nets]
    const at = keys.indexOf(tab)
    const next = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : null
    if (next === null) return
    e.preventDefault()
    const key = keys[(next + keys.length) % keys.length]!
    // React clears currentTarget after the handler, so keep the list for the next frame.
    const list = e.currentTarget
    setTab(key)
    requestAnimationFrame(() => list.querySelector<HTMLButtonElement>(`[data-tab="${key}"]`)?.focus())
  }

  const insert = (token: string) => {
    const el = area.current
    const value = tokens ? token.replace(/\{(\w+)\}/, (_m, k: string) => tokens[k] ?? token) : token
    if (!el) return setText(text + value)
    setText(text.slice(0, el.selectionStart) + value + text.slice(el.selectionEnd))
    requestAnimationFrame(() => el.focus())
  }

  return (
    <>
      <div className="sint-seg" role="tablist" aria-label={__('Caption for', 'social-integrations')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }} onKeyDown={tabKeys}>
        <button type="button" role="tab" data-tab="all" aria-selected={tab === 'all'} tabIndex={tab === 'all' ? 0 : -1} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{__('All networks', 'social-integrations')}</button>
        {nets.map((n) => {
          const label = network(n)?.label ?? n
          const short = compact && tab !== n
          return (
            <button key={n} type="button" role="tab" data-tab={n} aria-selected={tab === n} tabIndex={tab === n ? 0 : -1} className={`${tab === n ? 'on' : ''}${short ? ' icon' : ''}`} aria-label={short ? (edited(n) ? sprintf(__('%s, edited', 'social-integrations'), label) : label) : undefined} title={short ? label : undefined} onClick={() => setTab(n)}>
              <NetBadge network={n} color={network(n)?.color} size={18} />
              {!short && label}
              {edited(n) && <span className="sint-tab-dot" aria-label={short ? undefined : __('Edited', 'social-integrations')} />}
            </button>
          )
        })}
      </div>

      <div className="sint-editor">
        <label className="sint-sr" htmlFor="sint-caption">{__('Caption', 'social-integrations')}</label>
        <textarea id="sint-caption" ref={area} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit() }} placeholder={__('Write a caption, or select an item from your site.', 'social-integrations')} style={{ minHeight: 170, resize: 'vertical', background: 'transparent', border: 0, color: 'var(--text)', padding: 16, fontSize: 15, lineHeight: 1.65, outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          {tokens && (
            <>
              <span style={{ fontSize: 12, color: 'var(--faint)', marginRight: 2 }}>{__('Insert', 'social-integrations')}</span>
              {/* A product adds {price}, {regular_price} and {sale_price} when they have a value. */}
              {[...TOKENS, ...['price', 'regular_price', 'sale_price'].filter((k) => tokens[k]).map((k) => `{${k}}`)].map((t) => <button key={t} type="button" className="sint-tok" onClick={() => insert(t)}>{t}</button>)}
            </>
          )}
          {actions}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tab === 'all' && nets.length > 1 && over.length === 0 && (
              <span className="sint-pill muted">{sprintf(__('Fits all %d networks', 'social-integrations'), nets.length)}</span>
            )}
            {(tab === 'all' && nets.length > 1 ? over : counts).map(({ n, len, limit }) => (
              <span key={n} className={`sint-pill ${len > limit ? 'bad' : 'muted'}`}>
                {network(n)?.label} {len.toLocaleString()}/{limit.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
