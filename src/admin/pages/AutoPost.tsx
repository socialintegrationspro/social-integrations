import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Icon, NetBadge, Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { initials } from '../lib/format'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { pickMedia } from '../lib/media'
import { useStore } from '../lib/store'
import type { BuiltShare, ContentItem, MediaItem, MediaSource } from '../lib/types'
import type { CampaignRef } from './Composer'

/** Props for a `sint.autopost.options` control, shown with an auto-post campaign's settings. */
export interface AutoPostOptionProps {
  /** The campaign to read settings from: the one edited or copied, or 0 for a new one. */
  campaignId: number
  /** Post types the campaign shares. */
  postTypes: string[]
  /** Called on Save with the saved campaign's ID, after the campaign is saved. */
  registerSave: (key: string, save: (id: number) => Promise<unknown>) => void
}

/** A `sint.autopost.options` entry. `area` is the column it shows in: which posts, or when (the default). */
interface AutoPostOption {
  key: string
  component: ComponentType<AutoPostOptionProps>
  area?: 'posts' | 'when'
}

type Unit = 'minutes' | 'hours' | 'days'

interface AutoCampaign {
  id: number
  name: string
  active: boolean
  post_types: string[]
  accounts: string[]
  delay: { value: number; unit: Unit }
  caption: string
  captions: Record<string, string>
  media: MediaSource
  custom_media: MediaItem[]
}

const TOKENS = ['{title}', '{excerpt}', '{url}', '{tags}', '{author}', '{site}']
const DEFAULT_CAPTION = '{title}\n\n{excerpt}\n\n{url}'

const SOURCES = (): { value: MediaSource; label: string }[] => [
  { value: 'auto', label: __('Featured + post images') },
  { value: 'featured', label: __('Featured image') },
  { value: 'content', label: __('Images in the post') },
  { value: 'custom', label: __('Chosen images') },
  { value: 'none', label: __('No media') },
]

const BLANK: AutoCampaign = { id: 0, name: '', active: true, post_types: ['post'], accounts: [], delay: { value: 0, unit: 'minutes' }, caption: '', captions: {}, media: 'auto', custom_media: [] }

