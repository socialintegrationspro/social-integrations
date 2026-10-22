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
  user: { name: string; avatar: string }
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
    }
  }
}

export const config: SintConfig = window.sintConfig ?? {
  restUrl: '/wp-json/sint/v1/',
  wpRestUrl: '/wp-json/wp/v2/',
  nonce: '',
  adminUrl: '/wp-admin/',
  pageUrl: '/wp-admin/admin.php?page=social-integrations',
  version: 'dev',
  siteName: 'WordPress',
  timezone: 'UTC',
  gmtOffset: 0,
  weekStart: 1,
  redirectUri: '',
  user: { name: '', avatar: '' },
}
