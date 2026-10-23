export interface SintConfig {
  restUrl: string
  wpRestUrl: string
  nonce: string
  adminUrl: string
  pageUrl: string
  version: string
  siteName: string
  timezone: string
  gmtOffset: number
  weekStart: number
  redirectUri: string
  /** The sign-in error of the last connect, kept on the server. Empty when there is none. */
  oauthError: string
  user: { name: string; avatar: string }
  /** Whether an AI provider and its key are set. */
  ai: { ready: boolean }
}

/** The parts of a wp.media frame the composer uses. */
export interface MediaFrame {
  on: (event: string, callback: () => void) => void
  open: () => void
  state: () => { get: (key: string) => { toJSON: () => { id: number; url: string; alt?: string; type: string }[] } }
}

declare global {
  interface Window {
    sintConfig?: SintConfig
    wp?: {
      hooks?: {
        applyFilters: (name: string, value: unknown, ...args: unknown[]) => unknown
        doAction: (name: string, ...args: unknown[]) => void
      }
      i18n?: { __: (text: string, domain?: string) => string }
      media?: (options: Record<string, unknown>) => MediaFrame
    }
  }
}

export const config: SintConfig = window.sintConfig ?? {
  restUrl: '/wp-json/sint/v1/',
  wpRestUrl: '/wp-json/wp/v2/',
  nonce: '',
  adminUrl: '/wp-admin/',
  pageUrl: '/wp-admin/admin.php?page=social-integrations',
  oauthError: '',
  version: 'dev',
  siteName: 'WordPress',
  timezone: 'UTC',
  gmtOffset: 0,
  weekStart: 1,
  redirectUri: '',
  user: { name: '', avatar: '' },
  ai: { ready: false },
}
