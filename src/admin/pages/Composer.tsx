import { useEffect, useMemo, useRef, useState } from 'react'
import { AccountAvatar, Icon, Modal, NetBadge, Segmented, typeColor, useToast } from '../components/ui'
import { api, query } from '../lib/api'
import { config } from '../lib/config'
import { initials } from '../lib/format'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { BuiltShare, ContentItem, MediaItem } from '../lib/types'

export interface ComposerSeed {
  postId?: number
}

type When = 'now' | 'pick'
const TOKENS = ['{title}', '{excerpt}', '{url}', '{tags}', '{author}']

/** 'YYYY-MM-DDTHH:mm' in the site's time zone, one hour from now. */
function defaultLocal(): string {
  const d = new Date(Date.now() + 3600000 + config.gmtOffset * 3600000)
  return d.toISOString().slice(0, 14) + '00'
}

/** datetime-local value in the site's time zone → UTC ISO. */
function localToUtc(value: string): string {
  return new Date(Date.parse(value + ':00Z') - config.gmtOffset * 3600000).toISOString()
}

export function Composer({ seed, onClose, onSaved }: { seed: ComposerSeed; onClose: () => void; onSaved: () => void }) {
  const { accounts, network, postTypes } = useStore()
  const toast = useToast()
  const connected = accounts.filter((a) => a.status === 'connected')

  const [selected, setSelected] = useState<string[]>(connected.map((a) => a.id))
  const [type, setType] = useState('any')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ContentItem[]>([])
  const [postId, setPostId] = useState<number | undefined>(seed.postId)
  const [built, setBuilt] = useState<BuiltShare | null>(null)
  const [caption, setCaption] = useState('')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [tab, setTab] = useState('all')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [mediaOn, setMediaOn] = useState<string[]>([])
  const [when, setWhen] = useState<When>('now')
  const [local, setLocal] = useState(defaultLocal)
  const [busy, setBusy] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<ContentItem[]>(`content?${query({ type, search, per_page: 8 })}`).then((r) => setResults(r.data), () => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [type, search])

  useEffect(() => {
    if (!postId) return
    api.get<BuiltShare>(`content/${postId}/share`).then((r) => {
      setBuilt(r.data)
      setCaption(r.data.caption)
      setOverrides({})
      setMedia(r.data.media)
      setMediaOn(r.data.media.map((m) => m.url))
    })
  }, [postId])

  const nets = useMemo(() => Array.from(new Set(connected.filter((a) => selected.includes(a.id)).map((a) => a.network))), [connected, selected])
  const text = tab === 'all' ? caption : overrides[tab] ?? caption
  const setText = (v: string) => (tab === 'all' ? setCaption(v) : setOverrides((o) => ({ ...o, [tab]: v })))
  const chosenMedia = media.filter((m) => mediaOn.includes(m.url))
  const title = results.find((r) => r.id === postId)?.title ?? built?.tokens.title ?? ''

  const insert = (token: string) => {
    const el = area.current
    const value = built ? token.replace(/\{(\w+)\}/, (_m, k: string) => built.tokens[k] ?? token) : token
    if (!el) return setText(text + value)
    const next = text.slice(0, el.selectionStart) + value + text.slice(el.selectionEnd)
    setText(next)
    requestAnimationFrame(() => el.focus())
  }

  const save = async (draft: boolean) => {
    setBusy(true)
    try {
      const captions: Record<string, string> = {}
      nets.forEach((n) => { if (overrides[n] !== undefined) captions[n] = overrides[n]! })
      await api.post('queue', {
        post_id: postId,
        caption,
        captions,
        accounts: selected,
        media: chosenMedia,
        link: built?.link,
        scheduled_at: when === 'pick' ? localToUtc(local) : '',
        draft,
      })
      toast(draft ? __('Draft saved.') : when === 'now' ? __('Sharing now.') : __('Added to the calendar.'))
      onSaved()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setBusy(false)
  }

  const types = postTypes.map((t) => t.name)
  const preview = tab === 'all' ? nets[0] : tab
  const previewNet = preview ? network(preview) : undefined
  const previewAccount = connected.find((a) => a.network === preview)

  return (
    <Modal
      title={__('Create post')}
      onClose={onClose}
      footer={
        <>
          <Segmented<When> label={__('Timing')} value={when} onChange={setWhen} options={[{ value: 'now', label: __('Now') }, { value: 'pick', label: __('Pick a time') }]} />
          {when === 'pick' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="sint-sr">{__('Date and time')}</span>
              <input type="datetime-local" className="sint-input" style={{ width: 'auto', colorScheme: 'dark' }} value={local} onChange={(e) => setLocal(e.target.value)} />
            </label>
          )}
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>{config.timezone}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button type="button" className="sint-btn ghost" disabled={busy || !selected.length} onClick={() => save(true)}>{__('Save draft')}</button>
            <button type="button" className="sint-btn primary" disabled={busy || !selected.length || !caption.trim()} onClick={() => save(false)}>
              {when === 'now' ? __('Share now') : __('Add to calendar')}
            </button>
          </div>
        </>
      }
      headerExtra={<span style={{ fontSize: 12, color: 'var(--faint)' }}>{title}</span>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <span className="sint-label">{__('Share to')}</span>
        {accounts.length === 0 && <a href="#/accounts" onClick={onClose}>{__('Connect an account first')}</a>}
        {accounts.map((a) => {
          const on = selected.includes(a.id)
          const expired = a.status === 'expired'
          return (
            <button key={a.id} type="button" className="sint-pick" aria-pressed={on && !expired} disabled={expired} title={`${a.name} · ${network(a.network)?.label}`} aria-label={`${a.name}, ${network(a.network)?.label}`} onClick={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))}>
              {a.avatar ? <img src={a.avatar} alt="" /> : initials(a.name)}
              <NetBadge network={a.network} color={network(a.network)?.color} />
            </button>
          )
        })}
        {accounts.filter((a) => a.status === 'expired').map((a) => (
          <span key={a.id} style={{ fontSize: 12, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="alert" size={14} stroke={2.2} />
            {sprintf(__('%s sign-in expired'), network(a.network)?.label ?? a.network)} · <a href="#/accounts" onClick={onClose} style={{ color: 'var(--warn)', fontWeight: 700 }}>{__('Reconnect')}</a>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 0 }}>
        <aside style={{ flex: '1 1 280px', maxWidth: 320, borderRight: '1px solid var(--line)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div className="sint-label">{__('From your site')}</div>
          <label className="sint-search" style={{ minWidth: 0 }}>
            <Icon name="search" size={16} stroke={2} />
            <span className="sint-sr">{__('Search content')}</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={__('Search any post type')} />
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`sint-chip${type === 'any' ? ' on' : ''}`} onClick={() => setType('any')}>{__('All')}</button>
            {postTypes.map((t) => (
              <button key={t.name} type="button" className={`sint-chip${type === t.name ? ' on' : ''}`} onClick={() => setType(t.name)}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {results.map((r) => (
              <button key={r.id} type="button" className={`sint-item${r.id === postId ? ' on' : ''}`} onClick={() => setPostId(r.id)}>
                {r.thumbnail ? <img className="sint-thumb" src={r.thumbnail} alt="" style={{ width: 48, height: 48 }} /> : <span className="sint-thumb" style={{ width: 48, height: 48 }} />}
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{r.title || __('(no title)')}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="sint-type-dot" style={{ background: typeColor(types, r.type) }} />
                    {postTypes.find((t) => t.name === r.type)?.singular ?? r.type}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {postId && (
            <button type="button" className="sint-btn ghost sm" onClick={() => { setPostId(undefined); setBuilt(null); setMedia([]); setMediaOn([]) }}>
              {__('Write without a post')}
            </button>
          )}
        </aside>

        <section style={{ flex: '999 1 440px', minWidth: 0, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sint-seg" role="tablist" aria-label={__('Caption for')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
            <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{__('All channels')}</button>
            {nets.map((n) => (
              <button key={n} type="button" role="tab" aria-selected={tab === n} className={tab === n ? 'on' : ''} onClick={() => setTab(n)}>
                <NetBadge network={n} color={network(n)?.color} size={18} />
                {network(n)?.label}
                {overrides[n] !== undefined && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} aria-label={__('Edited')} />}
              </button>
            ))}
          </div>

          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 18, display: 'flex', flexDirection: 'column' }}>
            <label className="sint-sr" htmlFor="sint-caption">{__('Caption')}</label>
            <textarea id="sint-caption" ref={area} value={text} onChange={(e) => setText(e.target.value)} placeholder={__('Write a caption, or select an item from your site.')} style={{ minHeight: 170, resize: 'vertical', background: 'transparent', border: 0, color: 'var(--text)', padding: 16, fontSize: 15, lineHeight: 1.65, outline: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              {built && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--faint)', marginRight: 2 }}>{__('Insert')}</span>
                  {TOKENS.map((t) => <button key={t} type="button" className="sint-tok" onClick={() => insert(t)}>{t}</button>)}
                </>
              )}
              {tab !== 'all' && overrides[tab] !== undefined && (
                <button type="button" className="sint-btn ghost sm" onClick={() => setOverrides((o) => { const n = { ...o }; delete n[tab]; return n })}>{__('Use the shared caption')}</button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {nets.map((n) => {
                  const limit = network(n)?.char_limit ?? 0
                  const len = [...(overrides[n] ?? caption)].length
                  return (
                    <span key={n} className={`sint-pill ${len > limit ? 'bad' : 'muted'}`}>
                      {network(n)?.label} {len.toLocaleString()}/{limit.toLocaleString()}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {media.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="sint-label">{__('Media from the post')}</span>
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>{__('Featured image and media blocks')}</span>
                <a href="#/settings" onClick={onClose} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600 }}>{__('Block rules')}</a>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {media.map((m, i) => {
                  const on = mediaOn.includes(m.url)
                  const order = chosenMedia.indexOf(m) + 1
                  return (
                    <button key={m.url} type="button" className="sint-media" aria-pressed={on} aria-label={m.alt || sprintf(__('Image %d'), i + 1)} onClick={() => setMediaOn((s) => (on ? s.filter((x) => x !== m.url) : [...s, m.url]))}>
                      {m.type === 'image' ? <img src={m.url} alt="" /> : <Icon name="image" size={24} />}
                      <span>{on ? `${order} · ` : ''}{m.featured ? __('Featured') : m.type === 'video' ? __('Video') : __('Block')}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <aside style={{ flex: '1 1 330px', maxWidth: 380, borderLeft: '1px solid var(--line)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, background: '#151517', minWidth: 0 }}>
          <div className="sint-label">{__('Preview')}</div>
          {previewNet ? (
            <div style={{ background: '#fff', color: '#1c1e21', borderRadius: 16, overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12 }}>
                {previewAccount && <AccountAvatar account={previewAccount} network={previewNet} />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{previewAccount?.name}</div>
                  <div style={{ fontSize: 12, color: '#65676b' }}>{previewNet.label}</div>
                </div>
              </div>
              <div style={{ padding: '0 12px 12px', fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {[...(overrides[previewNet.key] ?? caption)].slice(0, previewNet.char_limit).join('') || <span style={{ color: '#8a8d91' }}>{__('Your caption appears here.')}</span>}
              </div>
              {chosenMedia.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: chosenMedia.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 2 }}>
                  {chosenMedia.slice(0, Math.min(4, previewNet.max_images)).map((m) => (
                    m.type === 'image' ? <img key={m.url} src={m.url} alt={m.alt} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} /> : <div key={m.url} style={{ height: 140, background: '#ddd' }} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="sint-sub">{__('Select an account to see a preview.')}</p>
          )}
          {previewNet && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
              {nets.map((n) => {
                const net = network(n)
                const len = [...(overrides[n] ?? caption)].length
                const ok = net ? len <= net.char_limit : true
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: ok ? 'var(--ok)' : 'var(--bad)' }}><Icon name={ok ? 'check' : 'alert'} size={14} stroke={2.6} /></span>
                    {ok ? sprintf(__('%s caption fits'), net?.label ?? n) : sprintf(__('%1$s caption is %2$d characters too long'), net?.label ?? n, len - (net?.char_limit ?? 0))}
                  </div>
                )
              })}
              {chosenMedia.length > 0 && nets.some((n) => (network(n)?.max_images ?? 1) < chosenMedia.length) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--warn)' }}><Icon name="alert" size={14} stroke={2.6} /></span>
                  {__('Some networks take fewer images. They get the first ones.')}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </Modal>
  )
}
