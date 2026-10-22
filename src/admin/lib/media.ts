import { __ } from './i18n'
import type { MediaItem } from './types'

/** Opens the WordPress media library. Returns false when it is not loaded. */
export function pickMedia(onPick: (items: MediaItem[]) => void): boolean {
  const media = window.wp?.media
  if (!media) return false
  const frame = media({
    title: __('Add media'),
    multiple: 'add',
    library: { type: ['image', 'video'] },
    button: { text: __('Add to post') },
  })
  frame.on('select', () => {
    const picked = frame.state().get('selection').toJSON()
    onPick(picked.map((a) => ({ type: a.type === 'video' ? 'video' : 'image', id: a.id, url: a.url, alt: a.alt ?? '' })))
  })
  frame.open()
  return true
}
