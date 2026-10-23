import { useEffect, useMemo, useRef, useState } from 'react'
import { AccountAvatar, Icon, Modal, NetBadge, Segmented, typeColor, useToast } from '../components/ui'
import { api, query } from '../lib/api'
import { config } from '../lib/config'
import { applyFilters } from '../lib/hooks'
import { fmtDate, initials } from '../lib/format'
import { __, sprintf } from '../lib/i18n'
import { pickMedia } from '../lib/media'
import { useStore } from '../lib/store'
import { AutoPost } from './AutoPost'
import type { Account, BuiltShare, ContentItem, MediaItem, MediaSource, Network, QueueItem } from '../lib/types'

export interface ComposerSeed {
  postId?: number
  /** A draft, scheduled or failed share to edit. */
  item?: QueueItem
  /** A share to start a new one from. */
  copy?: QueueItem
  /** A time to schedule a new share for, as UTC ISO. */
  at?: string
  /** A campaign to edit, or to start a new one from (`copy`). */
  campaign?: CampaignRef
}

/** A campaign the composer opens: its `type` picks the tab. */
export interface CampaignRef {
  type: string
  id: number | string
  accounts?: string[]
  copy?: boolean
}

/** A single campaign, as GET campaigns/{id} returns it. */
interface SingleCampaign {
  id: number
  post_id: number
  caption: string
  captions: Record<string, string> | []
  accounts: string[]
  media: MediaItem[]
  scheduled_at: string
  draft: boolean
  options: Record<string, unknown> | []
}

type When = 'now' | 'pick'

/** Props for a `sint.composer.options` control, shown next to the timing of a new share. */
export interface ComposerOptionProps {
  /** Every control's values; sent with the new share as `options`. */
  options: Record<string, unknown>
  setOption: (key: string, value: unknown) => void
  when: 'now' | 'pick'
  /** Site-time datetime-local value of the picked time. */
  local: string
}

/** Props for a `sint.composer.modes` mode, which renders the modal's body and its own actions. */
export interface ComposerModeProps {
  accounts: Account[]
  selected: string[]
  onClose: () => void
  onSaved: () => void
  /** The campaign of this mode's type being edited or copied. */
  campaign?: CampaignRef
}

interface ComposerMode {
  value: string
  label: string
  component: (props: ComposerModeProps) => JSX.Element
}

const MEDIA_FROM: { value: MediaSource | ''; label: () => string }[] = [
  { value: '', label: () => __('Post type setting') },
  { value: 'auto', label: () => __('Featured + post images') },
  { value: 'featured', label: () => __('Featured image') },
  { value: 'content', label: () => __('Images in the post') },
  { value: 'none', label: () => __('No media') },
]
const TOKENS = ['{title}', '{excerpt}', '{url}', '{tags}', '{author}']

/** 'YYYY-MM-DDTHH:mm' in the site's time zone, one hour from now. */
function defaultLocal(): string {
  const d = new Date(Date.now() + 3600000 + config.gmtOffset * 3600000)
  return d.toISOString().slice(0, 14) + '00'
}

