import { useEffect, useState, type ComponentType } from 'react'
import { Header, type PageProps } from '../components/Header'
import { LoadError, Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { config } from '../lib/config'
import { applyFilters, useFetch } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import type { BlockType, BlockUse, Settings } from '../lib/types'

export function SettingsPage(_props: PageProps) {
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  // The settings as the server last sent them, to tell when there are unsaved changes.
  const [saved, setSaved] = useState('')
  const blocks = useFetch<{ blocks: BlockType[] }>('blocks').data?.blocks ?? []
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)
  // API keys typed in this visit. The app sends a key once, and the server never sends it back.
  const [keys, setKeys] = useState<Record<string, string | null>>({})

  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    setLoadError('')
    api.get<Settings>('settings').then(
      (r) => {
        setSettings(r.data)
        setSaved(JSON.stringify(r.data))
      },
      (e) => setLoadError((e as Error).message),
    ).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const dirty = !!settings && (JSON.stringify(settings) !== saved || Object.values(keys).some((k) => k !== ''))
  // The browser asks before it leaves or reloads the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Filter `sint.settings.sections`: other plugins add cards below free's own. Each card saves its own data.
  const sections = applyFilters<{ key: string; component: ComponentType }[]>('sint.settings.sections', [])

  if (!settings) {
    return (
      <>
        <Header title={__('Settings', 'social-integrations')} />
        <div className="sint-body" aria-busy={loading}>
          {loadError ? (
            <LoadError message={sprintf(__('The settings did not load. %s', 'social-integrations'), loadError)} onRetry={load} busy={loading} />
          ) : (
            <>
              <span className="sint-sr">{__('Loading', 'social-integrations')}</span>
              <div className="sint-skeleton" style={{ height: 220, borderRadius: 'var(--r-card)' }} />
              <div className="sint-skeleton" style={{ height: 160, borderRadius: 'var(--r-card)' }} />
              <div className="sint-skeleton" style={{ height: 260, borderRadius: 'var(--r-card)' }} />
            </>
          )}
        </div>
      </>
    )
  }

  const setBlock = (name: string, use: BlockUse | '') => {
    const next = { ...settings.blocks }
    if (use) next[name] = use
    else delete next[name]
    setSettings({ ...settings, blocks: next })
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.post<Settings>('settings', { ...settings, ai_keys: keys })
      setSettings(r.data)
      setSaved(JSON.stringify(r.data))
      setKeys({})
      const chosen = r.data.ai_providers.find((p) => p.key === r.data.ai.provider)
      config.ai.ready = !!chosen && (!chosen.needs_key || chosen.has_key)
      toast(__('Settings saved.', 'social-integrations'))
    } catch (e) {
      toast((e as Error).message, true)
    }
    setSaving(false)
  }

  const uses: { value: BlockUse; label: string }[] = [
    { value: 'text', label: __('Caption text', 'social-integrations') },
    { value: 'excerpt', label: __('Excerpt text', 'social-integrations') },
    { value: 'media', label: __('Media', 'social-integrations') },
    { value: 'link', label: __('Link', 'social-integrations') },
    { value: 'skip', label: __('Do not use', 'social-integrations') },
    { value: 'remove', label: __('Never send', 'social-integrations') },
  ]
  const fallbackLabel = uses.find((u) => u.value === settings.block_fallback)?.label ?? ''
  const shownBlocks = showAll ? blocks : blocks.filter((b) => settings.blocks[b.name] || !b.core)

  return (
    <>
      <Header title={__('Settings', 'social-integrations')}>
        {dirty && !saving && <span className="sint-sub" role="status" style={{ fontSize: 13 }}>{__('Unsaved changes', 'social-integrations')}</span>}
        <button type="button" className="sint-btn primary" onClick={save} disabled={saving}>{saving ? __('Saving…', 'social-integrations') : __('Save changes', 'social-integrations')}</button>
      </Header>
      <div className="sint-body">
        <AICard settings={settings} setSettings={setSettings} keys={keys} setKeys={setKeys} />
        <div className="sint-card">
          <div className="sint-card-head">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2>{__('Block rules', 'social-integrations')}</h2>
              <p className="sint-sub" style={{ fontSize: 13 }}>{__('Set how each block in a post becomes caption text, media or a link. Editors can change the rule for one block in the block toolbar.', 'social-integrations')}</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600 }}>
              <Toggle checked={settings.allow_block_override} onChange={(v) => setSettings({ ...settings, allow_block_override: v })} label={__('Let editors change the rule for one block', 'social-integrations')} />
              {__('Let editors change the rule for one block', 'social-integrations')}
            </label>
          </div>
          <div className="sint-table-wrap">
            <table className="sint-table">
              <thead><tr><th>{__('Block', 'social-integrations')}</th><th>{__('Use as', 'social-integrations')}</th></tr></thead>
              <tbody>
                {shownBlocks.map((b) => (
                  <tr key={b.name}>
                    <td><div style={{ fontWeight: 700 }}>{b.title}</div><div className="sint-code">{b.name}</div></td>
                    <td>
                      <select className="sint-select" value={settings.blocks[b.name] ?? ''} onChange={(e) => setBlock(b.name, e.target.value as BlockUse | '')} aria-label={sprintf(__('Use of %s', 'social-integrations'), b.title)}>
                        <option value="">{sprintf(__('Default (%s)', 'social-integrations'), fallbackLabel)}</option>
                        {uses.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><div style={{ fontWeight: 700 }}>{__('Any other block', 'social-integrations')}</div><div className="sint-code">{__('default', 'social-integrations')}</div></td>
                  <td>
                    <select className="sint-select" value={settings.block_fallback} onChange={(e) => setSettings({ ...settings, block_fallback: e.target.value as BlockUse })} aria-label={__('Default use', 'social-integrations')}>
                      {uses.filter((u) => ['text', 'excerpt', 'skip'].includes(u.value)).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
            <button type="button" className="sint-btn ghost sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? __('Show only blocks with a rule', 'social-integrations') : sprintf(__('Show all %d blocks', 'social-integrations'), blocks.length)}
            </button>
          </div>
        </div>
        <div className="sint-card">
          <div className="sint-card-head">
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2>{__('Share log', 'social-integrations')}</h2>
              <p className="sint-sub" style={{ fontSize: 13 }}>{__('Select how long the share log keeps its entries. The plugin deletes older entries one time each day. Campaigns and the calendar do not change.', 'social-integrations')}</p>
            </div>
            <label className="sint-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <span>{__('Keep the share log', 'social-integrations')}</span>
              <select className="sint-select" value={settings.log_days} onChange={(e) => setSettings({ ...settings, log_days: Number(e.target.value) })}>
                {LOG_DAYS.map((d) => <option key={d} value={d}>{d ? sprintf(__('%d days', 'social-integrations'), d) : __('Always', 'social-integrations')}</option>)}
              </select>
            </label>
          </div>
        </div>
        {sections.map(({ key, component: Section }) => <Section key={key} />)}
      </div>
    </>
  )
}

const LOG_DAYS = [0, 30, 90, 180, 365]

const TONES = [
  { value: 'friendly', label: () => __('Friendly', 'social-integrations') },
  { value: 'professional', label: () => __('Professional', 'social-integrations') },
  { value: 'playful', label: () => __('Playful', 'social-integrations') },
  { value: 'informative', label: () => __('Informative', 'social-integrations') },
  { value: 'bold', label: () => __('Bold', 'social-integrations') },
]

/** Provider, API key, model and tone for "Write with AI". Saved with the page. */
function AICard({ settings, setSettings, keys, setKeys }: { settings: Settings; setSettings: (s: Settings) => void; keys: Record<string, string | null>; setKeys: (k: Record<string, string | null>) => void }) {
  const ai = settings.ai
  const provider = settings.ai_providers.find((p) => p.key === ai.provider)
  const setAI = (patch: Partial<Settings['ai']>) => setSettings({ ...settings, ai: { ...ai, ...patch } })
  const typed = provider ? keys[provider.key] : undefined
  const saved = !!provider?.has_key && typed !== null

  return (
    <div className="sint-card">
      <div className="sint-card-head">
        <div>
          <h2>{__('AI captions', 'social-integrations')}</h2>
          <p className="sint-sub" style={{ fontSize: 13 }}>{__('“Write with AI” in New campaign writes a caption from your post. It uses your API key. The plugin sends the post text only to the provider that you select.', 'social-integrations')}</p>
        </div>
      </div>
      <div className="sint-ai-grid">
        <label className="sint-field">
          <span>{__('Provider', 'social-integrations')}</span>
          <select className="sint-select" style={{ width: '100%' }} value={ai.provider} onChange={(e) => setAI({ provider: e.target.value, model: '' })}>
            <option value="">{__('Off', 'social-integrations')}</option>
            {settings.ai_providers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        {provider?.needs_key && (
          <label className="sint-field">
            <span id="sint-ai-key-label">{sprintf(__('%s API key', 'social-integrations'), provider.label)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-labelledby="sint-ai-key-label" aria-describedby="sint-ai-key-help" className="sint-input" type="password" autoComplete="off" value={typed ?? ''} placeholder={saved ? __('Saved. Type a new key to replace it.', 'social-integrations') : __('Paste your API key', 'social-integrations')} onChange={(e) => setKeys({ ...keys, [provider.key]: e.target.value })} />
              {saved && <button type="button" className="sint-btn ghost sm" style={{ height: 42 }} onClick={() => setKeys({ ...keys, [provider.key]: null })}>{__('Remove', 'social-integrations')}</button>}
            </div>
            <small id="sint-ai-key-help">{typed === null ? __('The plugin removes the key when you save.', 'social-integrations') : __('The plugin keeps the key encrypted on your site. It does not show the key again.', 'social-integrations')}</small>
          </label>
        )}
        {provider && provider.default_model && (
          <label className="sint-field">
            <span>{__('Model', 'social-integrations')}</span>
            <input className="sint-input" value={ai.model} placeholder={provider.default_model} onChange={(e) => setAI({ model: e.target.value.trim() })} />
            <small>{sprintf(__('Leave empty to use %s.', 'social-integrations'), provider.default_model)}</small>
          </label>
        )}
        {provider && (
          <label className="sint-field">
            <span>{__('Tone', 'social-integrations')}</span>
            <select className="sint-select" style={{ width: '100%' }} value={ai.tone} onChange={(e) => setAI({ tone: e.target.value })}>
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label()}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}
