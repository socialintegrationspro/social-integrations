import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../frontend/admin/lib/store'
import { AutoPost } from '../../frontend/admin/pages/AutoPost'
import type { CampaignRef } from '../../frontend/admin/pages/Composer'
import { account, storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, Providers, setCaps } from './render'
import { fail, fakeServer } from './server'

const accounts = [account(), account({ id: 'threads', network: 'threads', name: 'Shop Threads' })]

const sample = { id: 10, title: 'Summer sale', type: 'post', status: 'publish', date: '', link: '', edit_link: '', author: '', thumbnail: '', auto: true, shares: [] }

const preview = { caption: 'Summer sale\n\nhttps://shop.example/s', captions: {}, link: 'https://shop.example/s', media: [], fields: {}, tokens: {}, blocks: [], links: [] }

function renderAutoPost(campaign?: CampaignRef) {
  const onSaved = vi.fn()
  function WhenReady() {
    const { loading } = useStore()
    return loading ? null : <AutoPost campaign={campaign} onSaved={onSaved} />
  }
  render(<Providers><WhenReady /></Providers>)
  return { onSaved }
}

describe('Auto-post campaign', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => vi.unstubAllGlobals())

  it('creates a campaign for every account by default', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [sample], 'POST content/10/share': preview, 'POST campaigns/auto': { id: 5 } })
    const { onSaved } = renderAutoPost()

    expect(await screen.findByText('All accounts, and new ones you connect')).toBeInTheDocument()
    expect(screen.getByText('On: shares new posts')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Blog to all')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await findToast('Campaign created. The plugin will share new posts that match.')
    expect(onSaved).toHaveBeenCalled()
    expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ name: 'Blog to all', active: true, post_types: ['post'], accounts: [], delay: { value: 0, unit: 'minutes' } })
  })

  it('asks for a name before it saves', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Create campaign' }))

    expect(screen.getByText('Enter a name for the campaign.')).toBeInTheDocument()
    // The error is the description only, not part of the name.
    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Enter a name for the campaign.')
    expect(name).toHaveFocus()
    expect(server.to('POST campaigns/auto')).toHaveLength(0)
  })

  it('shares to the chosen accounts with a delay', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST campaigns/auto': { id: 5 } })
    renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Shop Threads, Threads' }))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '1 hour' }))
    expect(screen.getByText('1 hours after you publish')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Post type' }), { target: { value: 'page' } })
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Pages')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto')).toHaveLength(1))
    expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ accounts: ['bluesky'], post_types: ['page'], delay: { value: 1, unit: 'hours' } })
  })

  it('previews the caption with the latest post', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [sample], 'POST content/10/share': preview })
    renderAutoPost()

    expect(await screen.findByText('Preview: Summer sale')).toBeInTheDocument()
    expect(await screen.findByText(/^Summer sale\s+https:\/\/shop\.example\/s$/)).toBeInTheDocument()
    expect(server.to('GET content')[0]!.query.get('status')).toBe('publish')
  })

  it('says when no post is available for the preview', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    renderAutoPost()

    expect(await screen.findByText('No published post is available for the preview.')).toBeInTheDocument()
  })

  it('opens a saved campaign and saves it to its own route', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET campaigns/5': { id: 5, name: 'Blog', active: true, post_types: ['post'], accounts: [], delay: { value: 10, unit: 'minutes' }, caption: '{title}', captions: [], media: 'auto', custom_media: [] },
      'GET content': [],
      'POST campaigns/auto/5': { id: 5 },
    })
    renderAutoPost({ type: 'auto', id: 5 })

    expect(await screen.findByDisplayValue('Blog')).toBeInTheDocument()
    expect(screen.getByText('10 minutes after you publish')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save campaign' }))

    await findToast('Campaign saved.')
    expect(server.to('POST campaigns/auto/5')[0]!.body).toMatchObject({ name: 'Blog', caption: '{title}', captions: {} })
  })

  it('names a copy of a campaign and saves it as a new one', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET campaigns/5': { id: 5, name: 'Blog', active: true, post_types: ['post'], accounts: [], delay: { value: 0, unit: 'minutes' }, caption: '', captions: {}, media: 'auto', custom_media: [] },
      'GET content': [],
      'POST campaigns/auto': { id: 6 },
    })
    renderAutoPost({ type: 'auto', id: 5, copy: true })

    expect(await screen.findByDisplayValue('Blog (copy)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
    await waitFor(() => expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ id: 0, name: 'Blog (copy)' }))
  })

  it('shows a load error for a saved campaign', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET campaigns/5': fail('Campaign not found.', 404) })
    renderAutoPost({ type: 'auto', id: 5 })

    expect(await screen.findByRole('alert')).toHaveTextContent('The campaign did not load. Campaign not found.')
  })

  it('saves the campaign off for a user who cannot publish', async () => {
    setCaps('sint_view', 'sint_share')
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST campaigns/auto': { id: 5 } })
    renderAutoPost()

    expect(await screen.findByText('You save the campaign off. A user who can publish turns it on.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Campaign is on' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Mine')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ active: false }))
  })

  it('cannot save without a connected account', async () => {
    fakeServer({ ...storeRoutes([]), 'GET content': [] })
    renderAutoPost()

    expect(await screen.findByRole('link', { name: 'Connect an account first' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create campaign' })).toBeDisabled()
  })
})
