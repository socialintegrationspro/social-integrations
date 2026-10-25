import { config } from '../../lib/config'
import { plainText, toUnicode } from '../../lib/richtext'
import { __ } from '../../lib/i18n'
import type { MediaSource, Network } from '../../lib/types'

export type When = 'now' | 'pick'

export const MEDIA_FROM: { value: MediaSource | ''; label: () => string }[] = [
  { value: '', label: () => __('Post type setting', 'social-integrations') },
  { value: 'auto', label: () => __('Featured image and post images', 'social-integrations') },
  { value: 'featured', label: () => __('Featured image', 'social-integrations') },
  { value: 'content', label: () => __('Images in the post', 'social-integrations') },
  { value: 'none', label: () => __('No media', 'social-integrations') },
]

export const TOKENS = ['{title}', '{excerpt}', '{url}', '{tags}', '{author}']

/** 'YYYY-MM-DDTHH:mm' in the site's time zone, one hour from now. */
export function defaultLocal(): string {
  const d = new Date(Date.now() + 3600000 + config.gmtOffset * 3600000)
  return d.toISOString().slice(0, 14) + '00'
}

/** datetime-local value in the site's time zone, `days` from today at `hour`:00. */
function atLocal(days: number, hour: number): string {
  const d = new Date(Date.now() + config.gmtOffset * 3600000)
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

/** Days from today to the start of next week. */
function toNextWeek(): number {
  const day = new Date(Date.now() + config.gmtOffset * 3600000).getUTCDay()
  return (config.weekStart - day + 7) % 7 || 7
}

/** Preset times for the share. `live` is the local time when the post is published, if it is scheduled. */
export function timePresets(live: string): { label: string; value: string }[] {
  return [
    { label: __('In an hour', 'social-integrations'), value: defaultLocal() },
    { label: __('Tomorrow 9:00', 'social-integrations'), value: atLocal(1, 9) },
    { label: __('Next week', 'social-integrations'), value: atLocal(toNextWeek(), 9) },
    ...(live ? [{ label: __('When the post is published', 'social-integrations'), value: live }] : []),
  ]
}

/**
 * Caption length as a network counts it: the text that the network gets, without style marks.
 * Underline and strikethrough add a line character to each letter on a network that shows plain
 * text. Some networks count every link as a fixed length.
 */
export function measure(text: string, net?: Network): number {
  const sent = net?.text_format === 'unicode' || !net?.text_format ? toUnicode(text) : plainText(text)
  const counted = net?.url_length ? sent.replace(/https?:\/\/\S+/g, 'x'.repeat(net.url_length)) : sent
  return [...counted].length
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
