import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { Header, type PageProps } from '../components/Header'
import { HelpTip, LoadError, Toggle, useToast } from '../components/ui'
import { api } from '../lib/api'
import { applyFilters, useFetch } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import type { BlockType, BlockUse, Settings } from '../lib/types'

export function SettingsPage(props: PageProps) {
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  // The settings as the server last sent them, to tell when there are unsaved changes.
  const [saved, setSaved] = useState('')
  const blocks = useFetch<{ blocks: BlockType[] }>('blocks').data?.blocks ?? []
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)

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

  const dirty = !!settings && JSON.stringify(settings) !== saved
  // The browser asks before it leaves or reloads the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Filter `sint.settings.sections`: other plugins add sections to the Settings menu. Each section saves its own data.
  const extra = applyFilters<ExtraSettingsSection[]>('sint.settings.sections', [])
  const fromUrl = props.params.get('section')
  const [active, setActive] = useState(() => fromUrl ?? 'blocks')
  // A link to another section, such as #/settings?section=log, opens it while the screen is open.
  useEffect(() => {
    if (fromUrl) setActive(fromUrl)
  }, [fromUrl])

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
      const r = await api.post<Settings>('settings', settings)
      setSettings(r.data)
      setSaved(JSON.stringify(r.data))
      toast(__('Settings saved.', 'social-integrations'))
    } catch (e) {
      toast((e as Error).message, true)
    }
    setSaving(false)
  }

  // The label names the caption token that gets the text, so the user sees where it goes.
  const uses: { value: BlockUse; label: string; help: string }[] = [
    { value: 'excerpt', label: __('Text: {excerpt}', 'social-integrations'), help: __('The text goes into {excerpt} when the post has no excerpt.', 'social-integrations') },
    { value: 'text', label: __('Text: {text}', 'social-integrations'), help: __('The text goes into {text}.', 'social-integrations') },
    { value: 'media', label: __('Media', 'social-integrations'), help: __('The image or video goes with the share.', 'social-integrations') },
    { value: 'link', label: __('Link', 'social-integrations'), help: __('The URL of the block becomes the link of the share.', 'social-integrations') },
    { value: 'skip', label: __('Leave out', 'social-integrations'), help: __('The plugin does not use the block.', 'social-integrations') },
  ]
  const fallbackLabel = uses.find((u) => u.value === settings.block_fallback)?.label ?? ''
  // A row stays while the user changes it to Default; it goes away after the save.
  const savedBlocks = (saved ? (JSON.parse(saved) as Settings).blocks : settings.blocks) ?? {}
  const shownBlocks = showAll ? blocks : blocks.filter((b) => settings.blocks[b.name] || savedBlocks[b.name] || !b.core)

  // Each section shows a dot in the menu while it has unsaved changes.
  const base = (saved ? JSON.parse(saved) : settings) as Settings
  const differs = (...keys: (keyof Settings)[]) => keys.some((k) => JSON.stringify(settings[k]) !== JSON.stringify(base[k]))

  const own: SettingsSection[] = [
    {
      key: 'blocks',
      label: __('Block rules', 'social-integrations'),
      description: __('Set how the plugin uses each block of a post in a share: as text, media or a link. Editors can change the rule for one block in the block toolbar.', 'social-integrations'),
      changed: differs('blocks', 'block_fallback', 'allow_block_override'),
      aside: (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600 }}>
          <Toggle checked={settings.allow_block_override} onChange={(v) => setSettings({ ...settings, allow_block_override: v })} label={__('Let editors change the rule for one block', 'social-integrations')} />
          {__('Let editors change the rule for one block', 'social-integrations')}
        </label>
      ),
      body: (
        <div className="sint-card">
          <div className="sint-rules-bar">
            {__('What each choice does', 'social-integrations')}
            <HelpTip id="sint-block-uses" side="bottom">
              {uses.map((u) => (
                <span key={u.value} className="sint-tip-row">
                  <b>{u.label}</b> {u.help}
                </span>
              ))}
            </HelpTip>
          </div>
          {/* A grid of short rows: on a wide screen the rules use the width, not one long column. */}
          <ul className="sint-rules">
            {shownBlocks.map((b) => (
              <li key={b.name}>
                <span className="n">
                  <span className="t">{b.title}</span>
                  <span className="sint-code">{b.name}</span>
                </span>
                <select className="sint-select" value={settings.blocks[b.name] ?? ''} onChange={(e) => setBlock(b.name, e.target.value as BlockUse | '')} aria-label={sprintf(__('Use of %s', 'social-integrations'), b.title)}>
                  <option value="">{sprintf(__('Default (%s)', 'social-integrations'), fallbackLabel)}</option>
                  {uses.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="sint-rules-foot">
            <label className="sint-rules-other">
              <span>{__('Any other block', 'social-integrations')}</span>
              <select className="sint-select" value={settings.block_fallback} onChange={(e) => setSettings({ ...settings, block_fallback: e.target.value as BlockUse })}>
                {uses.filter((u) => ['text', 'excerpt', 'skip'].includes(u.value)).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>
            <button type="button" className="sint-btn ghost sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? __('Show only blocks with a rule', 'social-integrations') : sprintf(__('Show all %d blocks', 'social-integrations'), blocks.length)}
            </button>
          </div>
        </div>
      ),
    },
    {
      key: 'log',
      label: __('Share log', 'social-integrations'),
      description: __('Select how long the share log keeps its entries. The plugin deletes older entries one time each day. Campaigns and the calendar do not change.', 'social-integrations'),
      changed: differs('log_days'),
      body: (
        <div className="sint-card sint-settings-card">
          <label className="sint-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <span>{__('Keep the share log', 'social-integrations')}</span>
            <select className="sint-select" value={settings.log_days} onChange={(e) => setSettings({ ...settings, log_days: Number(e.target.value) })}>
              {LOG_DAYS.map((d) => <option key={d} value={d}>{d ? sprintf(__('%d days', 'social-integrations'), d) : __('Always', 'social-integrations')}</option>)}
            </select>
          </label>
        </div>
      ),
    },
  ]
  // A section of another plugin saves its own data, so the Save button of the page is not for it.
  const added: SettingsSection[] = extra.map(({ key, label, description, component: Section }) => ({ key, label, description, added: true, body: <Section /> }))
  const all = [...own, ...added]
  const current = all.find((x) => x.key === active) ?? all[0]!
  const choose = (key: string) => {
    setActive(key)
    // The URL opens the same section again, without a new screen.
    window.history.replaceState(null, '', `#/settings?section=${encodeURIComponent(key)}`)
  }

  return (
    <>
      <Header title={__('Settings', 'social-integrations')}>
        {dirty && !saving && <span className="sint-sub" role="status" style={{ fontSize: 13 }}>{__('Unsaved changes', 'social-integrations')}</span>}
        {(!current.added || dirty) && <button type="button" className="sint-btn primary" onClick={save} disabled={saving}>{saving ? __('Saving…', 'social-integrations') : __('Save changes', 'social-integrations')}</button>}
      </Header>
      <div className="sint-body">
        <div className="sint-settings">
          <nav className="sint-settings-nav" aria-label={__('Settings sections', 'social-integrations')}>
            {all.map((x) => (
              <a key={x.key} href={`#/settings?section=${encodeURIComponent(x.key)}`} aria-current={x.key === current.key ? 'page' : undefined} onClick={(e) => { e.preventDefault(); choose(x.key) }}>
                {x.label}
                {x.changed && (
                  <>
                    <span className="dot" aria-hidden="true" />
                    <span className="sint-sr">{__('Unsaved changes', 'social-integrations')}</span>
                  </>
                )}
              </a>
            ))}
          </nav>
          <section className="sint-settings-panel" aria-labelledby="sint-settings-title">
            <div className="sint-settings-head">
              <div>
                <h2 id="sint-settings-title">{current.label}</h2>
                {current.description && <p className="sint-sub">{current.description}</p>}
              </div>
              {current.aside}
            </div>
            {current.body}
          </section>
        </div>
      </div>
    </>
  )
}

/** One entry in the Settings menu, and the panel that it opens. */
interface SettingsSection {
  key: string
  label: string
  description?: string
  /** True while the section has changes that are not saved. */
  changed?: boolean
  /** A section of another plugin: it saves its own data. */
  added?: boolean
  /** Controls at the right of the section title. */
  aside?: ReactNode
  body: ReactNode
}

/** What a `sint.settings.sections` filter returns: one section in the Settings menu. */
export interface ExtraSettingsSection {
  key: string
  label: string
  description?: string
  component: ComponentType
}

const LOG_DAYS = [0, 30, 90, 180, 365]

