import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../frontend/admin/App'
import { storeRoutes } from './fixtures'
import { ALL_CAPS, setCaps } from './render'
import { fakeServer } from './server'

const routes = () => ({
  ...storeRoutes(),
  'GET dashboard': { days: [], totals: { published: 0, failed: 0, previous_published: 0, previous_failed: 0, scheduled: 0, drafts: 0 }, networks: [], campaigns: { active: 0, total: 0 }, upcoming: [], recent: [] },
  'GET campaigns': [],
  'GET queue': [],
  'GET content': [],
  'GET logs': { total: 0, failed: 0, items: [], campaigns: [] },
  'GET settings': { blocks: {}, block_fallback: 'text', allow_block_override: true, max_images: 4, log_days: 0, ai: { provider: '', tone: 'friendly', model: '' }, ai_providers: [] },
  'GET blocks': { blocks: [] },
})

const go = (hash: string) =>
  act(async () => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

describe('App', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => {
    delete window.wp
    vi.unstubAllGlobals()
  })

  it('opens the dashboard and lists the screens in the top bar', async () => {
    fakeServer(routes())
    render(<App />)

    const nav = screen.getByRole('navigation', { name: 'Social Integrations' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Dashboard', 'Calendar', 'Campaigns', 'Accounts', 'Share log'])
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings')
  })

  it('follows the hash to another screen', async () => {
    fakeServer(routes())
    render(<App />)

    await go('#/log')

    expect(await screen.findByRole('heading', { name: 'Share log' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Share log' })).toHaveAttribute('aria-current', 'page')
  })

  it('hides the screens that the user cannot use', async () => {
    setCaps('sint_view', 'sint_share')
    fakeServer(routes())
    render(<App />)

    expect(screen.queryByRole('link', { name: 'Accounts' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    await go('#/settings')
    // A screen without the capability opens the first screen.
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens the composer from a screen and closes it', async () => {
    fakeServer(routes())
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'New campaign' }))
    expect(await screen.findByRole('dialog', { name: 'New campaign' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('switches between day and night mode', async () => {
    fakeServer(routes())
    render(<App />)

    const button = screen.getByRole('button', { name: /Switch to (night|day) mode/ })
    const before = button.getAttribute('aria-label')
    await userEvent.click(button)

    expect(screen.getByRole('button', { name: /Switch to (night|day) mode/ })).not.toHaveAttribute('aria-label', before!)
  })

  it('adds the screens of other plugins through sint.routes', async () => {
    window.wp = {
      hooks: {
        applyFilters: (name: string, value: unknown) =>
          name === 'sint.routes' ? [...(value as object[]), { path: 'extra', label: 'Extra', icon: 'log', component: () => <h1>Extra screen</h1> }, { path: 'secret', label: 'Secret', icon: 'log', hidden: true, component: () => <h1>Secret screen</h1> }] : value,
        doAction: () => undefined,
      },
    }
    fakeServer(routes())
    render(<App />)

    expect(screen.getByRole('link', { name: 'Extra' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Secret' })).toBeNull()
    await go('#/secret')
    expect(await screen.findByRole('heading', { name: 'Secret screen' })).toBeInTheDocument()
  })
})
