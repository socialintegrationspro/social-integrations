import { useEffect, useState, type ComponentType } from 'react'
import { Header, type PageProps } from '../App'
import { Icon, NetBadge, Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { config } from '../lib/config'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { pickMedia } from '../lib/media'
import { useStore } from '../lib/store'
import type { BlockType, BlockUse, MediaSource, PostTypeRule, Settings } from '../lib/types'

export const DEFAULT_RULE: PostTypeRule = { auto: false, delay: 15, accounts: [], template: '', captions: {}, media: 'auto', custom_media: [] }

export function SettingsPage(_props: PageProps) {
  const { postTypes, accounts, network } = useStore()
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [blocks, setBlocks] = useState<BlockType[]>([])
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
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

  const rule = (type: string): PostTypeRule => ruleOf(settings, type)
  const setRule = (type: string, patch: Partial<PostTypeRule>) =>
    setSettings({ ...settings, post_types: { ...settings.post_types, [type]: { ...rule(type), ...patch } } })
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
            <div>
              <h2>{__('Post types')}</h2>
              <p className="sint-sub" style={{ fontSize: 13 }}>{__('All public post types on this site, including custom ones from other plugins and your theme.')}</p>
            </div>
          </div>
          <div className="sint-table-wrap">
            <table className="sint-table">
              <thead>
                <tr>
                  <th>{__('Post type')}</th>
                  <th>{__('Source')}</th>
                  <th>{__('Share on publish')}</th>
                  <th>{__('Delay')}</th>
                  <th>{__('Accounts')}</th>
                  <th>{__('Caption template')}</th>
                </tr>
              </thead>
              <tbody>
                {postTypes.map((t) => {
                  const r = rule(t.name)
                  return (
                    <tr key={t.name}>
                      <td><div style={{ fontWeight: 700 }}>{t.label}</div><div className="sint-code">{t.name}</div></td>
                      <td><span className="sint-pill muted">{t.source}</span></td>
                      <td><Toggle checked={r.auto} onChange={(v) => setRule(t.name, { auto: v })} label={sprintf(__('Share %s on publish'), t.label)} /></td>
                      <td>
                        <select className="sint-select" style={{ minWidth: 140 }} disabled={!r.auto} value={r.delay} onChange={(e) => setRule(t.name, { delay: +e.target.value })} aria-label={sprintf(__('Delay for %s'), t.label)}>
                          <option value={15}>{__('15 seconds')}</option>
                          <option value={300}>{__('5 minutes')}</option>
                          <option value={1800}>{__('30 minutes')}</option>
                          <option value={3600}>{__('1 hour')}</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {accounts.length === 0 && <span style={{ color: 'var(--faint)', fontSize: 12 }}>{__('No accounts yet')}</span>}
                          {accounts.map((a) => {
                            const on = r.accounts.length === 0 || r.accounts.includes(a.id)
                            return (
                              <button key={a.id} type="button" aria-pressed={on} title={a.name} onClick={() => {
                                const current = r.accounts.length === 0 ? accounts.map((x) => x.id) : r.accounts
                                const next = on ? current.filter((x) => x !== a.id) : [...current, a.id]
                                setRule(t.name, { accounts: next.length === accounts.length ? [] : next })
                              }} style={{ border: 0, background: 'transparent', padding: 2, cursor: 'pointer', opacity: on ? 1 : 0.3 }}>
                                <NetBadge network={a.network} color={network(a.network)?.color} size={24} />
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      <td>
                        <button type="button" className="sint-btn sm" onClick={() => setEditing(editing === t.name ? null : t.name)}>
                          {r.template || Object.keys(r.captions).length || r.media !== 'auto' ? __('Custom') : __('Default')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {editing && (
            <TemplateEditor
              label={postTypes.find((t) => t.name === editing)?.label ?? editing}
              rule={rule(editing)}
              onChange={(patch) => setRule(editing, patch)}
            />
          )}
        </div>

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

/** A post type's rule, with defaults. PHP sends an empty map as []. */
export function ruleOf(settings: Settings, type: string): PostTypeRule {
  const r = { ...DEFAULT_RULE, ...(settings.post_types[type] ?? {}) }
  return Array.isArray(r.captions) ? { ...r, captions: {} } : r
}

/** Caption for all networks, a caption for single networks, and where media comes from. */
function TemplateEditor({ label, rule, onChange }: { label: string; rule: PostTypeRule; onChange: (patch: Partial<PostTypeRule>) => void }) {
  const { networks } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('all')
  const text = tab === 'all' ? rule.template : rule.captions[tab] ?? ''
  const setText = (v: string) => {
    if (tab === 'all') return onChange({ template: v })
    const captions = { ...rule.captions }
    if (v.trim() === '') delete captions[tab]
    else captions[tab] = v
    onChange({ captions })
  }
  const sources: { value: MediaSource; label: string; hint: string }[] = [
    { value: 'auto', label: __('Featured + post images'), hint: __('Images marked in the editor, then the featured image, then the other images in the post.') },
    { value: 'featured', label: __('Featured image'), hint: __('The featured image, or the first image in the post when there is none.') },
    { value: 'content', label: __('Images in the post'), hint: __('Only the images and videos in the post content.') },
    { value: 'custom', label: __('Chosen images'), hint: __('The same images for every item, picked from the media library.') },
    { value: 'none', label: __('No media'), hint: __('Text and link only.') },
  ]
  const addMedia = () => {
    const opened = pickMedia((items) => onChange({ custom_media: [...rule.custom_media, ...items.filter((x) => !rule.custom_media.some((y) => y.id === x.id))] }))
    if (!opened) toast(__('The media library did not load. Reload the page and try again.'), true)
  }

  return (
    <div style={{ padding: 20, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontWeight: 700 }}>{sprintf(__('Template for %s'), label)}</div>
      <div className="sint-seg" role="tablist" aria-label={__('Caption for')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{__('All channels')}</button>
        {networks.map((n) => (
          <button key={n.key} type="button" role="tab" aria-selected={tab === n.key} className={tab === n.key ? 'on' : ''} onClick={() => setTab(n.key)}>
            <NetBadge network={n.key} color={n.color} size={18} />
            {n.label}
            {rule.captions[n.key] !== undefined && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} aria-label={__('Edited')} />}
          </button>
        ))}
      </div>
      <label className="sint-field">
        <span>{tab === 'all' ? __('Caption') : sprintf(__('Caption for %s'), networks.find((n) => n.key === tab)?.label ?? tab)}</span>
        <textarea className="sint-textarea" rows={4} value={text} placeholder={tab === 'all' ? '{title}\n\n{excerpt}\n\n{url}' : rule.template || '{title}\n\n{excerpt}\n\n{url}'} onChange={(e) => setText(e.target.value)} />
        <small>
          {tab === 'all'
            ? __('Tokens: {title} {excerpt} {text} {url} {tags} {author} {site} and {field:meta_key} for any custom field. Leave empty to use the default.')
            : __('Leave empty to use the caption for all channels.')}
        </small>
      </label>
      <label className="sint-field" style={{ maxWidth: 360 }}>
        <span>{__('Media')}</span>
        <select className="sint-select" value={rule.media} onChange={(e) => onChange({ media: e.target.value as MediaSource })}>
          {sources.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <small>{sources.find((m) => m.value === rule.media)?.hint}</small>
      </label>
      {rule.media === 'custom' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {rule.custom_media.map((m, i) => (
            <button key={m.id} type="button" className="sint-media" aria-pressed="true" aria-label={sprintf(__('Remove image %d'), i + 1)} title={__('Remove')} onClick={() => onChange({ custom_media: rule.custom_media.filter((x) => x.id !== m.id) })}>
              {m.type === 'image' ? <img src={m.url} alt="" /> : <Icon name="image" size={24} />}
              <span>{`${i + 1} · `}{__('Remove')}</span>
            </button>
          ))}
          <button type="button" className="sint-media add" onClick={addMedia}>
            <Icon name="plus" size={22} stroke={2} />
            <span>{__('Add')}</span>
          </button>
        </div>
      )}
    </div>
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
          <p className="sint-sub" style={{ fontSize: 13 }}>{__('“Write with AI” in Create post drafts a caption from your post. It uses your own API key; the post text goes only to the provider you choose.')}</p>
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