/** The Auto-post tab of the composer: one campaign that shares new posts when they are published. */
export function AutoPost({ campaign, onSaved }: { campaign?: CampaignRef; onSaved: () => void }) {
  const { postTypes, accounts, network } = useStore()
  const toast = useToast()
  const source = campaign ? Number(campaign.id) : 0
  const editing = campaign && !campaign.copy ? source : 0
  const [c, setC] = useState<AutoCampaign | null>(campaign ? null : BLANK)
  const [tab, setTab] = useState('all')
  const [sample, setSample] = useState<ContentItem | null | undefined>(undefined)
  const [preview, setPreview] = useState<BuiltShare | null>(null)
  const [saving, setSaving] = useState(false)
  const savers = useRef<Record<string, (id: number) => Promise<unknown>>>({})

  useEffect(() => {
    if (!campaign) return
    api.get<AutoCampaign>(`campaigns/${campaign.id}`).then(
      (r) => {
        const d = r.data
        setC({ ...BLANK, ...d, captions: Array.isArray(d.captions) ? {} : d.captions, id: editing, name: campaign.copy ? sprintf(__('%s (copy)'), d.name) : d.name })
      },
      (e) => toast((e as Error).message, true),
    )
  }, [])

  // The latest published item of the campaign's post types, to preview with.
  const typesKey = c?.post_types.join(',') ?? ''
  useEffect(() => {
    if (!c) return
    const type = c.post_types.length === 1 ? c.post_types[0]! : 'any'
    api.get<ContentItem[]>(`content?type=${encodeURIComponent(type)}&status=publish&per_page=10`).then(
      (r) => setSample(r.data.find((i) => c.post_types.includes(i.type)) ?? null),
      () => setSample(null),
    )
  }, [typesKey])

  const key = c && sample ? JSON.stringify([sample.id, c.caption, c.captions, c.media, c.custom_media.map((m) => m.id)]) : ''
  useEffect(() => {
    if (!c || !sample) return setPreview(null)
    const t = setTimeout(() => {
      api.post<BuiltShare>(`content/${sample.id}/share`, { template: c }).then((r) => setPreview(r.data), () => setPreview(null))
    }, 350)
    return () => clearTimeout(t)
  }, [key])

  // Filter `sint.autopost.options`: more settings for the campaign.
  const extras = applyFilters<AutoPostOption[]>('sint.autopost.options', [])
  const registerSave = (name: string, fn: (id: number) => Promise<unknown>) => {
    savers.current[name] = fn
  }

  if (!c) return <div style={{ padding: 22 }}><div className="sint-skeleton" style={{ height: 320 }} /></div>

  const renderExtras = (area: 'posts' | 'when') =>
    extras.filter((x) => (x.area ?? 'when') === area).map(({ key: k, component: Extra }) => <Extra key={k} campaignId={source} postTypes={c.post_types} registerSave={registerSave} />)

  const set = (patch: Partial<AutoCampaign>) => setC({ ...c, ...patch })
  const connected = accounts.filter((a) => a.status === 'connected')
  const chosen = (id: string) => c.accounts.length === 0 || c.accounts.includes(id)
  const nets = Array.from(new Set(connected.filter((a) => chosen(a.id)).map((a) => a.network)))
  const current = nets.includes(tab) ? tab : 'all'

  const text = current === 'all' ? c.caption : c.captions[current] ?? ''
  const setText = (v: string) => {
    if (current === 'all') return set({ caption: v })
    const captions = { ...c.captions }
    if (v.trim() === '') delete captions[current]
    else captions[current] = v
    set({ captions })
  }
  const addMedia = () => {
    const opened = pickMedia((items) => set({ custom_media: [...c.custom_media, ...items.filter((x) => !c.custom_media.some((y) => y.id === x.id))] }))
    if (!opened) toast(__('The media library did not load. Reload the page and try again.'), true)
  }
  const toggleType = (name: string) => {
    const on = c.post_types.includes(name)
    if (on && c.post_types.length === 1) return
    set({ post_types: on ? c.post_types.filter((t) => t !== name) : [...c.post_types, name] })
  }
  const shownCaption = preview ? (current !== 'all' && !Array.isArray(preview.captions) && preview.captions[current]) || preview.caption : ''
  const delayText = c.delay.value === 0 ? __('Right after publishing') : sprintf(c.delay.unit === 'minutes' ? __('%d minutes after publishing') : c.delay.unit === 'hours' ? __('%d hours after publishing') : __('%d days after publishing'), c.delay.value)

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.post<AutoCampaign>(editing ? `campaigns/auto/${editing}` : 'campaigns/auto', c)
      await Promise.all(Object.values(savers.current).map((fn) => fn(r.data.id)))
      toast(editing ? __('Campaign saved.') : __('Campaign created. New posts that match will be shared.'))
      onSaved()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setSaving(false)
  }

  return (
    <>
      <div className="sint-autopost-to">
        <span className="sint-label">{__('Share to')}</span>
        {accounts.length === 0 && <a href="#/accounts">{__('Connect an account first')}</a>}
        {accounts.map((a) => {
          const on = chosen(a.id)
          return (
            <button key={a.id} type="button" className="sint-pick" aria-pressed={on} title={`${a.name} · ${network(a.network)?.label}`} aria-label={`${a.name}, ${network(a.network)?.label}`} onClick={() => {
              const all = accounts.map((x) => x.id)
              const base = c.accounts.length === 0 ? all : c.accounts
              const next = on ? base.filter((x) => x !== a.id) : [...base, a.id]
              set({ accounts: next.length === all.length ? [] : next })
            }}>
              {a.avatar ? <img src={a.avatar} alt="" /> : initials(a.name)}
              <NetBadge network={a.network} color={network(a.network)?.color} />
            </button>
          )
        })}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.accounts.length === 0 ? __('All accounts, and new ones you connect') : sprintf(__('%1$d of %2$d'), c.accounts.length, accounts.length)}</span>
      </div>

      <div className="sint-autopost">
        <aside className="col">
          <div className="sint-label">{__('Which posts')}</div>
          <div className="sint-field">
            <span>{__('Post types')}</span>
            <select className="sint-select" value="" aria-label={__('Add a post type')} disabled={c.post_types.length === postTypes.length} onChange={(e) => e.target.value && toggleType(e.target.value)}>
              <option value="">{c.post_types.length === postTypes.length ? __('All post types') : __('Add a post type…')}</option>
              {postTypes.filter((t) => !c.post_types.includes(t.name)).map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
            </select>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {c.post_types.map((name) => {
                const label = postTypes.find((t) => t.name === name)?.label ?? name
                const last = c.post_types.length === 1
                return (
                  <button key={name} type="button" className="sint-chip on" disabled={last} title={last ? __('A campaign needs at least one post type.') : undefined} aria-label={sprintf(__('Remove %s'), label)} onClick={() => toggleType(name)}>
                    {label}{!last && ' ×'}
                  </button>
                )
              })}
            </span>
          </div>
          {renderExtras('posts')}
        </aside>

        <section className="col mid" style={{ opacity: c.active ? 1 : 0.55 }}>
          <div className="sint-label">{__('What to post')}</div>
          {nets.length > 0 && (
            <div className="sint-seg" role="tablist" aria-label={__('Caption for')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
              <button type="button" role="tab" aria-selected={current === 'all'} className={current === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{__('All channels')}</button>
              {nets.map((n) => (
                <button key={n} type="button" role="tab" aria-selected={current === n} className={current === n ? 'on' : ''} onClick={() => setTab(n)}>
                  <NetBadge network={n} color={network(n)?.color} size={18} />
                  {network(n)?.label}
                  {c.captions[n] !== undefined && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} aria-label={__('Edited')} />}
                </button>
              ))}
            </div>
          )}
          <label className="sint-field">
            <span>{current === 'all' ? __('Caption') : sprintf(__('Caption for %s'), network(current)?.label ?? current)}</span>
            <textarea className="sint-textarea" rows={5} value={text} placeholder={current === 'all' ? DEFAULT_CAPTION : c.caption || DEFAULT_CAPTION} onChange={(e) => setText(e.target.value)} />
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TOKENS.map((t) => <button key={t} type="button" className="sint-chip" onClick={() => setText((text || (current === 'all' ? '' : c.caption)) + t)}>{t}</button>)}
            </span>
            <small>{current === 'all' ? __('Leave empty to use the default. {field:meta_key} adds any custom field.') : __('Leave empty to use the caption for all channels.')}</small>
          </label>
          <label className="sint-field" style={{ maxWidth: 320 }}>
            <span>{__('Media')}</span>
            <select className="sint-select" value={c.media} onChange={(e) => set({ media: e.target.value as MediaSource })}>
              {SOURCES().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {c.media === 'custom' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {c.custom_media.map((m, i) => (
                <button key={m.id} type="button" className="sint-media" aria-pressed="true" aria-label={sprintf(__('Remove image %d'), i + 1)} onClick={() => set({ custom_media: c.custom_media.filter((x) => x.id !== m.id) })}>
                  {m.type === 'image' ? <img src={m.url} alt="" /> : <Icon name="image" size={24} />}
                  <span>{__('Remove')}</span>
                </button>
              ))}
              <button type="button" className="sint-media add" onClick={addMedia}>
                <Icon name="plus" size={22} stroke={2} />
                <span>{__('Add')}</span>
              </button>
            </div>
          )}
          <div className="sint-autopost-share">
            <span className="sint-label">{sample ? sprintf(__('Preview: %s'), sample.title || __('(no title)')) : __('Preview')}</span>
            {sample === null ? (
              <p className="sint-sub">{__('Nothing published yet to preview with.')}</p>
            ) : preview ? (
              <>
                <p>{shownCaption}</p>
                {preview.media.length > 0 && (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {preview.media.map((m) => (m.type === 'image' ? <img key={m.url} className="sint-thumb" src={m.url} alt={m.alt} /> : <span key={m.url} className="sint-pill muted">{__('Video')}</span>))}
                  </span>
                )}
              </>
            ) : (
              <div className="sint-skeleton" style={{ height: 80 }} />
            )}
          </div>
        </section>

        <aside className="col side">
          <div className="sint-label">{__('When')}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, fontSize: 14 }}>
            <Toggle checked={c.active} onChange={(v) => set({ active: v })} label={__('Campaign is on')} />
            {c.active ? __('On: shares new posts') : __('Paused')}
          </label>
          <div className="sint-field">
            <span>{__('Share')}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <input type="number" min={0} max={365} className="sint-input" style={{ width: 90 }} aria-label={__('Delay')} value={c.delay.value} onChange={(e) => set({ delay: { ...c.delay, value: Math.max(0, Math.min(365, Number(e.target.value) || 0)) } })} />
              <select className="sint-select" style={{ flex: 1, minWidth: 0 }} aria-label={__('Delay unit')} value={c.delay.unit} onChange={(e) => set({ delay: { ...c.delay, unit: e.target.value as Unit } })}>
                <option value="minutes">{__('minutes')}</option>
                <option value="hours">{__('hours')}</option>
                <option value="days">{__('days')}</option>
              </select>
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ value: 0, unit: 'minutes' as Unit, label: __('Right away') }, { value: 10, unit: 'minutes' as Unit, label: __('10 min') }, { value: 1, unit: 'hours' as Unit, label: __('1 hour') }, { value: 1, unit: 'days' as Unit, label: __('1 day') }].map((p) => (
                <button key={p.label} type="button" className={`sint-chip${c.delay.value === p.value && (p.value === 0 || c.delay.unit === p.unit) ? ' on' : ''}`} onClick={() => set({ delay: { value: p.value, unit: p.unit } })}>{p.label}</button>
              ))}
            </span>
            <small>{delayText}</small>
          </div>
          {renderExtras('when')}
          <label className="sint-field">
            <span>{__('Name (optional)')}</span>
            <input className="sint-input" value={c.name} maxLength={191} placeholder={__('For example: Blog to LinkedIn')} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <small style={{ color: 'var(--faint)', fontSize: 12 }}>{__('A post shares on its first publish, not on updates. If it matches several campaigns, each account gets it once. Editors can change the caption or accounts for one post in the editor sidebar.')}</small>
          <button type="button" className="sint-btn primary" disabled={saving || !connected.length} onClick={save}>{saving ? __('Saving…') : editing ? __('Save campaign') : __('Create campaign')}</button>
        </aside>
      </div>
    </>
  )
}
