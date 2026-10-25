import { __, _n, config, sprintf, type BlockUse } from './wp'

/** A network's label, such as 'Facebook Page'. An unknown key gets a capital letter. */
export function networkName(key: string): string {
  return config.networkNames[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

export function ruleLabel(use: string): string {
  const labels: Record<BlockUse, string> = {
    excerpt: __('Text: {excerpt}', 'social-integrations'),
    text: __('Text: {text}', 'social-integrations'),
    media: __('Media', 'social-integrations'),
    link: __('Link', 'social-integrations'),
    skip: __('Leave out', 'social-integrations'),
  }
  // 'remove' is an old name of 'skip'.
  return labels[(use === 'remove' ? 'skip' : use) as BlockUse] ?? use
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
