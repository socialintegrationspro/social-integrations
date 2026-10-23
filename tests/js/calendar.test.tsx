import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarPage } from '../../frontend/admin/pages/Calendar'
import { account, queueItem, storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, renderPage, setCaps } from './render'
import { fail, fakeServer, type Call } from './server'

// The app keeps the last answer of each path, so each test uses its own week.
let week = 0
const WEEK_MS = 7 * 86400000
/** Wednesday 10:00 site time (04:00 UTC) of the test's own week. */
function useWeek(): Date {
  const now = new Date(Date.parse('2026-10-28T04:00:00Z') + ++week * 4 * WEEK_MS)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  return now
}
/** A time in the current week: `day` days after Monday, at `hour` site time. */
const at = (now: Date, day: number, hour: number) => new Date(now.getTime() + (day - 2) * 86400000 + (hour - 10) * 3600000).toISOString()

describe('Calendar screen', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks for the week with one more day on each side', async () => {
    const now = useWeek()
    const server = fakeServer({ ...storeRoutes(), 'GET queue': [] })
    renderPage(CalendarPage)

    await waitFor(() => expect(server.to('GET queue')).toHaveLength(1))
    const q = server.to('GET queue')[0]!.query
    // The calendar days are site days at 00:00 UTC. Monday 00:00 site time is 18:00 UTC, so add 6 hours.
    const monday = Date.parse(at(now, 0, 0)) + 6 * 3600000
    expect(Date.parse(q.get('from')!)).toBe(monday - 86400000)
    expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(9 * 86400000)
  })

  it('shows each share in its day and time slot, with Today marked', async () => {
    const now = useWeek()
    fakeServer({ ...storeRoutes(), 'GET queue': [queueItem({ id: 1, scheduled_at: at(now, 2, 13) })] })
    const { container } = renderPage(CalendarPage)

    const title = await screen.findByRole('button', { name: 'Hello post' })
    const cell = title.closest('.cell')!
    expect(cell).toHaveClass('today')
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.sint-week .cell')).toHaveLength(8 * 7)
  })

  it('opens a share that is not sent yet in the composer', async () => {
    const now = useWeek()
    const item = queueItem({ id: 4, scheduled_at: at(now, 3, 9) })
    fakeServer({ ...storeRoutes(), 'GET queue': [item] })
    const { openComposer } = renderPage(CalendarPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Hello post' }))

    expect(openComposer).toHaveBeenCalledWith({ item })
  })

  it('shows a published share as a record with a link to the network', async () => {
    const now = useWeek()
    fakeServer({ ...storeRoutes(), 'GET queue': [queueItem({ status: 'published', remote_url: 'https://bsky.app/p/1', scheduled_at: at(now, 1, 9) })] })
    renderPage(CalendarPage)

    expect(await screen.findByText('Published')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hello post' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the post on the network' })).toHaveAttribute('href', 'https://bsky.app/p/1')
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('switches to the list view and shows an empty week there', async () => {
    useWeek()
    fakeServer({ ...storeRoutes(), 'GET queue': [] })
    const { openComposer } = renderPage(CalendarPage)

    await userEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }))

    expect(await screen.findByText('No shares this week')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'New campaign' }).at(-1)!)
    expect(openComposer).toHaveBeenCalledWith()
  })

  it('lists the shares of the week with the error of a failed share', async () => {
    const now = useWeek()
    fakeServer({
      ...storeRoutes(),
      'GET queue': [queueItem({ id: 1, status: 'failed', message: 'Bluesky sign-in expired. Reconnect the account.', scheduled_at: at(now, 1, 9) })],
    })
    renderPage(CalendarPage)

    await userEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'List' }))

    expect(await screen.findByText('Bluesky sign-in expired. Reconnect the account.')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('moves to the next week and back to today', async () => {
    useWeek()
    const server = fakeServer({ ...storeRoutes(), 'GET queue': [] })
    renderPage(CalendarPage)
    await waitFor(() => expect(server.to('GET queue')).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(server.to('GET queue')).toHaveLength(2))
    const [first, second] = server.to('GET queue') as [Call, Call]
    expect(Date.parse(second.query.get('from')!) - Date.parse(first.query.get('from')!)).toBe(WEEK_MS)

    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(server.to('GET queue').at(-1)!.query.get('from')).toBe(first.query.get('from')))
  })

  it('hides the shares of a post type', async () => {
    const now = useWeek()
    fakeServer({
      ...storeRoutes(),
      'GET queue': [
        queueItem({ id: 1, scheduled_at: at(now, 1, 9) }),
        queueItem({ id: 2, scheduled_at: at(now, 1, 9), post: { title: 'About us', type: 'page', thumbnail: '', edit_link: '' } }),
      ],
    })
    renderPage(CalendarPage)
    await screen.findByRole('button', { name: 'About us' })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pages' }))

    expect(screen.queryByRole('button', { name: 'About us' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Hello post' })).toBeInTheDocument()
  })

  it('folds a busy time slot', async () => {
    const now = useWeek()
    fakeServer({ ...storeRoutes(), 'GET queue': [1, 2, 3, 4, 5].map((id) => queueItem({ id, scheduled_at: at(now, 4, 13), post: { title: `Post ${id}`, type: 'post', thumbnail: '', edit_link: '' } })) })
    renderPage(CalendarPage)

    await screen.findByRole('button', { name: 'Post 1' })
    expect(screen.queryByRole('button', { name: 'Post 4' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '2 more' }))
    expect(screen.getByRole('button', { name: 'Post 5' })).toBeInTheDocument()
  })

  it('retries a failed share', async () => {
    const now = useWeek()
    const server = fakeServer({ ...storeRoutes(), 'GET queue': [queueItem({ id: 7, status: 'failed', scheduled_at: at(now, 1, 9) })], 'POST queue/7/retry': { status: 'published', message: '' } })
    renderPage(CalendarPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    await findToast('Shared.')
    expect(server.to('POST queue/7/retry')).toHaveLength(1)
  })

  it('publishes a draft at once', async () => {
    const now = useWeek()
    const server = fakeServer({ ...storeRoutes(), 'GET queue': [queueItem({ id: 8, status: 'draft', scheduled_at: at(now, 3, 9) })], 'POST queue/8': { result: { status: 'failed', message: 'Bluesky did not accept the post.' } } })
    renderPage(CalendarPage)

    expect(await screen.findByText('Draft')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))

    await findToast('Bluesky did not accept the post.')
    expect(server.to('POST queue/8')[0]!.body).toEqual({ draft: false, scheduled_at: '' })
  })

  it('deletes a share on the second click', async () => {
    const now = useWeek()
    const server = fakeServer({ ...storeRoutes(), 'GET queue': [queueItem({ id: 9, scheduled_at: at(now, 3, 9) })], 'DELETE queue/9': { deleted: true } })
    renderPage(CalendarPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(server.to('DELETE queue/9')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Click again to delete' }))

    await findToast('Share deleted.')
    expect(server.to('DELETE queue/9')).toHaveLength(1)
  })

  it('duplicates a share in the composer', async () => {
    const now = useWeek()
    const item = queueItem({ id: 3, scheduled_at: at(now, 3, 9) })
    fakeServer({ ...storeRoutes(), 'GET queue': [item] })
    const { openComposer } = renderPage(CalendarPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }))

    expect(openComposer).toHaveBeenCalledWith({ copy: item })
  })

  it('shows a load error', async () => {
    useWeek()
    fakeServer({ ...storeRoutes(), 'GET queue': fail('Server error.') })
    renderPage(CalendarPage)

    expect(await screen.findByRole('alert')).toHaveTextContent('The calendar did not load. Server error.')
  })

  it('lists the accounts, with Reconnect for an expired one', async () => {
    useWeek()
    fakeServer({ ...storeRoutes([account(), account({ id: 'threads', network: 'threads', name: 'Shop Threads', status: 'expired' })]), 'GET queue': [] })
    renderPage(CalendarPage)

    expect(await screen.findByText('Shop Threads')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Threads · Reconnect' })).toHaveAttribute('href', '#/accounts')
  })

  it('shows an expired account without a link to a user who cannot manage accounts', async () => {
    setCaps('sint_view', 'sint_share')
    useWeek()
    fakeServer({ ...storeRoutes([account({ status: 'expired' })]), 'GET queue': [] })
    renderPage(CalendarPage)

    expect(await screen.findByText('Bluesky · Sign-in expired')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull()
  })

  it('asks to connect an account when there is none', async () => {
    useWeek()
    fakeServer({ ...storeRoutes([]), 'GET queue': [] })
    renderPage(CalendarPage)

    expect(await screen.findByRole('link', { name: 'Connect an account' })).toBeInTheDocument()
  })
})
