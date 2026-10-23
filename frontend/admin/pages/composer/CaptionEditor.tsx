import { useRef, type ReactNode } from 'react'
import { NetBadge } from '../../components/ui'
import { __ } from '../../lib/i18n'
import { useStore } from '../../lib/store'
import { measure, TOKENS } from './helpers'

interface Props {
  /** Networks of the selected accounts; each gets a tab. */
  nets: string[]
  /** 'all' or a network key. */
  tab: string
  setTab: (tab: string) => void
  /** Networks with their own caption. */
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

/** Caption tabs, the text box, and a toolbar with tokens, actions and a character count for each network. */
export function CaptionEditor({ nets, tab, setTab, edited, text, setText, captionFor, tokens, onSubmit, actions }: Props) {
  const { network } = useStore()
  const area = useRef<HTMLTextAreaElement>(null)

  const insert = (token: string) => {
    const el = area.current
    const value = tokens ? token.replace(/\{(\w+)\}/, (_m, k: string) => tokens[k] ?? token) : token
    if (!el) return setText(text + value)
    setText(text.slice(0, el.selectionStart) + value + text.slice(el.selectionEnd))
    requestAnimationFrame(() => el.focus())
  }

  return (
    <>
      <div className="sint-seg" role="tablist" aria-label={__('Caption for', 'social-integrations')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{__('All networks', 'social-integrations')}</button>
        {nets.map((n) => (
          <button key={n} type="button" role="tab" aria-selected={tab === n} className={tab === n ? 'on' : ''} onClick={() => setTab(n)}>
            <NetBadge network={n} color={network(n)?.color} size={18} />
            {network(n)?.label}
            {edited(n) && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} aria-label={__('Edited', 'social-integrations')} />}
          </button>
        ))}
      </div>

      <div className="sint-editor">
        <label className="sint-sr" htmlFor="sint-caption">{__('Caption', 'social-integrations')}</label>
        <textarea id="sint-caption" ref={area} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit() }} placeholder={__('Write a caption, or select an item from your site.', 'social-integrations')} style={{ minHeight: 170, resize: 'vertical', background: 'transparent', border: 0, color: 'var(--text)', padding: 16, fontSize: 15, lineHeight: 1.65, outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          {tokens && (
            <>
              <span style={{ fontSize: 12, color: 'var(--faint)', marginRight: 2 }}>{__('Insert', 'social-integrations')}</span>
              {TOKENS.map((t) => <button key={t} type="button" className="sint-tok" onClick={() => insert(t)}>{t}</button>)}
            </>
          )}
          {actions}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {nets.map((n) => {
              const limit = network(n)?.char_limit ?? 0
              const len = measure(captionFor(n), network(n))
              return (
                <span key={n} className={`sint-pill ${len > limit ? 'bad' : 'muted'}`}>
                  {network(n)?.label} {len.toLocaleString()}/{limit.toLocaleString()}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
