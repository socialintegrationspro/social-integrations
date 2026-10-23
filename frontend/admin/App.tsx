import { useState, type ComponentType } from 'react'
import { Icon, ToastProvider } from './components/ui'
import type { PageProps } from './components/Header'
import { Composer, type ComposerSeed } from './pages/Composer'
import { CalendarPage } from './pages/Calendar'
import { CampaignsPage } from './pages/Campaigns'
import { AccountsPage } from './pages/Accounts'
import { SettingsPage } from './pages/Settings'
import { LogPage } from './pages/Log'
import { applyFilters } from './lib/hooks'
import { __ } from './lib/i18n'
import { StoreProvider, useRoute } from './lib/store'
import { useTheme } from './lib/theme'

export interface RouteDef {
  path: string
  label: string
  icon: string
  component: ComponentType<PageProps>
  bottom?: boolean
  /** Reached by link only; not listed in the rail. */
  hidden?: boolean
}

function Shell() {
  const { path, params, go } = useRoute()
  const [composer, setComposer] = useState<ComposerSeed | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [theme, toggleTheme] = useTheme()

  // Filter `sint.routes`: other plugins add or replace screens.
  const routes = applyFilters<RouteDef[]>('sint.routes', [
    { path: 'calendar', label: __('Calendar', 'social-integrations'), icon: 'calendar', component: CalendarPage },
    { path: 'campaigns', label: __('Campaigns', 'social-integrations'), icon: 'content', component: CampaignsPage },
    { path: 'accounts', label: __('Accounts', 'social-integrations'), icon: 'accounts', component: AccountsPage },
    { path: 'log', label: __('Share log', 'social-integrations'), icon: 'log', component: LogPage },
    { path: 'settings', label: __('Settings', 'social-integrations'), icon: 'settings', component: SettingsPage, bottom: true },
  ])
  const current = routes.find((r) => r.path === path) ?? routes[0]!
  const Page = current.component

  const openComposer = (seed?: ComposerSeed) => setComposer(seed ?? {})

  return (
    <div className="sint-shell">
      <nav className="sint-rail" aria-label={__('Social Integrations', 'social-integrations')}>
        <div className="logo" aria-hidden="true" style={{ color: '#fff' }}>
          <Icon name="share" size={22} stroke={2.2} />
        </div>
        {routes.filter((r) => !r.hidden).map((r) => (
          <a key={r.path} href={`#/${r.path}`} className={`${r.path === current.path ? 'on' : ''} ${r.bottom ? 'bottom' : ''}`} aria-current={r.path === current.path ? 'page' : undefined}>
            <Icon name={r.icon} size={20} />
            {r.label}
          </a>
        ))}
        <button type="button" className="sint-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? __('Switch to day mode', 'social-integrations') : __('Switch to night mode', 'social-integrations')} title={theme === 'dark' ? __('Day mode', 'social-integrations') : __('Night mode', 'social-integrations')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
        </button>
      </nav>
      <main className="sint-main">
        <Page key={`${current.path}-${refresh}`} openComposer={openComposer} params={params} go={go} />
      </main>
      {composer && (
        <Composer
          seed={composer}
          onClose={() => setComposer(null)}
          onSaved={() => {
            setComposer(null)
            setRefresh((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  )
}
