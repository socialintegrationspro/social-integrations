import { useEffect, useState, type ComponentType } from 'react'
import { Header, type PageProps } from '../App'
import { Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { config } from '../lib/config'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import type { BlockType, BlockUse, Settings } from '../lib/types'

export function SettingsPage(_props: PageProps) {
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [blocks, setBlocks] = useState<BlockType[]>([])
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)
  // API keys typed in this visit. A key is sent once and never comes back.
  const [keys, setKeys] = useState<Record<string, string | null>>({})

  useEffect(() => {
    api.get<Settings>('settings').then((r) => setSettings(r.data))
    api.get<{ blocks: BlockType[] }>('blocks').then((r) => setBlocks(r.data.blocks))
  }, [])

  // Filter `sint.settings.sections`: other plugins add cards below free's own. Each card saves its own data.
  const sections = applyFilters<{ key: string; component: ComponentType }[]>('sint.settings.sections', [])

  if (!settings) return <><Header title={__('Settings')} /><div className="sint-body"><div className="sint-skeleton" style={{ height: 400 }} /></div></>

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
      setKeys({})
      const chosen = r.data.ai_providers.find((p) => p.key === r.data.ai.provider)
      config.ai.ready = !!chosen && (!chosen.needs_key || chosen.has_key)
      toast(__('Settings saved.'))
    } catch (e) {
      toast((e as Error).message, true)
    }
    setSaving(false)
  }

  const uses: { value: BlockUse; label: string }[] = [
    { value: 'text', label: __('Caption text') },
    { value: 'excerpt', label: __('Excerpt text') },
    { value: 'media', label: __('Media') },
    { value: 'link', label: __('Link') },
    { value: 'skip', label: __('Skip') },
    { value: 'remove', label: __('Remove') },
  ]
  const fallbackLabel = uses.find((u) => u.value === settings.block_fallback)?.label ?? ''
  const shownBlocks = showAll ? blocks : blocks.filter((b) => settings.blocks[b.name] || !b.core)

  return (
    <>
      <Header title={__('Settings')}>
        <button type="button" className="sint-btn primary" onClick={save} disabled={saving}>{saving ? __('Saving…') : __('Save changes')}</button>
      </Header>
      <div className="sint-body">
        <AICard settings={settings} setSettings={setSettings} keys={keys} setKeys={setKeys} />
        <div className="sint-card">
          <div className="sint-card-head">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2>{__('Blocks')}</h2>
              <p className="sint-sub" style={{ fontSize: 13 }}>{__('How each block in a post becomes caption text, media or a link. Editors can change it for one block from the block toolbar.')}</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600 }}>
              <Toggle checked={settings.allow_block_override} onChange={(v) => setSettings({ ...settings, allow_block_override: v })} label={__('Allow change for one block in the editor')} />
              {__('Allow change for one block in the editor')}
            </label>
          </div>
          <div className="sint-table-wrap">
            <table className="sint-table">
              <thead><tr><th>{__('Block')}</th><th>{__('Use as')}</th></tr></thead>
              <tbody>
                {shownBlocks.map((b) => (
                  <tr key={b.name}>
                    <td><div style={{ fontWeight: 700 }}>{b.title}</div><div className="sint-code">{b.name}</div></td>
                    <td>
                      <select className="sint-select" value={settings.blocks[b.name] ?? ''} onChange={(e) => setBlock(b.name, e.target.value as BlockUse | '')} aria-label={sprintf(__('Use of %s'), b.title)}>
                        <option value="">{sprintf(__('Default (%s)'), fallbackLabel)}</option>
                        {uses.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><div style={{ fontWeight: 700 }}>{__('Any other block')}</div><div className="sint-code">{__('default')}</div></td>
                  <td>
                    <select className="sint-select" value={settings.block_fallback} onChange={(e) => setSettings({ ...settings, block_fallback: e.target.value as BlockUse })} aria-label={__('Default use')}>
                      {uses.filter((u) => ['text', 'excerpt', 'skip'].includes(u.value)).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
            <button type="button" className="sint-btn ghost sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? __('Show only blocks with a rule') : sprintf(__('Show all %d blocks'), blocks.length)}
            </button>
          </div>
        </div>
        {sections.map(({ key, component: Section }) => <Section key={key} />)}
      </div>
    </>
  )
}

const TONES = [
  { value: 'friendly', label: () => __('Friendly') },
  { value: 'professional', label: () => __('Professional') },
  { value: 'playful', label: () => __('Playful') },
  { value: 'informative', label: () => __('Informative') },
  { value: 'bold', label: () => __('Bold') },
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
          <h2>{__('AI captions')}</h2>
          <p className="sint-sub" style={{ fontSize: 13 }}>{__('“Write with AI” in New campaign drafts a caption from your post. It uses your own API key; the post text goes only to the provider you choose.')}</p>
        </div>
      </div>
      <div className="sint-ai-grid">
        <label className="sint-field">
          <span>{__('Provider')}</span>
          <select className="sint-select" style={{ width: '100%' }} value={ai.provider} onChange={(e) => setAI({ provider: e.target.value, model: '' })}>
            <option value="">{__('Off')}</option>
            {settings.ai_providers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        {provider?.needs_key && (
          <label className="sint-field">
            <span>{sprintf(__('%s API key'), provider.label)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="sint-input" type="password" autoComplete="off" value={typed ?? ''} placeholder={saved ? __('Saved. Type to replace.') : __('Paste your API key')} onChange={(e) => setKeys({ ...keys, [provider.key]: e.target.value })} />
              {saved && <button type="button" className="sint-btn ghost sm" style={{ height: 42 }} onClick={() => setKeys({ ...keys, [provider.key]: null })}>{__('Remove')}</button>}
            </div>
            <small>{typed === null ? __('The key is removed when you save.') : __('Stored encrypted on your site. It is never shown again.')}</small>
          </label>
        )}
        {provider && provider.default_model && (
          <label className="sint-field">
            <span>{__('Model')}</span>
            <input className="sint-input" value={ai.model} placeholder={provider.default_model} onChange={(e) => setAI({ model: e.target.value.trim() })} />
            <small>{sprintf(__('Leave empty to use %s.'), provider.default_model)}</small>
          </label>
        )}
        {provider && (
          <label className="sint-field">
            <span>{__('Tone')}</span>
            <select className="sint-select" style={{ width: '100%' }} value={ai.tone} onChange={(e) => setAI({ tone: e.target.value })}>
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label()}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}
