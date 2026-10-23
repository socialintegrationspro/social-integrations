import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData } from '../../frontend/admin/lib/types'
import { DashboardPage } from '../../frontend/admin/pages/Dashboard'
import { account, storeRoutes } from './fixtures'
import { ALL_CAPS, renderPage, setCaps } from './render'
import { fail, fakeServer, type Call } from './server'

/** `n` site days that end on 24 October 2026. */
const days = (n: number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 25 - n + i)).toISOString().slice(0, 10), published: i, failed: i % 2 }))

const data = (over: Partial<DashboardData> = {}): DashboardData => ({
  days: days(7),
  totals: { published: 21, failed: 3, previous_published: 15, previous_failed: 1, scheduled: 2, drafts: 1 },
  networks: [{ network: 'bluesky', published: 21, failed: 3 }],
  campaigns: { active: 2, total: 3 },
  upcoming: [{ id: 1, network: 'bluesky', account_id: 'bluesky', title: 'Next post', scheduled_at: '2026-10-26T03:00:00Z' }],
  recent: [{ id: 9, network: 'bluesky', account_id: 'bluesky', status: 'failed', message: 'Too long', remote_url: '', title: 'Old post', created_at: '2026-10-24T03:00:00Z' }],
  ...over,
})

describe('Dashboard screen', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => vi.unstubAllGlobals())

  it('welcomes the user and shows the totals of the period', async () => {
    fakeServer({ ...storeRoutes(), 'GET dashboard': data() })
    renderPage(DashboardPage)

    expect(screen.getByRole('heading', { name: 'Welcome, Admin' })).toBeInTheDocument()
    expect(await screen.findByText('6 more than the period before', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('sent in 7 days', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Next post')).toBeInTheDocument()
    const recent = screen.getByText('Old post').closest('li')!
    expect(within(recent).getByText('Failed')).toBeInTheDocument()
  })

  it('loads the 30-day period', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET dashboard': (c: Call) => data({ days: days(Number(c.query.get('days'))) }) })
    renderPage(DashboardPage)
    await screen.findByText('sent in 7 days', { exact: false })

    await userEvent.click(within(screen.getByRole('group', { name: 'Period' })).getByRole('button', { name: '30 days' }))

    expect(await screen.findByText('sent in 30 days', { exact: false })).toBeInTheDocument()
    expect(server.to('GET dashboard').at(-1)!.query.get('days')).toBe('30')
  })

  it('says when no share is scheduled, and opens the composer', async () => {
    fakeServer({ ...storeRoutes(), 'GET dashboard': data({ upcoming: [], recent: [], networks: [], totals: { published: 0, failed: 0, previous_published: 0, previous_failed: 0, scheduled: 0, drafts: 0 } }) })
    const { openComposer } = renderPage(DashboardPage)

    expect(await screen.findByText('No shares are scheduled.')).toBeInTheDocument()
    expect(screen.getByText('Same as the period before', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('No shares in this period.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Schedule a post' }))
    expect(openComposer).toHaveBeenCalled()
  })

  it('asks to reconnect an expired account', async () => {
    fakeServer({ ...storeRoutes([account({ status: 'expired' })]), 'GET dashboard': data() })
    const { go } = renderPage(DashboardPage)

    expect(await screen.findByText('Bluesky sign-in expired for Shop News. Reconnect the account.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(go).toHaveBeenCalledWith('accounts?reconnect=bluesky')
  })

  it('shows a load error with Try again', async () => {
    let first = true
    fakeServer({ ...storeRoutes(), 'GET dashboard': () => (first ? ((first = false), fail('Down')) : data()) })
    renderPage(DashboardPage)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The dashboard did not load.')
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
