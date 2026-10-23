import type { Account, Network, PostType } from './types'

export interface SintConfig {
  restUrl: string
  nonce: string
  pageUrl: string
  timezone: string
  gmtOffset: number
  weekStart: number
  redirectUri: string
  /** The sign-in error of the last connect, kept on the server. Empty when there is none. */
  oauthError: string
  user: { name: string }
  /** Whether an AI provider and its key are set. */
  ai: { ready: boolean }
  /** The answers of these GET routes when the page loaded, or null for a route that failed. */
  store?: {
    networks: { networks: Network[]; redirect_uri: string } | null
    accounts: Account[] | null
    'post-types': PostType[] | null
  }
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
  nonce: '',
  pageUrl: '/wp-admin/admin.php?page=social-integrations',
  oauthError: '',
  timezone: 'UTC',
  gmtOffset: 0,
  weekStart: 1,
  redirectUri: '',
  user: { name: '' },
  ai: { ready: false },
}
