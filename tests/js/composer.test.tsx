import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuiltShare, ContentItem } from '../../frontend/admin/lib/types'
import { useStore } from '../../frontend/admin/lib/store'
import { Composer, type ComposerSeed } from '../../frontend/admin/pages/Composer'
import { account, queueItem, storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, Providers, setCaps } from './render'
import { fakeServer } from './server'
import { captionValue, findCaption, typeCaption } from './caption'

const accounts = [
  account(),
  account({ id: 'threads', network: 'threads', name: 'Shop Threads', username: 'shop' }),
  account({ id: 'facebook', network: 'facebook', name: 'Shop Page', status: 'expired', via: 'broker' }),
]

const content = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: 10,
  title: 'Summer sale',
  type: 'post',
  status: 'publish',
  date: '2026-10-20T06:00:00Z',
  link: 'https://shop.example/summer-sale',
  edit_link: '',
  author: 'Admin',
  thumbnail: '',
  auto: false,
  shares: [],
  ...over,
})

const built = (over: Partial<BuiltShare> = {}): BuiltShare => ({
  caption: 'Summer sale\n\nhttps://shop.example/summer-sale',
  captions: {},
  link: 'https://shop.example/summer-sale',
  media: [],
  fields: {},
  tokens: { title: 'Summer sale', url: 'https://shop.example/summer-sale', excerpt: 'All shoes', tags: '#Shoes', author: 'Admin' },
  blocks: [],
  links: [],
  ...over,
})

/** Renders the composer after the store loads, as the app opens it. */
function openComposer(seed: ComposerSeed = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  function WhenReady() {
    const { loading } = useStore()
    return loading ? null : <Composer seed={seed} onClose={onClose} onSaved={onSaved} />
  }
  render(<Providers><WhenReady /></Providers>)
  return { onClose, onSaved }
}

const dialog = () => screen.findByRole('dialog', { name: /New campaign|Edit post|Edit campaign/ })

