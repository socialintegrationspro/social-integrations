import { __, _n, sprintf, type BlockUse } from './wp'

/** A network key as a name: 'linkedin' → 'LinkedIn'. Other keys get a capital letter. */
export function networkName(key: string): string {
  const names: Record<string, string> = { linkedin: 'LinkedIn', facebook: 'Facebook', bluesky: 'Bluesky', threads: 'Threads', telegram: 'Telegram' }
  return names[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

export function ruleLabel(use: string): string {
  const labels: Record<BlockUse, string> = {
    text: __('Caption text', 'social-integrations'),
    excerpt: __('Excerpt text', 'social-integrations'),
    media: __('Media', 'social-integrations'),
    link: __('Link', 'social-integrations'),
    skip: __('Do not use', 'social-integrations'),
    remove: __('Never send', 'social-integrations'),
  }
  return labels[use as BlockUse] ?? use
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: __('Draft', 'social-integrations'),
    scheduled: __('Scheduled', 'social-integrations'),
    sending: __('In progress', 'social-integrations'),
    published: __('Published', 'social-integrations'),
    failed: __('Failed', 'social-integrations'),
  }
  return labels[status] ?? status
}

/** A delay in seconds as text: "15 seconds", "10 minutes", "2 hours", "1 day". */
export function delayText(seconds: number): string {
  if (seconds < 60) {
    return __('15 seconds', 'social-integrations')
  }
  if (seconds % 86400 === 0) {
    const days = seconds / 86400
    return sprintf(_n('%d day', '%d days', days, 'social-integrations'), days)
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600
    return sprintf(_n('%d hour', '%d hours', hours, 'social-integrations'), hours)
  }
  const minutes = Math.round(seconds / 60)
  return sprintf(_n('%d minute', '%d minutes', minutes, 'social-integrations'), minutes)
}
