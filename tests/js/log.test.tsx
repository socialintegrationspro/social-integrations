import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry, LogPage, LogShare } from '../../frontend/admin/lib/types'
import { LogPage as LogScreen } from '../../frontend/admin/pages/Log'
import { account, storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, renderPage, setCaps } from './render'
import { fail, fakeServer, type Call } from './server'

const share = (over: Partial<LogShare> = {}): LogShare => ({
  id: 1,
  queue_id: 11,
  network: 'bluesky',
  account_id: 'bluesky',
  status: 'published',
  message: '',
  remote_url: 'https://bsky.app/post/1',
  created_at: '2026-10-20T06:00:00Z',
  tries: 1,
  ...over,
})

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  key: 'e1',
  campaign_key: 'auto-3',
  post_id: 10,
  post_title: 'Summer sale',
  edit_url: '/wp-admin/post.php?post=10&action=edit',
  excerpt: '',
  at: '2026-10-20T06:00:00Z',
  shares: [share()],
  ...over,
})

const page = (items: LogEntry[], over: Partial<LogPage> = {}): LogPage => ({
  total: items.length,
  failed: items.filter((e) => e.shares.some((s) => s.status === 'failed')).length,
  items,
  campaigns: [{ key: 'auto-3', name: 'New posts', type: 'auto' }],
  ...over,
})

const threadsAccount = account({ id: 'threads', network: 'threads', name: 'Shop Threads', username: 'shop' })

