import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Icon, NetBadge, Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { initials } from '../lib/format'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { pickMedia } from '../lib/media'
import { useStore } from '../lib/store'
import type { BuiltShare, ContentItem, MediaSource, PostTypeRule, Settings } from '../lib/types'
import { ruleOf } from './Settings'

/** Props for a `sint.autopost.options` control, shown with a post type's auto-post settings. */
export interface AutoPostOptionProps {
  postType: string
  /** Called on Save, after the post type rules are saved. */
  registerSave: (key: string, save: () => Promise<unknown>) => void
}

/** A `sint.autopost.options` entry. `area` is the column it shows in: which posts, or when (the default). */
interface AutoPostOption {
  key: string
  component: ComponentType<AutoPostOptionProps>
  area?: 'posts' | 'when'
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

/** The Auto-post tab of the composer: how each post type is shared when it is published. */
export function AutoPost() {
  const { postTypes, accounts, network } = useStore()
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [type, setType] = useState(postTypes[0]?.name ?? 'post')
  const [tab, setTab] = useState('all')
  const [sample, setSample] = useState<Record<string, ContentItem | null>>({})
  const [preview, setPreview] = useState<BuiltShare | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const savers = useRef<Record<string, () => Promise<unknown>>>({})

  useEffect(() => {
    api.get<Settings>('settings').then((r) => setSettings(r.data), (e) => toast((e as Error).message, true))
  }, [])

  // The latest published item of the type, to preview the template with.
  useEffect(() => {
    if (type in sample) return
    api.get<ContentItem[]>(`content?type=${encodeURIComponent(type)}&status=publish&per_page=1`).then(
      (r) => setSample((s) => ({ ...s, [type]: r.data[0] ?? null })),
      () => setSample((s) => ({ ...s, [type]: null })),
    )
  }, [type])

  const rule = settings ? ruleOf(settings, type) : null
  const item = sample[type]
  const key = rule && item ? JSON.stringify([item.id, rule.template, rule.captions, rule.media, rule.custom_media.map((m) => m.id)]) : ''
  useEffect(() => {
    if (!rule || !item) return setPreview(null)
    const t = setTimeout(() => {
      api.post<BuiltShare>(`content/${item.id}/share`, { template: rule }).then((r) => setPreview(r.data), () => setPreview(null))
    }, 350)
    return () => clearTimeout(t)
  }, [key])

  // Filter `sint.autopost.options`: more auto-post settings for the selected post type.
  const extras = applyFilters<AutoPostOption[]>('sint.autopost.options', [])
  const registerSave = (name: string, fn: () => Promise<unknown>) => {
    savers.current[name] = fn
  }
  const renderExtras = (area: 'posts' | 'when') =>
    extras.filter((x) => (x.area ?? 'when') === area).map(({ key: k, component: Extra }) => <Extra key={`${k}-${type}`} postType={type} registerSave={registerSave} />)

  if (!settings || !rule) return <div style={{ padding: 22 }}><div className="sint-skeleton" style={{ height: 320 }} /></div>

  const setRule = (patch: Partial<PostTypeRule>) => {
    setSettings({ ...settings, post_types: { ...settings.post_types, [type]: { ...rule, ...patch } } })
    setDirty(true)
  }
  const label = postTypes.find((t) => t.name === type)?.label ?? type
  const connected = accounts.filter((a) => a.status === 'connected')
  const chosen = (id: string) => rule.accounts.length === 0 || rule.accounts.includes(id)
  const nets = Array.from(new Set(connected.filter((a) => chosen(a.id)).map((a) => a.network)))
  const current = nets.includes(tab) ? tab : 'all'

  const text = current === 'all' ? rule.template : rule.captions[current] ?? ''
  const setText = (v: string) => {
    if (current === 'all') return setRule({ template: v })
    const captions = { ...rule.captions }
    if (v.trim() === '') delete captions[current]
    else captions[current] = v
    setRule({ captions })
  }
  const addMedia = () => {
    const opened = pickMedia((items) => setRule({ custom_media: [...rule.custom_media, ...items.filter((x) => !rule.custom_media.some((y) => y.id === x.id))] }))
    if (!opened) toast(__('The media library did not load. Reload the page and try again.'), true)
  }
  const shownCaption = preview ? (current !== 'all' && !Array.isArray(preview.captions) && preview.captions[current]) || preview.caption : ''

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.post<Settings>('settings', { post_types: settings.post_types })
      setSettings(r.data)
      await Promise.all(Object.values(savers.current).map((fn) => fn()))
      setDirty(false)
      toast(__('Auto-post settings saved.'))
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
              const base = rule.accounts.length === 0 ? all : rule.accounts
              const next = on ? base.filter((x) => x !== a.id) : [...base, a.id]
              setRule({ accounts: next.length === all.length ? [] : next })
            }}>
              {a.avatar ? <img src={a.avatar} alt="" /> : initials(a.name)}
              <NetBadge network={a.network} color={network(a.network)?.color} />
            </button>
          )
        })}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rule.accounts.length === 0 ? __('All accounts, and new ones you connect') : sprintf(__('%1$d of %2$d'), rule.accounts.length, accounts.length)}</span>
      </div>

      <div className="sint-autopost">
        <aside className="col">
          <div className="sint-label">{__('Which posts')}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label={__('Post type')}>
            {postTypes.map((t) => {
              const on = ruleOf(settings, t.name).auto
              return (
                <button key={t.name} type="button" role="tab" aria-selected={t.name === type} className={`sint-chip${t.name === type ? ' on' : ''}`} onClick={() => setType(t.name)}>
                  {t.label}
                  <span className={`sint-autopost-dot${on ? ' on' : ''}`} aria-label={on ? __('On') : __('Off')} />
                </button>
              )
            })}
          </div>
          {renderExtras('posts')}
        </aside>

        <section className="col mid" style={{ opacity: rule.auto ? 1 : 0.55 }}>
          <div className="sint-label">{__('What to post')}</div>
          {nets.length > 0 && (
            <div className="sint-seg" role="tablist" aria-label={__('Caption for')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
              <button type="button" role="tab" aria-selected={current === 'all'} className={current === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{__('All channels')}</button>
              {nets.map((n) => (
                <button key={n} type="button" role="tab" aria-selected={current === n} className={current === n ? 'on' : ''} onClick={() => setTab(n)}>
                  <NetBadge network={n} color={network(n)?.color} size={18} />
                  {network(n)?.label}
                  {rule.captions[n] !== undefined && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} aria-label={__('Edited')} />}
                </button>
              ))}
            </div>
          )}
          <label className="sint-field">
            <span>{current === 'all' ? __('Caption') : sprintf(__('Caption for %s'), network(current)?.label ?? current)}</span>
            <textarea className="sint-textarea" rows={5} value={text} placeholder={current === 'all' ? DEFAULT_CAPTION : rule.template || DEFAULT_CAPTION} onChange={(e) => setText(e.target.value)} />
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TOKENS.map((t) => <button key={t} type="button" className="sint-chip" onClick={() => setText((text || (current === 'all' ? '' : rule.template)) + t)}>{t}</button>)}
            </span>
            <small>{current === 'all' ? __('Leave empty to use the default. {field:meta_key} adds any custom field.') : __('Leave empty to use the caption for all channels.')}</small>
          </label>
          <label className="sint-field" style={{ maxWidth: 320 }}>
            <span>{__('Media')}</span>
            <select className="sint-select" value={rule.media} onChange={(e) => setRule({ media: e.target.value as MediaSource })}>
              {SOURCES().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {rule.media === 'custom' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {rule.custom_media.map((m, i) => (
                <button key={m.id} type="button" className="sint-media" aria-pressed="true" aria-label={sprintf(__('Remove image %d'), i + 1)} onClick={() => setRule({ custom_media: rule.custom_media.filter((x) => x.id !== m.id) })}>
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
            <span className="sint-label">{item ? sprintf(__('Preview: %s'), item.title || __('(no title)')) : __('Preview')}</span>
            {item === null ? (
              <p className="sint-sub">{sprintf(__('No published %s yet to preview with.'), label.toLowerCase())}</p>
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
            <Toggle checked={rule.auto} onChange={(v) => setRule({ auto: v })} label={sprintf(__('Share %s when published'), label)} />
            {sprintf(__('Share %s when published'), label.toLowerCase())}
          </label>
          <label className="sint-field">
            <span>{__('After publishing, wait')}</span>
            <select className="sint-select" disabled={!rule.auto} value={rule.delay} onChange={(e) => setRule({ delay: +e.target.value })}>
              <option value={15}>{__('15 seconds')}</option>
              <option value={300}>{__('5 minutes')}</option>
              <option value={1800}>{__('30 minutes')}</option>
              <option value={3600}>{__('1 hour')}</option>
            </select>
          </label>
          {renderExtras('when')}
          <small style={{ color: 'var(--faint)', fontSize: 12 }}>{__('A post shares on its first publish, not on updates. Editors can change the caption or accounts for one post in the editor sidebar.')}</small>
          {dirty && <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={14} />{__('Unsaved changes')}</span>}
          <button type="button" className="sint-btn primary" disabled={saving} onClick={save}>{saving ? __('Saving…') : __('Save auto-post settings')}</button>
        </aside>
      </div>
    </>
  )
}
