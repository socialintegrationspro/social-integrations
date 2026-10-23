import { useState, type ComponentType } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Icon, ToastProvider } from './components/ui'
import type { PageProps } from './components/Header'
import { Composer, type ComposerSeed } from './pages/Composer'
import { CalendarPage } from './pages/Calendar'
import { DashboardPage } from './pages/Dashboard'
import { CampaignsPage } from './pages/Campaigns'
import { AccountsPage } from './pages/Accounts'
import { SettingsPage } from './pages/Settings'
import { LogPage } from './pages/Log'
import { applyFilters } from './lib/hooks'
import { __ } from './lib/i18n'
import { StoreProvider, useRoute } from './lib/store'
import { useTheme } from './lib/theme'
import { MotionProvider, easeOut, pillSpring } from './lib/motion'

export interface RouteDef {
  path: string
  label: string
  icon: string
  component: ComponentType<PageProps>
  /** Listed with the tools at the end of the top bar, such as Settings. */
  bottom?: boolean
  /** Reached by link only; not listed in the top bar. */
  hidden?: boolean
}

function Shell() {
  const { path, params, go } = useRoute()
  const [composer, setComposer] = useState<ComposerSeed | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [theme, toggleTheme] = useTheme()

  // Filter `sint.routes`: other plugins add or replace screens.
  const routes = applyFilters<RouteDef[]>('sint.routes', [
    { path: 'dashboard', label: __('Dashboard', 'social-integrations'), icon: 'dashboard', component: DashboardPage },
    { path: 'calendar', label: __('Calendar', 'social-integrations'), icon: 'calendar', component: CalendarPage },
    { path: 'campaigns', label: __('Campaigns', 'social-integrations'), icon: 'content', component: CampaignsPage },
    { path: 'accounts', label: __('Accounts', 'social-integrations'), icon: 'accounts', component: AccountsPage },
    { path: 'log', label: __('Share log', 'social-integrations'), icon: 'log', component: LogPage },
    { path: 'settings', label: __('Settings', 'social-integrations'), icon: 'settings', component: SettingsPage, bottom: true },
  ])
  const current = routes.find((r) => r.path === path) ?? routes[0]!
  const Page = current.component

  const openComposer = (seed?: ComposerSeed) => setComposer(seed ?? {})

  const listed = routes.filter((r) => !r.hidden)
  const link = (r: RouteDef) => (
    <a key={r.path} href={`#/${r.path}`} className={r.path === current.path ? 'on' : undefined} aria-current={r.path === current.path ? 'page' : undefined}>
      {/* One pill for the whole bar: it slides to the active screen. */}
      {r.path === current.path && <m.span className="sint-pill-bg" layoutId="sint-nav-pill" transition={pillSpring} aria-hidden="true" />}
      <Icon name={r.icon} size={18} />
      <span>{r.label}</span>
    </a>
  )

  return (
    <div className="sint-shell">
      <header className="sint-top">
        <span className="sint-brand" title={__('Social Integrations', 'social-integrations')}>
          <span className="mark" aria-hidden="true">
            <Icon name="share" size={18} stroke={2.2} />
          </span>
          <span className="label">{__('Social Integrations', 'social-integrations')}</span>
        </span>
        <nav className="sint-nav" aria-label={__('Social Integrations', 'social-integrations')}>
          {listed.filter((r) => !r.bottom).map(link)}
        </nav>
        <div className="sint-tools">
          {listed.filter((r) => r.bottom).map(link)}
          <button type="button" className="sint-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? __('Switch to day mode', 'social-integrations') : __('Switch to night mode', 'social-integrations')} title={theme === 'dark' ? __('Day mode', 'social-integrations') : __('Night mode', 'social-integrations')}>
            <AnimatePresence mode="wait" initial={false}>
              <m.span key={theme} style={{ display: 'inline-flex' }} initial={{ opacity: 0, rotate: -60, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 60, scale: 0.6 }} transition={{ duration: 0.2 }}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
              </m.span>
            </AnimatePresence>
          </button>
        </div>
      </header>
      {/* A new screen rises into place. The panel remounts, so each screen starts at the top. */}
      <m.main key={current.path} className="sint-main" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: easeOut }}>
        <Page key={`${current.path}-${refresh}`} openComposer={openComposer} params={params} go={go} />
      </m.main>
      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  )
}

export function App() {
  return (
    <MotionProvider>
      <StoreProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </StoreProvider>
    </MotionProvider>
  )
}
