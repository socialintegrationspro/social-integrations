import { useEffect, useState } from 'react'
import { Header, type PageProps } from '../App'
import { NetBadge, Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { BlockType, BlockUse, PostTypeRule, Settings } from '../lib/types'

const DEFAULT_RULE: PostTypeRule = { auto: false, delay: 15, accounts: [], template: '' }

export function SettingsPage(_props: PageProps) {
  const { postTypes, accounts, network } = useStore()
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [blocks, setBlocks] = useState<BlockType[]>([])
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    api.get<Settings>('settings').then((r) => setSettings(r.data))
    api.get<{ blocks: BlockType[] }>('blocks').then((r) => setBlocks(r.data.blocks))
  }, [])

  if (!settings) return <><Header title={__('Settings')} /><div className="sint-body"><div className="sint-skeleton" style={{ height: 400 }} /></div></>

  const rule = (type: string): PostTypeRule => ({ ...DEFAULT_RULE, ...(settings.post_types[type] ?? {}) })
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
      const r = await api.post<Settings>('settings', settings)
      setSettings(r.data)
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
                          {r.template ? __('Custom') : __('Default')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {editing && (
            <div style={{ padding: 20, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="sint-field">
                <span>{sprintf(__('Caption template for %s'), postTypes.find((t) => t.name === editing)?.label ?? editing)}</span>
                <textarea className="sint-textarea" rows={4} value={rule(editing).template} placeholder={'{title}\n\n{excerpt}\n\n{url}'} onChange={(e) => setRule(editing, { template: e.target.value })} />
                <small>{__('Tokens: {title} {excerpt} {text} {url} {tags} {author} {site} and {field:meta_key} for any custom field. Leave empty to use the default.')}</small>
              </label>
            </div>
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
      </div>
    </>
  )
}