describe('Share log screen', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows a skeleton, then the entries with the first one open', async () => {
    fakeServer({ ...storeRoutes(), 'GET logs': page([entry(), entry({ key: 'e2', post_title: 'Winter sale' })]) })
    renderPage(LogScreen)

    expect(screen.getAllByText('Loading').length).toBeGreaterThan(0)
    expect(await screen.findByText('Summer sale')).toBeInTheDocument()
    expect(screen.getByText('Winter sale')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New posts' })).toHaveLength(2)
    expect(screen.getAllByText('Auto-post').length).toBeGreaterThan(0)
    // The first entry opens and shows its account.
    expect(await screen.findByText('Shop News')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Hide accounts' })).toHaveLength(1)
  })

  it('shows an empty state when there is no share', async () => {
    fakeServer({ ...storeRoutes(), 'GET logs': page([], { campaigns: [] }) })
    renderPage(LogScreen)

    expect(await screen.findByText('No shares yet')).toBeInTheDocument()
  })

  it('shows a load error with Try again', async () => {
    let calls = 0
    fakeServer({ ...storeRoutes(), 'GET logs': () => (++calls === 1 ? fail('Database error.') : page([entry()])) })
    renderPage(LogScreen)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The share log did not load. Database error.')
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Summer sale')).toBeInTheDocument()
  })

  it('filters failed shares, and shows a good result when there is none', async () => {
    const server = fakeServer({
      ...storeRoutes(),
      'GET logs': (c: Call) => (c.query.get('status') === 'failed' ? page([], { failed: 0 }) : page([entry()])),
    })
    renderPage(LogScreen)
    await screen.findByText('Summer sale')

    await userEvent.click(within(screen.getByRole('group', { name: 'Result' })).getByRole('button', { name: /Failed/ }))

    expect(await screen.findByText('No failed shares')).toBeInTheDocument()
    expect(server.to('GET logs').at(-1)!.query.get('status')).toBe('failed')
    await userEvent.click(screen.getByRole('button', { name: 'Show all shares' }))
    expect(await screen.findByText('Summer sale')).toBeInTheDocument()
  })

  it('searches after the user stops typing', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET logs': (c: Call) => (c.query.get('search') ? page([]) : page([entry()])) })
    renderPage(LogScreen)
    await screen.findByText('Summer sale')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: '  winter ' } })

    expect(await screen.findByText('No shares match the filters')).toBeInTheDocument()
    expect(server.to('GET logs').at(-1)!.query.get('search')).toBe('winter')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
  })

  it('sends the dates of a preset range in site time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 20:00 UTC on 24 October is 25 October at UTC+6.
    vi.setSystemTime(new Date('2026-10-24T20:00:00Z'))
    const server = fakeServer({ ...storeRoutes(), 'GET logs': page([entry()]) })
    renderPage(LogScreen)
    await screen.findByText('Summer sale')

    fireEvent.change(screen.getByRole('combobox', { name: 'Date' }), { target: { value: '7' } })

    await waitFor(() => expect(server.to('GET logs').at(-1)!.query.get('from')).toBe('2026-10-19'))
    expect(server.to('GET logs').at(-1)!.query.get('to')).toBe('2026-10-25')
  })

  it('filters by campaign through the URL', async () => {
    fakeServer({ ...storeRoutes(), 'GET logs': page([entry()]) })
    const { go } = renderPage(LogScreen)
    await screen.findByText('Summer sale')

    await userEvent.click(screen.getByRole('button', { name: 'New posts' }))

    expect(go).toHaveBeenCalledWith('log?campaign=auto-3')
  })

  it('retries a failed share and shows the result', async () => {
    const server = fakeServer({
      ...storeRoutes(),
      'GET logs': page([entry({ shares: [share({ status: 'failed', message: 'Bluesky did not accept the post.', remote_url: '' })] })]),
      'POST queue/:id/retry': { status: 'published', message: '' },
    })
    renderPage(LogScreen)

    expect(await screen.findByText('Bluesky did not accept the post.')).toBeInTheDocument()
    expect(screen.getByText('1 failed')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]!)

    await findToast('Shared.')
    expect(server.to('POST queue/:id/retry')[0]!.path).toBe('queue/11/retry')
  })

  it('retries every failed share of an entry and counts the sent ones', async () => {
    const server = fakeServer({
      ...storeRoutes([account(), threadsAccount]),
      'GET logs': page([
        entry({
          shares: [share({ id: 1, queue_id: 11, status: 'failed' }), share({ id: 2, queue_id: 12, network: 'threads', account_id: 'threads', status: 'failed' })],
        }),
      ]),
      'POST queue/11/retry': { status: 'published', message: '' },
      'POST queue/12/retry': fail('Threads is down.'),
    })
    renderPage(LogScreen)

    await userEvent.click(await screen.findByRole('button', { name: 'Retry 2 failed' }))

    await findToast('1 of 2 shares sent.')
    expect(server.to('POST queue/:id/retry').map((c) => c.path)).toEqual(['queue/11/retry', 'queue/12/retry'])
  })

  it('has no Retry for a user who cannot publish', async () => {
    setCaps('sint_view', 'sint_share')
    fakeServer({ ...storeRoutes(), 'GET logs': page([entry({ shares: [share({ status: 'failed' })] })]) })
    renderPage(LogScreen)

    await screen.findByText('Summer sale')
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete the entry' })).toBeNull()
  })

  it('sends the user to Accounts to reconnect an expired sign-in', async () => {
    fakeServer({ ...storeRoutes(), 'GET logs': page([entry({ shares: [share({ status: 'failed', reconnect: true })] })]) })
    const { go } = renderPage(LogScreen)

    await userEvent.click(await screen.findByRole('button', { name: 'Reconnect' }))

    expect(go).toHaveBeenCalledWith('accounts?reconnect=bluesky')
  })

  it('deletes an entry on the second click', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET logs': page([entry()]), 'POST logs/delete': { deleted: 1 } })
    renderPage(LogScreen)
    await screen.findByText('Summer sale')

    await userEvent.click(screen.getByRole('button', { name: 'Delete the entry' }))
    expect(server.to('POST logs/delete')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Click again to delete' }))

    await findToast('Entry deleted.')
    expect(server.to('POST logs/delete')[0]!.body).toEqual({ keys: ['e1'] })
  })

  it('selects all entries and deletes them together', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET logs': page([entry(), entry({ key: 'e2' })]), 'POST logs/delete': { deleted: 2 } })
    renderPage(LogScreen)
    await screen.findAllByText('Summer sale')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all entries on this page' }))
    const bar = screen.getByRole('group', { name: 'Selected entries' })
    expect(within(bar).getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(bar).getByRole('button', { name: 'Click again to delete' }))

    await findToast('2 entries deleted.')
    expect(server.to('POST logs/delete')[0]!.body).toEqual({ keys: ['e1', 'e2'] })
  })

  it('shows each try and request in the details panel', async () => {
    fakeServer({
      ...storeRoutes(),
      'GET logs': page([entry({ shares: [share({ status: 'failed', message: 'Too long.', tries: 2 })] })]),
      'GET logs/1/tries': [
        { id: 5, status: 'failed', message: 'Timed out.', remote_url: '', created_at: '2026-10-20T05:00:00Z', details: { code: 'http', requests: [{ method: 'POST', url: 'https://bsky.social/xrpc/x', status: 0, ms: 30000, error: 'cURL error 28' }] } },
        { id: 6, status: 'failed', message: 'Too long.', remote_url: '', created_at: '2026-10-20T06:00:00Z', details: null },
      ],
    })
    renderPage(LogScreen)

    expect(await screen.findByText(/2 tries/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    const panel = screen.getByRole('dialog', { name: 'Share details' })

    expect(await within(panel).findByText('2 tries')).toBeInTheDocument()
    expect(within(panel).getByText('Try 1')).toBeInTheDocument()
    expect(within(panel).getByText('No answer')).toBeInTheDocument()
    expect(within(panel).getByText('cURL error 28')).toBeInTheDocument()
    expect(within(panel).getByText(/This try has no details/)).toBeInTheDocument()
    await userEvent.click(within(panel).getAllByRole('button', { name: 'Close' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('toggles the accounts of an entry from the row', async () => {
    fakeServer({ ...storeRoutes(), 'GET logs': page([entry()]) })
    renderPage(LogScreen)

    const hide = await screen.findByRole('button', { name: 'Hide accounts' })
    await act(async () => hide.click())

    expect(screen.getByRole('button', { name: 'Show accounts' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Shop News')).toBeNull()
  })
})
