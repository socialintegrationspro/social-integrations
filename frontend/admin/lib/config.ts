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
  /** The current user, and the plugin's capabilities that the user has, such as `sint_share`. */
  user: { name: string; caps: Record<string, boolean> }
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
      i18n?: { __: (text: string, domain?: string) => string; _n?: (single: string, plural: string, count: number, domain?: string) => string }
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
  user: { name: '', caps: {} },
}

/** The plugin's capabilities. The server checks them again on each request. */
export const caps = {
  view: 'sint_view',
  share: 'sint_share',
  publish: 'sint_publish',
  manageAccounts: 'sint_manage_accounts',
  manageSettings: 'sint_manage_settings',
} as const

/** Whether the current user has a capability of the plugin. */
export const can = (cap: string): boolean => !!config.user.caps?.[cap]