/** datetime-local value in the site's time zone, `days` from today at `hour`:00. */
function atLocal(days: number, hour: number): string {
  const d = new Date(Date.now() + config.gmtOffset * 3600000)
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

/** Days from today to the start of next week. */
function toNextWeek(): number {
  const day = new Date(Date.now() + config.gmtOffset * 3600000).getUTCDay()
  return (config.weekStart - day + 7) % 7 || 7
}

/** Caption length as a network counts it: some count every link as a fixed length. */
function measure(text: string, net?: Network): number {
  const counted = net?.url_length ? text.replace(/https?:\/\/\S+/g, 'x'.repeat(net.url_length)) : text
  return [...counted].length
}

/** UTC ISO → datetime-local value in the site's time zone. */
function utcToLocal(iso: string): string {
  return new Date(Date.parse(iso) + config.gmtOffset * 3600000).toISOString().slice(0, 16)
}

/** datetime-local value in the site's time zone → UTC ISO. */
function localToUtc(value: string): string {
  return new Date(Date.parse(value + ':00Z') - config.gmtOffset * 3600000).toISOString()
}

export function Composer({ seed, onClose, onSaved }: { seed: ComposerSeed; onClose: () => void; onSaved: () => void }) {
  const { accounts, network, postTypes } = useStore()
  const toast = useToast()
  const connected = accounts.filter((a) => a.status === 'connected')
  // An edited share belongs to one account and one post; only its text, media and time change.
  const item = seed.item
  const upcoming = item?.status === 'scheduled' && Date.parse(item.scheduled_at) > Date.now()
  // A duplicate starts from another share's text, media and post, as a new share.
  const from = item ?? seed.copy

  const campaign = seed.campaign
  const editing = campaign && !campaign.copy ? campaign : undefined
  const [selected, setSelected] = useState<string[]>(() => {
    if (item) return [item.account_id]
    if (campaign?.accounts?.length) return campaign.accounts.filter((id) => connected.some((a) => a.id === id))
    const all = connected.map((a) => a.id)
    return seed.copy && all.includes(seed.copy.account_id) ? [seed.copy.account_id] : all
  })
  const [type, setType] = useState('any')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ContentItem[]>([])
  const [postId, setPostId] = useState<number | undefined>(seed.postId ?? (from?.post_id || undefined))
  const [picked, setPicked] = useState<ContentItem | null>(null)
  const [built, setBuilt] = useState<BuiltShare | null>(null)
  const [caption, setCaption] = useState(from?.caption ?? '')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [tab, setTab] = useState('all')
  const [previewPick, setPreviewPick] = useState('')
  const [media, setMedia] = useState<MediaItem[]>(from?.media ?? [])
  const [mediaOn, setMediaOn] = useState<string[]>(from?.media.map((m) => m.url) ?? [])
  const [when, setWhen] = useState<When>(upcoming || seed.at ? 'pick' : 'now')
  const [local, setLocal] = useState(() => (upcoming ? utcToLocal(item!.scheduled_at) : seed.at ? utcToLocal(seed.at) : defaultLocal()))
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)
  // The text before the last AI answer, for Undo.
  const [beforeAI, setBeforeAI] = useState<string | null>(null)
  const [mediaFrom, setMediaFrom] = useState<MediaSource | ''>('')
  const [mode, setMode] = useState(campaign ? (campaign.type === 'single' ? 'single' : campaign.type) : 'single')
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const area = useRef<HTMLTextAreaElement>(null)
  const keepSaved = useRef(!!from)

  // Filter `sint.composer.modes`: other ways to share from this modal, such as many posts at once.
  const modes = item ? [] : [...applyFilters<ComposerMode[]>('sint.composer.modes', []), { value: 'auto', label: __('Auto-post'), component: AutoPost }]
  const Mode = modes.find((m) => m.value === mode)?.component
  // Filter `sint.composer.options`: controls next to the timing of a new share, such as repeating it.
  const optionControls = item ? [] : applyFilters<{ key: string; component: (props: ComposerOptionProps) => JSX.Element }[]>('sint.composer.options', [])
  const setOption = (key: string, value: unknown) => setOptions((o) => ({ ...o, [key]: value }))

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<ContentItem[]>(`content?${query({ type, search, per_page: 8 })}`).then((r) => setResults(r.data), () => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [type, search])

  // A single campaign opens with what it was saved with.
  useEffect(() => {
    if (campaign?.type !== 'single') return
    api.get<SingleCampaign>(`campaigns/${campaign.id}`).then((r) => {
      const c = r.data
      keepSaved.current = !!c.post_id
      setCaption(c.caption)
      setOverrides(Array.isArray(c.captions) ? {} : c.captions)
      setMedia(c.media)
      setMediaOn(c.media.map((m) => m.url))
      setSelected(c.accounts.filter((id) => connected.some((a) => a.id === id)))
      setOptions(Array.isArray(c.options) ? {} : c.options)
      if (c.scheduled_at && Date.parse(c.scheduled_at) > Date.now()) {
        setWhen('pick')
        setLocal(utcToLocal(c.scheduled_at))
      }
      if (c.post_id) setPostId(c.post_id)
    }, (e) => toast((e as Error).message, true))
  }, [])

  useEffect(() => {
    if (!postId) return
    setMediaFrom('')
    api.get<BuiltShare>(`content/${postId}/share`).then((r) => {
      setBuilt(r.data)
      if (keepSaved.current) {
        // Keep the saved caption and media choice; still offer the post's other media.
        keepSaved.current = false
        setMedia((m) => [...m, ...r.data.media.filter((x) => !m.some((y) => y.url === x.url))])
        return
      }
      setCaption(r.data.caption)
      setOverrides(Array.isArray(r.data.captions) ? {} : r.data.captions)
      setMedia(r.data.media)
      setMediaOn(r.data.media.map((m) => m.url))
    })
  }, [postId])

  /** Media from another source; images added by hand stay. */
  const changeMediaFrom = (from: MediaSource | '') => {
    setMediaFrom(from)
    if (!postId) return
    api.get<BuiltShare>(`content/${postId}/share${from ? `?media=${from}` : ''}`).then((r) => {
      const fromPost = new Set(built?.media.map((m) => m.url) ?? [])
      const added = media.filter((m) => !fromPost.has(m.url))
      setBuilt((b) => (b ? { ...b, media: r.data.media } : r.data))
      setMedia([...r.data.media, ...added.filter((m) => !r.data.media.some((x) => x.url === m.url))])
      setMediaOn([...r.data.media.map((m) => m.url), ...added.filter((m) => mediaOn.includes(m.url)).map((m) => m.url)])
    })
  }

  const nets = useMemo(() => Array.from(new Set(connected.filter((a) => selected.includes(a.id)).map((a) => a.network))), [connected, selected])
  const text = tab === 'all' ? caption : overrides[tab] ?? caption
  const setText = (v: string) => (tab === 'all' ? setCaption(v) : setOverrides((o) => ({ ...o, [tab]: v })))
  const chosenMedia = media.filter((m) => mediaOn.includes(m.url))
  const title = results.find((r) => r.id === postId)?.title ?? built?.tokens.title ?? ''
  const over = nets.filter((n) => measure(overrides[n] ?? caption, network(n)) > (network(n)?.char_limit ?? Infinity))
  const canSend = !busy && selected.length > 0 && caption.trim() !== '' && over.length === 0
  const live = picked?.id === postId && picked?.status === 'future' ? picked.date : ''

  /** Drafts the current tab's caption from the post, or improves the text written so far. */
  const writeWithAI = async () => {
    const limits = (tab === 'all' ? nets : [tab]).map((n) => network(n)?.char_limit ?? 500)
    setWriting(true)
    try {
      const r = await api.post<{ caption: string }>('ai/caption', { post_id: postId, text: postId && text === (built?.caption ?? '') ? '' : text, limit: Math.min(500, ...limits) })
      setBeforeAI(text)
      setText(r.data.caption)
    } catch (e) {
      toast((e as Error).message, true)
    }
    setWriting(false)
  }

  const addMedia = () => {
    const opened = pickMedia((items) => {
      setMedia((m) => [...m, ...items.filter((x) => !m.some((y) => y.url === x.url))])
      setMediaOn((on) => [...on, ...items.map((x) => x.url).filter((u) => !on.includes(u))])
    })
    if (!opened) toast(__('The media library did not load. Reload the page and try again.'), true)
  }

  const presets = [
    { label: __('In an hour'), value: defaultLocal() },
    { label: __('Tomorrow 9:00'), value: atLocal(1, 9) },
    { label: __('Next week'), value: atLocal(toNextWeek(), 9) },
    ...(live ? [{ label: __('When the post goes live'), value: utcToLocal(live) }] : []),
  ]

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
      if (item) {
        const r = await api.post<{ result?: { status: string; message?: string } }>(`queue/${item.id}`, {
          caption: overrides[item.network] ?? caption,
          media: chosenMedia,
          scheduled_at: when === 'pick' ? localToUtc(local) : '',
          draft,
        })
        const result = r.data.result
        if (result && result.status !== 'published') {
          toast(result.message || sprintf(__('%s did not accept the post.'), network(item.network)?.label ?? item.network), true)
          setBusy(false)
          return
        }
        toast(draft ? __('Draft saved.') : result ? __('Shared.') : __('Saved to the calendar.'))
        onSaved()
        return
      }
      const captions: Record<string, string> = {}
      nets.forEach((n) => { if (overrides[n] !== undefined) captions[n] = overrides[n]! })
      const r = await api.post<{ created: number[]; results?: { network: string; status: string; message?: string }[] }>(editing?.type === 'single' ? `campaigns/${editing.id}` : 'queue', {
        post_id: postId,
        caption,
        captions,
        accounts: selected,
        media: chosenMedia,
        link: built?.link,
        scheduled_at: when === 'pick' ? localToUtc(local) : '',
        draft,
        options,
      })
      const failed = (r.data.results ?? []).filter((x) => x.status !== 'published')
      if (failed.length) {
        // Keep the composer open so the person can fix the caption or reconnect and try again.
        toast(failed.map((f) => f.message || sprintf(__('%s did not accept the post.'), network(f.network)?.label ?? f.network)).join(' '), true)
        setBusy(false)
        return
      }
      toast(draft ? __('Draft saved.') : r.data.results ? sprintf(__('Shared to %d accounts.'), r.data.results.length) : __('Added to the calendar.'))
      onSaved()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setBusy(false)
  }

  const types = postTypes.map((t) => t.name)
  const preview = tab !== 'all' ? tab : nets.includes(previewPick) ? previewPick : nets[0]
  const previewNet = preview ? network(preview) : undefined
  const previewAccount = connected.find((a) => a.network === preview)

  return (
    <Modal
      title={item ? __('Edit post') : editing ? __('Edit campaign') : __('New campaign')}
      onClose={onClose}
      footer={Mode ? undefined :
        <>
          <Segmented<When> label={__('Timing')} value={when} onChange={setWhen} options={[{ value: 'now', label: __('Now') }, { value: 'pick', label: __('Pick a time') }]} />
          {when === 'pick' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="sint-sr">{__('Date and time')}</span>
                <input type="datetime-local" className="sint-input" style={{ width: 'auto', colorScheme: 'dark' }} value={local} onChange={(e) => setLocal(e.target.value)} />
              </label>
              {presets.map((p) => (
                <button key={p.label} type="button" className={`sint-chip${local === p.value ? ' on' : ''}`} onClick={() => setLocal(p.value)}>{p.label}</button>
              ))}
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>{config.timezone}</span>
          {optionControls.map(({ key, component: Control }) => <Control key={key} options={options} setOption={setOption} when={when} local={local} />)}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button type="button" className="sint-btn ghost" disabled={busy || !selected.length} onClick={() => save(true)}>{__('Save draft')}</button>
            <button type="button" className="sint-btn primary" disabled={!canSend} title={over.length ? sprintf(__('Shorten the %s caption first.'), over.map((n) => network(n)?.label ?? n).join(', ')) : undefined} onClick={() => save(false)}>
              {when === 'now' ? __('Share now') : upcoming ? __('Save') : __('Add to calendar')}
            </button>
          </div>
        </>
      }
      headerExtra={
        <>
          {modes.length > 0 && !editing && (
            <Segmented<string> label={__('What to share')} value={mode} onChange={setMode} options={[{ value: 'single', label: __('Single post') }, ...modes.map((m) => ({ value: m.value, label: m.label }))]} />
          )}
          {!Mode && <span style={{ fontSize: 12, color: 'var(--faint)' }}>{title}</span>}
        </>
      }
    >
      {mode !== 'auto' && <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <span className="sint-label">{__('Share to')}</span>
        {accounts.length === 0 && <a href="#/accounts" onClick={onClose}>{__('Connect an account first')}</a>}
        {accounts.filter((a) => !item || a.id === item.account_id).map((a) => {
          const on = selected.includes(a.id)
          const expired = a.status === 'expired'
          return (
            <button key={a.id} type="button" className="sint-pick" aria-pressed={on && !expired} disabled={expired || !!item} title={`${a.name} · ${network(a.network)?.label}`} aria-label={`${a.name}, ${network(a.network)?.label}`} onClick={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))}>
              {a.avatar ? <img src={a.avatar} alt="" /> : initials(a.name)}
              <NetBadge network={a.network} color={network(a.network)?.color} />
            </button>
          )
        })}
        {!item && connected.length > 1 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
            {sprintf(__('%1$d of %2$d'), selected.length, connected.length)}
            <button type="button" className="sint-btn ghost sm" onClick={() => setSelected(selected.length === connected.length ? [] : connected.map((a) => a.id))}>
              {selected.length === connected.length ? __('Clear') : __('Select all')}
            </button>
          </span>
        )}
        {accounts.filter((a) => a.status === 'expired' && (!item || a.id === item.account_id)).map((a) => (
          <span key={a.id} style={{ fontSize: 12, color: 'var(--warn-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="alert" size={14} stroke={2.2} />
            {sprintf(__('%1$s on %2$s: sign-in expired'), a.name || a.username, network(a.network)?.label ?? a.network)} · <a href="#/accounts" onClick={onClose} style={{ color: 'var(--warn-text)', fontWeight: 700 }}>{__('Reconnect')}</a>
          </span>
        ))}
      </div>}

      {Mode ? <Mode accounts={connected} selected={selected} onClose={onClose} onSaved={onSaved} campaign={campaign?.type === mode ? campaign : undefined} /> : <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 0 }}>
        {!item && <aside style={{ flex: '1 1 280px', maxWidth: 320, borderRight: '1px solid var(--line)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
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
              <button key={r.id} type="button" className={`sint-item${r.id === postId ? ' on' : ''}`} onClick={() => { setPostId(r.id); setPicked(r) }}>
                {r.thumbnail ? <img className="sint-thumb" src={r.thumbnail} alt="" style={{ width: 48, height: 48 }} /> : <span className="sint-thumb" style={{ width: 48, height: 48 }} />}
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{r.title || __('(no title)')}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="sint-type-dot" style={{ background: typeColor(types, r.type) }} />
                    {postTypes.find((t) => t.name === r.type)?.singular ?? r.type}
                    <span aria-hidden="true">·</span>
                    {r.status === 'future' ? sprintf(__('Live %s'), fmtDate(r.date)) : r.status === 'draft' ? __('Draft') : fmtDate(r.date)}
                  </span>
                  <ShareState item={r} />
                </span>
              </button>
            ))}
          </div>
          {postId && (
            <button type="button" className="sint-btn ghost sm" onClick={() => { setPostId(undefined); setPicked(null); setBuilt(null); setMedia([]); setMediaOn([]) }}>
              {__('Write without a post')}
            </button>
          )}
        </aside>}

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

          <div className="sint-editor">
            <label className="sint-sr" htmlFor="sint-caption">{__('Caption')}</label>
            <textarea id="sint-caption" ref={area} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) save(false) }} placeholder={__('Write a caption, or select an item from your site.')} style={{ minHeight: 170, resize: 'vertical', background: 'transparent', border: 0, color: 'var(--text)', padding: 16, fontSize: 15, lineHeight: 1.65, outline: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              {built && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--faint)', marginRight: 2 }}>{__('Insert')}</span>
                  {TOKENS.map((t) => <button key={t} type="button" className="sint-tok" onClick={() => insert(t)}>{t}</button>)}
                </>
              )}
              {config.ai.ready && (postId || text.trim()) && (
                <button type="button" className="sint-btn ai sm" disabled={writing} onClick={writeWithAI}>
                  <Icon name="sparkle" size={15} stroke={2} />
                  {writing ? __('Writing…') : postId && text === (built?.caption ?? '') ? __('Write with AI') : __('Improve with AI')}
                </button>
              )}
              {beforeAI !== null && !writing && (
                <button type="button" className="sint-btn ghost sm" onClick={() => { setText(beforeAI); setBeforeAI(null) }}>{__('Undo')}</button>
              )}
              <button type="button" className="sint-btn ghost sm" onClick={addMedia}>
                <Icon name="image" size={15} stroke={2} />
                {__('Add media')}
              </button>
              {built && tab === 'all' && caption !== built.caption && (
                <button type="button" className="sint-btn ghost sm" onClick={() => setCaption(built.caption)}>
                  <Icon name="retry" size={15} stroke={2} />
                  {__('Rebuild from post')}
                </button>
              )}
              {tab !== 'all' && overrides[tab] !== undefined && (
                <button type="button" className="sint-btn ghost sm" onClick={() => setOverrides((o) => { const n = { ...o }; delete n[tab]; return n })}>{__('Use the shared caption')}</button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {nets.map((n) => {
                  const limit = network(n)?.char_limit ?? 0
                  const len = measure(overrides[n] ?? caption, network(n))
                  return (
                    <span key={n} className={`sint-pill ${len > limit ? 'bad' : 'muted'}`}>
                      {network(n)?.label} {len.toLocaleString()}/{limit.toLocaleString()}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {(media.length > 0 || !!postId) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="sint-label">{__('Media')}</span>
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>{sprintf(__('%d selected · tap to turn on or off'), chosenMedia.length)}</span>
                {postId && (
                  <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                    {__('From')}
                    <select className="sint-select" style={{ height: 36, minWidth: 0 }} value={mediaFrom} onChange={(e) => changeMediaFrom(e.target.value as MediaSource | '')}>
                      {MEDIA_FROM.map((m) => <option key={m.value} value={m.value}>{m.label()}</option>)}
                    </select>
                  </label>
                )}
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
                <button type="button" className="sint-media add" onClick={addMedia}>
                  <Icon name="plus" size={22} stroke={2} />
                  <span>{__('Add')}</span>
                </button>
              </div>
            </div>
          )}
        </section>

        <aside style={{ flex: '1 1 330px', maxWidth: 380, borderLeft: '1px solid var(--line)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--side)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="sint-label">{__('Preview')}</span>
            {tab === 'all' && nets.length > 1 && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }} role="group" aria-label={__('Preview network')}>
                {nets.map((n) => (
                  <button key={n} type="button" className="sint-prev-net" aria-pressed={n === preview} aria-label={network(n)?.label} onClick={() => setPreviewPick(n)}>
                    <NetBadge network={n} color={network(n)?.color} size={22} />
                  </button>
                ))}
              </span>
            )}
          </div>
          {previewNet ? (
            <div className="sint-preview" style={{ background: '#fff', color: '#1c1e21', borderRadius: 16, overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
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
              {chosenMedia.length === 0 && built?.link && (
                <div style={{ borderTop: '1px solid #e4e6eb', background: '#f0f2f5' }}>
                  {(picked?.thumbnail || media[0]?.url) && <img src={picked?.thumbnail || media[0]!.url} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#65676b', textTransform: 'uppercase' }}>{hostOf(built.link)}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{built.tokens.title}</div>
                  </div>
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
                const len = measure(overrides[n] ?? caption, network(n))
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
                  <span style={{ color: 'var(--warn-text)' }}><Icon name="alert" size={14} stroke={2.6} /></span>
                  {__('Some networks take fewer images. They get the first ones.')}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>}
    </Modal>
  )
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Where an item from the site stands with sharing. */
function ShareState({ item }: { item: ContentItem }) {
  const sent = item.shares.filter((x) => x.status === 'published').length
  const failed = item.shares.length - sent
  if (failed) return <span className="sint-pill bad" style={{ alignSelf: 'flex-start' }}>{sprintf(__('%d failed'), failed)}</span>
  if (sent) return <span className="sint-pill ok" style={{ alignSelf: 'flex-start' }}>{sprintf(__('Shared to %d'), sent)}</span>
  if (item.status === 'publish') return <span className="sint-pill muted" style={{ alignSelf: 'flex-start' }}>{__('Not shared yet')}</span>
  return null
}