describe('Composer', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => {
    window.sintConfig!.ai.ready = false
    window.location.hash = ''
    vi.unstubAllGlobals()
  })

  it('selects every connected account and shares a caption now', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET content': [],
      'POST queue': { created: [1, 2], results: [{ network: 'bluesky', status: 'published' }, { network: 'threads', status: 'published' }] },
    })
    const { onSaved } = openComposer()
    await dialog()

    expect(screen.getByRole('button', { name: 'Shop News, Bluesky' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Shop Threads, Threads' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Shop Page, Facebook Page: sign-in expired' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Share now' })).toBeDisabled()

    await typeCaption(await findCaption(), 'Big news')
    await userEvent.click(screen.getByRole('button', { name: 'Share now' }))

    await findToast('Shared to 2 accounts.')
    expect(onSaved).toHaveBeenCalled()
    expect(server.to('POST queue')[0]!.body).toMatchObject({ caption: 'Big news', captions: {}, accounts: ['bluesky', 'threads'], scheduled_at: '', draft: false, media: [] })
  })

  it('keeps the composer open and names the network that refused the post', async () => {
    fakeServer({
      ...storeRoutes(accounts),
      'GET content': [],
      'POST queue': { created: [1], results: [{ network: 'bluesky', status: 'published' }, { network: 'threads', status: 'failed', message: '' }] },
    })
    const { onSaved } = openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Share now' }))

    await findToast('Threads did not accept the post.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('keeps the selected accounts when the user changes to Auto-post and back', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Shop Threads, Threads' }))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Auto-post' }))
    expect(await screen.findByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shop Threads, Threads' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('checkbox', { name: 'Also share to accounts that you connect later' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Single post' }))
    expect(screen.getByText('2 of 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Auto-post' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }))
    await userEvent.click(screen.getByRole('button', { name: 'Single post' }))
    expect(screen.getByText('0 of 2')).toBeInTheDocument()
  })

  it('blocks a caption that is too long for a network', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'x'.repeat(301))

    const share = screen.getByRole('button', { name: 'Share now' })
    expect(share).toBeDisabled()
    expect(share).toHaveAttribute('title', 'Shorten the Bluesky caption first.')
    expect(screen.getByText('Bluesky 301/300')).toHaveClass('bad')
    expect(screen.getByText('Bluesky caption is 1 characters too long')).toBeInTheDocument()
  })

  it('says when the caption fits every network', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'Short')

    expect(screen.getByText('Fits all 2 networks')).toBeInTheDocument()
    expect(screen.getByText('The caption fits all 2 networks.')).toBeInTheDocument()
  })

  it('sends a caption of one network as its own', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST queue': { created: [1, 2] } })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'For all')
    await userEvent.click(screen.getByRole('tab', { name: /Threads/ }))
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('For all'))
    await typeCaption(await findCaption(), 'Only Threads')
    expect(screen.getByRole('tab', { name: /Threads/ })).toContainElement(screen.getByLabelText('Edited'))
    await userEvent.click(screen.getByRole('tab', { name: 'All networks' }))
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('For all'))

    await userEvent.click(screen.getByRole('button', { name: 'Select a time' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))

    await findToast('Added to the calendar.')
    expect(server.to('POST queue')[0]!.body).toMatchObject({ caption: 'For all', captions: { threads: 'Only Threads' } })
  })

  it('moves between caption tabs with the arrow keys', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    screen.getByRole('tab', { name: 'All networks' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Bluesky/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /Threads/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'All networks' })).toHaveAttribute('aria-selected', 'true')
  })

  it('schedules for a selected time in site time', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST queue': { created: [1] } })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'Later')
    await userEvent.click(screen.getByRole('button', { name: 'Select a time' }))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2026-12-01T09:30' } })
    expect(screen.getByText('Asia/Dhaka')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))

    await waitFor(() => expect(server.to('POST queue')).toHaveLength(1))
    expect(server.to('POST queue')[0]!.body).toMatchObject({ scheduled_at: '2026-12-01T03:30:00.000Z', draft: false })
  })

  it('opens at the time of a calendar slot', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer({ at: '2026-11-20T03:00:00.000Z' })
    await dialog()

    expect(screen.getByLabelText('Date and time')).toHaveValue('2026-11-20T09:00')
  })

  it('saves a draft', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST queue': { created: [1] } })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'Draft text')
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await findToast('Draft saved.')
    expect(server.to('POST queue')[0]!.body).toMatchObject({ draft: true })
  })

  it('lets a user who cannot publish save drafts only', async () => {
    setCaps('sint_view', 'sint_share')
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    expect(screen.queryByRole('button', { name: 'Share now' })).toBeNull()
    expect(screen.getByText('You save drafts only. A user who can publish schedules them.')).toBeInTheDocument()
  })

  it('selects and clears all accounts', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('0 of 2')).toBeInTheDocument()
    expect(screen.getByText('Select an account to see a preview.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })

  it('warns when a network needs media that the post does not have', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    expect(screen.getByRole('note')).toHaveTextContent('These networks need an image or a video: Threads. Add media, or the share to them fails.')
    await userEvent.click(screen.getByRole('button', { name: 'Shop Threads, Threads' }))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('leaves for Accounts to reconnect an expired account', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    const { onClose } = openComposer()
    await dialog()

    expect(screen.getByText(/Shop Page on Facebook Page: sign-in expired/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Reconnect' }))

    expect(onClose).toHaveBeenCalled()
    expect(window.location.hash).toBe('#/accounts?reconnect=facebook')
  })

  it('asks before it closes with changes, and keeps them on Go back', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    const { onClose } = openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'Work in progress')
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!)

    expect(screen.getByRole('alertdialog')).toHaveTextContent('You have changes that are not saved.')
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('Work in progress'))

    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes at once when nothing changed', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    const { onClose } = openComposer()
    await dialog()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('builds the caption from a post of the site and shows its link card', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET content': [content()],
      'GET content/10/share': built({ fields: { bluesky: { format: 'auto', first_comment: '' } } }),
    })
    openComposer()
    await dialog()

    await userEvent.click(await screen.findByRole('button', { name: /Summer sale/ }))

    await waitFor(async () => expect(captionValue(await findCaption())).toBe('Summer sale\n\nhttps://shop.example/summer-sale'))
    expect(server.to('GET content/10/share')).toHaveLength(1)
    expect(screen.getByText('shop.example')).toBeInTheDocument()
    expect(screen.getByText('Not shared yet')).toBeInTheDocument()

    // Tokens insert the post's values.
    await typeCaption(await findCaption(), '')
    await userEvent.click(screen.getByRole('button', { name: '{tags}' }))
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('#Shoes'))
    await userEvent.click(screen.getByRole('button', { name: 'Rebuild from post' }))
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('Summer sale\n\nhttps://shop.example/summer-sale'))

    await userEvent.click(screen.getByRole('button', { name: 'Write without a post' }))
    expect(screen.queryByText('shop.example')).toBeNull()
  })

  it('searches the content of the site', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': (c: { query: URLSearchParams }) => (c.query.get('search') ? [] : [content()]) })
    openComposer()
    await dialog()
    await screen.findByRole('button', { name: /Summer sale/ })

    await userEvent.type(screen.getByLabelText('Search content'), 'winter')

    expect(await screen.findByText('No posts match the search.')).toBeInTheDocument()
    expect(server.to('GET content').at(-1)!.query.get('search')).toBe('winter')
    await userEvent.click(screen.getByRole('button', { name: 'Pages' }))
    await waitFor(() => expect(server.to('GET content').at(-1)!.query.get('type')).toBe('page'))
  })

  it('says when the site has no posts', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    expect(await screen.findByText('There are no posts yet.')).toBeInTheDocument()
  })

  it('shows the share state of each post', async () => {
    fakeServer({
      ...storeRoutes(accounts),
      'GET content': [
        content({ id: 1, title: 'A', shares: [{ account_id: 'bluesky', network: 'bluesky', status: 'failed', message: '', remote_url: '', date: '' }] }),
        content({ id: 2, title: 'B', shares: [{ account_id: 'bluesky', network: 'bluesky', status: 'published', message: '', remote_url: '', date: '' }] }),
        content({ id: 3, title: 'Gamma', status: 'draft' }),
      ],
    })
    openComposer()
    await dialog()

    expect(await screen.findByText('1 failed')).toBeInTheDocument()
    expect(screen.getByText('Shared to 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Gamma/ })).toHaveTextContent(/Post·Draft/)
  })

  it('shows a load error for the posts', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': { __reply: true, status: 500, body: { code: 'x', message: 'Down' } } })
    openComposer()
    await dialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The posts did not load.')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('edits a scheduled share of one account', async () => {
    const item = queueItem({ id: 5, scheduled_at: new Date(Date.now() + 86400000).toISOString(), caption: 'Old text' })
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content/10/share': built(), 'POST queue/5': {} })
    const { onSaved } = openComposer({ item })

    expect(await screen.findByRole('dialog', { name: 'Edit post' })).toBeInTheDocument()
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('Old text'))
    expect(screen.getByRole('button', { name: 'Shop News, Bluesky' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Shop Threads, Threads' })).toBeNull()
    expect(screen.queryByText('From your site')).toBeNull()

    await typeCaption(await findCaption(), 'New text')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await findToast('Saved to the calendar.')
    expect(server.to('POST queue/5')[0]!.body).toMatchObject({ caption: 'New text', draft: false })
    expect(onSaved).toHaveBeenCalled()
  })

  it('keeps an edited share open when the network refuses it', async () => {
    const item = queueItem({ id: 6, status: 'failed', post_id: 0, post: null })
    fakeServer({ ...storeRoutes(accounts), 'POST queue/6': { result: { status: 'failed', message: 'Bluesky sign-in expired. Reconnect the account.' } } })
    const { onSaved } = openComposer({ item })
    await screen.findByRole('dialog', { name: 'Edit post' })

    await userEvent.click(screen.getByRole('button', { name: 'Share now' }))

    await findToast('Bluesky sign-in expired. Reconnect the account.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('starts a duplicate as a new share for the same account', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'GET content/10/share': built() })
    openComposer({ copy: queueItem({ caption: 'Copy me' }) })

    expect(await screen.findByRole('dialog', { name: 'New campaign' })).toBeInTheDocument()
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('Copy me'))
    expect(screen.getByRole('button', { name: 'Shop News, Bluesky' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Shop Threads, Threads' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens a saved single campaign and saves it to its own route', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET content': [],
      'GET campaigns/4': { id: 4, post_id: 0, caption: 'Saved caption', captions: [], accounts: ['threads'], media: [], fields: [], scheduled_at: '', draft: false, options: [] },
      'POST campaigns/4': { created: [] },
    })
    openComposer({ campaign: { type: 'single', id: 4 } })

    expect(await screen.findByRole('dialog', { name: 'Edit campaign' })).toBeInTheDocument()
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('Saved caption'))
    expect(screen.getByRole('button', { name: 'Shop News, Bluesky' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Select a time' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await findToast('Saved to the calendar.')
    expect(server.to('POST campaigns/4')[0]!.body).toMatchObject({ caption: 'Saved caption', accounts: ['threads'] })
  })

  it('improves the caption with the AI menu and can undo it', async () => {
    window.sintConfig!.ai.ready = true
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST ai/caption': { caption: 'A better caption', warnings: [] } })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'my text')
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    const menu = screen.getByRole('menu', { name: 'AI' })
    // Without a post there is nothing to write from.
    expect(within(menu).queryByRole('menuitem', { name: /Write from post/ })).toBeNull()
    await userEvent.click(within(menu).getByRole('menuitem', { name: /^Improve/ }))

    await waitFor(async () => expect(captionValue(await findCaption())).toBe('A better caption'))
    expect(server.to('POST ai/caption')[0]!.body).toEqual({ mode: 'improve', text: 'my text', limit: 300 })
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(captionValue(await findCaption())).toBe('my text'))
  })

  it('changes the tone and translates with the AI menu', async () => {
    window.sintConfig!.ai.ready = true
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST ai/caption': { caption: 'Hola', warnings: [] } })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'AI' })).getByRole('menuitem', { name: 'Playful' }))
    await waitFor(() => expect(server.to('POST ai/caption')).toHaveLength(1))
    expect(server.to('POST ai/caption')[0]!.body).toMatchObject({ mode: 'tone', tone: 'playful' })

    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Language' }), 'Spanish{Enter}')
    await waitFor(() => expect(server.to('POST ai/caption')).toHaveLength(2))
    expect(server.to('POST ai/caption')[1]!.body).toMatchObject({ mode: 'translate', language: 'Spanish', text: 'Hola' })
  })

  it('shares with Ctrl and Enter', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST queue': { created: [1] } })
    openComposer()
    await dialog()

    await typeCaption(await findCaption(), 'Fast')
    fireEvent.keyDown(await findCaption(), { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(server.to('POST queue')).toHaveLength(1))
  })

  it('switches the preview between networks', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    const group = screen.getByRole('group', { name: 'Preview network' })
    await userEvent.click(within(group).getByRole('button', { name: 'Threads' }))

    expect(within(group).getByRole('button', { name: 'Threads' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Shop Threads', { selector: 'div' })).toBeInTheDocument()
  })

  it('tells the user when the media library is not loaded', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    openComposer()
    await dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Add media' }))

    await findToast('The media library did not load. Reload the page and try again.')
  })

  it('turns media from the media library on and off', async () => {
    let onSelect = () => {}
    window.wp = {
      media: () => ({
        on: (_e: string, cb: () => void) => (onSelect = cb),
        open: () => onSelect(),
        state: () => ({ get: () => ({ toJSON: () => [{ id: 3, url: 'https://shop.example/a.jpg', alt: 'Shoes', type: 'image' }] }) }),
      }),
    }
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST queue': { created: [1] } })
    openComposer()
    await dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Add media' }))
    const image = screen.getByRole('button', { name: 'Shoes' })
    expect(image).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('note')).toBeNull()
    await userEvent.click(image)
    expect(image).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(image)

    await typeCaption(await findCaption(), 'With image')
    await userEvent.click(screen.getByRole('button', { name: 'Share now' }))
    await waitFor(() => expect(server.to('POST queue')).toHaveLength(1))
    expect(server.to('POST queue')[0]!.body).toMatchObject({ media: [{ id: 3, url: 'https://shop.example/a.jpg', type: 'image' }] })
    delete window.wp
  })

  it('sets a post option for all networks that have it', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST queue': { created: [1] } })
    openComposer()
    await dialog()

    fireEvent.change(screen.getByLabelText('First comment'), { target: { value: 'Link in bio' } })
    await typeCaption(await findCaption(), 'Hi')
    await userEvent.click(screen.getByRole('button', { name: 'Share now' }))

    await waitFor(() => expect(server.to('POST queue')).toHaveLength(1))
    const body = server.to('POST queue')[0]!.body as { fields: unknown; field_values: Record<string, Record<string, string>> }
    expect(body.fields).toEqual({ '*': { first_comment: 'Link in bio' } })
    expect(body.field_values.bluesky).toEqual({ format: 'auto', first_comment: 'Link in bio' })
  })
})

describe('AccountControls', () => {
  afterEach(() => {
    delete window.wp
  })

  it('renders nothing without a filter, and the filter controls in their own row', async () => {
    const { AccountControls } = await import('../../frontend/admin/pages/composer/AccountPicker')
    const props = { accounts: [], selected: [], setSelected: () => undefined, locked: false }
    const { container, rerender } = render(<AccountControls {...props} />)
    expect(container).toBeEmptyDOMElement()

    window.wp = { hooks: { applyFilters: (name: string, value: unknown) => (name === 'sint.composer.accounts' ? [<span key="x">Clients</span>] : value) } } as unknown as Window['wp']
    rerender(<AccountControls {...props} locked />)
    expect(screen.getByText('Clients').parentElement).toHaveClass('sint-share-to')
  })
})
