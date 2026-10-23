import { Icon } from '../../components/ui'
import { __, sprintf } from '../../lib/i18n'
import type { MediaItem, MediaSource } from '../../lib/types'
import { MEDIA_FROM } from './helpers'

interface Props {
  media: MediaItem[]
  chosen: MediaItem[]
  toggle: (url: string) => void
  onAdd: () => void
  /** Shown when a post is selected: where its media comes from. */
  mediaFrom?: { value: MediaSource | ''; onChange: (value: MediaSource | '') => void }
}

/** The media row: tap an item to turn it on or off; the number shows its order. */
export function MediaPicker({ media, chosen, toggle, onAdd, mediaFrom }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="sint-label">{__('Media', 'social-integrations')}</span>
        <span style={{ fontSize: 12, color: 'var(--faint)' }}>{sprintf(__('%d selected. Click an image to add or remove it.', 'social-integrations'), chosen.length)}</span>
        {mediaFrom && (
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
            {__('From', 'social-integrations')}
            <select className="sint-select" style={{ height: 36, minWidth: 0 }} value={mediaFrom.value} onChange={(e) => mediaFrom.onChange(e.target.value as MediaSource | '')}>
              {MEDIA_FROM.map((m) => <option key={m.value} value={m.value}>{m.label()}</option>)}
            </select>
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {media.map((m, i) => {
          const order = chosen.indexOf(m) + 1
          const on = order > 0
          return (
            <button key={m.url} type="button" className="sint-media" aria-pressed={on} aria-label={m.alt || sprintf(__('Image %d', 'social-integrations'), i + 1)} onClick={() => toggle(m.url)}>
              {m.type === 'image' ? <img src={m.url} alt="" width={104} height={104} loading="lazy" decoding="async" /> : <Icon name="image" size={24} />}
              <span>{on ? `${order} · ` : ''}{mediaLabel(m)}</span>
            </button>
          )
        })}
        <button type="button" className="sint-media add" onClick={onAdd}>
          <Icon name="plus" size={22} stroke={2} />
          <span>{__('Add', 'social-integrations')}</span>
        </button>
      </div>
    </div>
  )
}

function mediaLabel(m: MediaItem): string {
  if (m.featured) return __('Featured', 'social-integrations')
  if (m.type === 'video') return __('Video', 'social-integrations')
  return __('Block', 'social-integrations')
}
