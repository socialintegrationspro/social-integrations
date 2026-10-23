import { __, sprintf } from '../lib/i18n'
import { pickMedia } from '../lib/media'
import { useStore } from '../lib/store'
import type { MediaItem, MediaSource } from '../lib/types'
import { Icon, NetBadge, useToast } from './ui'

/** What a campaign shares for each post: captions with tokens, and where the media comes from. */
export interface ShareTemplate {
  caption: string
  captions: Record<string, string>
  media: MediaSource
  custom_media: MediaItem[]
}

const TOKENS = ['{title}', '{excerpt}', '{url}', '{tags}', '{author}', '{site}']

const SOURCES = (): { value: MediaSource; label: string }[] => [
  { value: 'auto', label: __('Featured image and post images', 'social-integrations') },
  { value: 'featured', label: __('Featured image', 'social-integrations') },
  { value: 'content', label: __('Images in the post', 'social-integrations') },
  { value: 'custom', label: __('Chosen images', 'social-integrations') },
  { value: 'none', label: __('No media', 'social-integrations') },
]

interface Props {
  value: ShareTemplate
  onChange: (patch: Partial<ShareTemplate>) => void
  /** Networks of the selected accounts; each gets a caption tab. */
  nets: string[]
  /** 'all' or a network key in `nets`. */
  tab: string
  setTab: (tab: string) => void
  /** Placeholder of the caption for all networks. */
  placeholder: string
  /** Help below the caption for all networks. */
  hint?: string
}

/** Caption tabs, the caption with token chips, and the media source with selected images. */
export function TemplateEditor({ value, onChange, nets, tab, setTab, placeholder, hint }: Props) {
  const { network } = useStore()
  const toast = useToast()
  const all = tab === 'all'

  const text = all ? value.caption : value.captions[tab] ?? ''
  // An empty network caption uses the caption for all networks instead.
  const setText = (v: string) => {
    if (all) return onChange({ caption: v })
    const captions = { ...value.captions }
    if (v.trim() === '') delete captions[tab]
    else captions[tab] = v
    onChange({ captions })
  }

  const addMedia = () => {
    const opened = pickMedia((items) => onChange({ custom_media: [...value.custom_media, ...items.filter((x) => !value.custom_media.some((y) => y.id === x.id))] }))
    if (!opened) toast(__('The media library did not load. Reload the page and try again.', 'social-integrations'), true)
  }

  return (
    <>
      {nets.length > 0 && (
        <div className="sint-seg" role="tablist" aria-label={__('Caption for', 'social-integrations')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
          <button type="button" role="tab" aria-selected={all} className={all ? 'on' : ''} onClick={() => setTab('all')}>{__('All networks', 'social-integrations')}</button>
          {nets.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={tab === n} className={tab === n ? 'on' : ''} onClick={() => setTab(n)}>
              <NetBadge network={n} color={network(n)?.color} size={18} />
              {network(n)?.label}
              {value.captions[n] !== undefined && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} aria-label={__('Edited', 'social-integrations')} />}
            </button>
          ))}
        </div>
      )}
      <label className="sint-field">
        <span>{all ? __('Caption', 'social-integrations') : sprintf(__('Caption for %s', 'social-integrations'), network(tab)?.label ?? tab)}</span>
        <textarea className="sint-textarea" rows={5} value={text} placeholder={all ? placeholder : value.caption || placeholder} onChange={(e) => setText(e.target.value)} />
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TOKENS.map((t) => <button key={t} type="button" className="sint-chip" onClick={() => setText((text || (all ? '' : value.caption)) + t)}>{t}</button>)}
        </span>
        {all ? hint && <small>{hint}</small> : <small>{__('Leave empty to use the caption for all networks.', 'social-integrations')}</small>}
      </label>
      <label className="sint-field" style={{ maxWidth: 320 }}>
        <span>{__('Media', 'social-integrations')}</span>
        <select className="sint-select" value={value.media} onChange={(e) => onChange({ media: e.target.value as MediaSource })}>
          {SOURCES().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      {value.media === 'custom' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {value.custom_media.map((m, i) => (
            <button key={m.id} type="button" className="sint-media" aria-pressed="true" aria-label={sprintf(__('Remove image %d', 'social-integrations'), i + 1)} onClick={() => onChange({ custom_media: value.custom_media.filter((x) => x.id !== m.id) })}>
              {m.type === 'image' ? <img src={m.url} alt="" /> : <Icon name="image" size={24} />}
              <span>{__('Remove', 'social-integrations')}</span>
            </button>
          ))}
          <button type="button" className="sint-media add" onClick={addMedia}>
            <Icon name="plus" size={22} stroke={2} />
            <span>{__('Add', 'social-integrations')}</span>
          </button>
        </div>
      )}
    </>
  )
}
