import { useEffect, useRef, useState, type ComponentType } from 'react'
import { FieldPreview } from '../components/FieldPreview'
import { TemplateEditor, type ShareTemplate } from '../components/TemplateEditor'
import { AccountToggle, LoadError, Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { BuiltShare, ContentItem } from '../lib/types'
import type { CampaignRef } from './Composer'

/** Props for a `sint.autopost.options` control, shown with an auto-post campaign's settings. */
export interface AutoPostOptionProps {
  /** The campaign to read settings from: the one edited or copied, or 0 for a new one. */
  campaignId: number
  /** Post types the campaign shares. */
  postTypes: string[]
  /** The tab calls the registered function on Save with the ID of the saved campaign. */
  registerSave: (key: string, save: (id: number) => Promise<unknown>) => void
}

/** A `sint.autopost.options` entry. `area` is the column it shows in: which posts, or when (the default). */
interface AutoPostOption {
  key: string
  component: ComponentType<AutoPostOptionProps>
  area?: 'posts' | 'when'
}

type Unit = 'minutes' | 'hours' | 'days'

interface AutoCampaign extends ShareTemplate {
  id: number
  name: string
  active: boolean
  post_types: string[]
  accounts: string[]
  delay: { value: number; unit: Unit }
}

const DEFAULT_CAPTION = '{title}\n\n{excerpt}\n\n{url}'

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
  const [previewFailed, setPreviewFailed] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const savers = useRef<Record<string, (id: number) => Promise<unknown>>>({})

  const load = () => {
    if (!campaign) return
    setLoadError('')
    api.get<AutoCampaign>(`campaigns/${campaign.id}`).then(
      (r) => {
        const d = r.data
        setC({ ...BLANK, ...d, captions: Array.isArray(d.captions) ? {} : d.captions, id: editing, name: campaign.copy ? sprintf(__('%s (copy)', 'social-integrations'), d.name) : d.name })
      },
      (e) => setLoadError((e as Error).message),
    )
  }
  useEffect(load, [])

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

  const key = c && sample ? JSON.stringify([sample.id, c.caption, c.captions, c.media, c.custom_media.map((m) => m.id), c.link, c.fields]) : ''
  useEffect(() => {
    if (!c || !sample) return setPreview(null)
    const t = setTimeout(() => {
      setPreviewFailed(false)
      api.post<BuiltShare>(`content/${sample.id}/share`, { template: c }).then(
        (r) => setPreview(r.data),
        () => {
          setPreview(null)
          setPreviewFailed(true)
        },
      )
    }, 350)
    return () => clearTimeout(t)
  }, [key])

  // Filter `sint.autopost.options`: more settings for the campaign.
  const extras = applyFilters<AutoPostOption[]>('sint.autopost.options', [])
  const registerSave = (name: string, fn: (id: number) => Promise<unknown>) => {
    savers.current[name] = fn
  }

  if (!c) {
    return (
      <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy={!loadError}>
        {loadError ? (
          <LoadError message={sprintf(__('The campaign did not load. %s', 'social-integrations'), loadError)} onRetry={load} />
        ) : (
          <>
            <div className="sint-skeleton" style={{ height: 48 }} />
            <div className="sint-skeleton" style={{ height: 320 }} />
          </>
        )}
      </div>
    )
  }

  const renderExtras = (area: 'posts' | 'when') =>
    extras.filter((x) => (x.area ?? 'when') === area).map(({ key: k, component: Extra }) => <Extra key={k} campaignId={source} postTypes={c.post_types} registerSave={registerSave} />)

  const set = (patch: Partial<AutoCampaign>) => setC({ ...c, ...patch })
  const connected = accounts.filter((a) => a.status === 'connected')
  const chosen = (id: string) => c.accounts.length === 0 || c.accounts.includes(id)
  const nets = Array.from(new Set(connected.filter((a) => chosen(a.id)).map((a) => a.network)))
  const current = nets.includes(tab) ? tab : 'all'


  const shownCaption = preview ? (current !== 'all' && !Array.isArray(preview.captions) && preview.captions[current]) || preview.caption : ''
  const delayText = c.delay.value === 0 ? __('Immediately after you publish', 'social-integrations') : sprintf(c.delay.unit === 'minutes' ? __('%d minutes after you publish', 'social-integrations') : c.delay.unit === 'hours' ? __('%d hours after you publish', 'social-integrations') : __('%d days after you publish', 'social-integrations'), c.delay.value)

  const save = async () => {
    if (!c?.name.trim()) {
      setNameError(true)
      nameRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const r = await api.post<AutoCampaign>(editing ? `campaigns/auto/${editing}` : 'campaigns/auto', c)
      await Promise.all(Object.values(savers.current).map((fn) => fn(r.data.id)))
      toast(editing ? __('Campaign saved.', 'social-integrations') : __('Campaign created. The plugin will share new posts that match.', 'social-integrations'))
      onSaved()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setSaving(false)
  }

  return (
    <>
      <div className="sint-autopost-to">
        <span className="sint-label">{__('Share to', 'social-integrations')}</span>
        {accounts.length === 0 && <a href="#/accounts">{__('Connect an account first', 'social-integrations')}</a>}
        {accounts.map((a) => {
          const on = chosen(a.id)
          return (
            <AccountToggle key={a.id} account={a} network={network(a.network)} on={on} onToggle={() => {
              const all = accounts.map((x) => x.id)
              const base = c.accounts.length === 0 ? all : c.accounts
              const next = on ? base.filter((x) => x !== a.id) : [...base, a.id]
              set({ accounts: next.length === all.length ? [] : next })
            }} />
          )
        })}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.accounts.length === 0 ? __('All accounts, and new ones you connect', 'social-integrations') : sprintf(__('%1$d of %2$d', 'social-integrations'), c.accounts.length, accounts.length)}</span>
      </div>

      <div className="sint-autopost">
        <aside className="col">
          <div className="sint-label">{__('Which posts', 'social-integrations')}</div>
          <label className="sint-field">
            <span>{__('Post type', 'social-integrations')}</span>
            <select className="sint-select" value={c.post_types[0] ?? 'post'} onChange={(e) => set({ post_types: [e.target.value] })}>
              {postTypes.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
            </select>
          </label>
          {renderExtras('posts')}
        </aside>

        <section className="col mid" style={{ opacity: c.active ? 1 : 0.55 }}>
          <div className="sint-label">{__('What to post', 'social-integrations')}</div>
          <TemplateEditor
            value={c}
            onChange={set}
            nets={nets}
            tab={current}
            setTab={setTab}
            placeholder={DEFAULT_CAPTION}
            hint={__('Leave empty to use the default. {field:meta_key} adds any custom field.', 'social-integrations')}
          />
          <div className="sint-autopost-share">
            <span className="sint-label">{sample ? sprintf(__('Preview: %s', 'social-integrations'), sample.title || __('(no title)', 'social-integrations')) : __('Preview', 'social-integrations')}</span>
            {sample === null ? (
              <p className="sint-sub">{__('No published post is available for the preview.', 'social-integrations')}</p>
            ) : previewFailed ? (
              <p className="sint-sub">{__('The preview did not load. Change the caption to try again.', 'social-integrations')}</p>
            ) : preview ? (
              <>
                <p>{shownCaption}</p>
                {preview.media.length > 0 && (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {preview.media.map((m) => (m.type === 'image' ? <img key={m.url} className="sint-thumb" src={m.url} alt={m.alt} /> : <span key={m.url} className="sint-pill muted">{__('Video', 'social-integrations')}</span>))}
                  </span>
                )}
                <FieldPreview nets={current === 'all' ? nets : [current]} fields={preview.fields} link={preview.link} />
              </>
            ) : (
              <div className="sint-skeleton" style={{ height: 80 }} />
            )}
          </div>
        </section>

        <aside className="col side">
          <div className="sint-label">{__('When', 'social-integrations')}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, fontSize: 14 }}>
            <Toggle checked={c.active} onChange={(v) => set({ active: v })} label={__('Campaign is on', 'social-integrations')} />
            {c.active ? __('On: shares new posts', 'social-integrations') : __('Paused', 'social-integrations')}
          </label>
          <div className="sint-field">
            <span>{__('Share', 'social-integrations')}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <input type="number" min={0} max={365} className="sint-input" style={{ width: 90 }} aria-label={__('Delay', 'social-integrations')} value={c.delay.value} onChange={(e) => set({ delay: { ...c.delay, value: Math.max(0, Math.min(365, Number(e.target.value) || 0)) } })} />
              <select className="sint-select" style={{ flex: 1, minWidth: 0 }} aria-label={__('Delay unit', 'social-integrations')} value={c.delay.unit} onChange={(e) => set({ delay: { ...c.delay, unit: e.target.value as Unit } })}>
                <option value="minutes">{__('minutes', 'social-integrations')}</option>
                <option value="hours">{__('hours', 'social-integrations')}</option>
                <option value="days">{__('days', 'social-integrations')}</option>
              </select>
            </span>
            {/* Even columns: two rows of two in the narrow column, one row when there is space. */}
            <span style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
              {[{ value: 0, unit: 'minutes' as Unit, label: __('Immediately', 'social-integrations') }, { value: 10, unit: 'minutes' as Unit, label: __('10 min', 'social-integrations') }, { value: 1, unit: 'hours' as Unit, label: __('1 hour', 'social-integrations') }, { value: 1, unit: 'days' as Unit, label: __('1 day', 'social-integrations') }].map((p) => (
                <button key={p.label} type="button" className={`sint-chip${c.delay.value === p.value && (p.value === 0 || c.delay.unit === p.unit) ? ' on' : ''}`} style={{ justifyContent: 'center' }} onClick={() => set({ delay: { value: p.value, unit: p.unit } })}>{p.label}</button>
              ))}
            </span>
            <small>{delayText}</small>
          </div>
          {renderExtras('when')}
          <label className="sint-field">
            <span>{__('Name', 'social-integrations')}</span>
            <input ref={nameRef} className={`sint-input${nameError ? ' invalid' : ''}`} value={c.name} maxLength={191} required aria-invalid={nameError} aria-describedby={nameError ? 'sint-auto-name-error' : undefined} placeholder={__('For example: Blog to LinkedIn', 'social-integrations')} onChange={(e) => { set({ name: e.target.value }); if (e.target.value.trim()) setNameError(false) }} />
            {nameError && <small id="sint-auto-name-error" className="sint-field-error">{__('Enter a name for the campaign.', 'social-integrations')}</small>}
          </label>
          <small style={{ color: 'var(--faint)', fontSize: 12 }}>{__('The plugin shares a post when you publish it for the first time, not when you update it. If a post matches more than one campaign, each account gets it one time. Editors can change the caption or the accounts for one post in the editor sidebar.', 'social-integrations')}</small>
          <button type="button" className="sint-btn primary" disabled={saving || !connected.length} onClick={save}>{saving ? __('Wait…', 'social-integrations') : editing ? __('Save campaign', 'social-integrations') : __('Create campaign', 'social-integrations')}</button>
        </aside>
      </div>
    </>
  )
}
