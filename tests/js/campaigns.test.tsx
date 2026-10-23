import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignsPage, type CampaignItem } from '../../frontend/admin/pages/Campaigns'
import { storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, renderPage, setCaps } from './render'
import { fail, fakeServer } from './server'

const campaign = (over: Partial<CampaignItem> = {}): CampaignItem => ({
  id: 3,
  type: 'auto',
  name: 'New posts',
  accounts: [],
  status: 'active',
  next_at: '',
  last_at: '2026-10-20T06:00:00Z',
  sent: 4,
  total: 4,
  updated_at: '2026-10-20T06:00:00Z',
  actions: ['edit', 'duplicate', 'delete', 'pause'],
  ...over,
})

const single = campaign({ id: 7, type: 'single', name: 'Launch day', status: 'scheduled', next_at: '2026-11-01T03:00:00Z', sent: 0, last_at: '', accounts: ['bluesky'], actions: ['edit', 'duplicate', 'delete'] })

describe('Campaigns screen', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => vi.unstubAllGlobals())

  it('shows an empty state with New campaign', async () => {
    fakeServer({ ...storeRoutes(), 'GET campaigns': [] })
    const { openComposer } = renderPage(CampaignsPage)

    expect(await screen.findByText('No campaigns yet')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'New campaign' }).at(-1)!)
    expect(openComposer).toHaveBeenCalledWith()
  })

  it('lists the campaigns with their type, accounts and status', async () => {
    fakeServer({ ...storeRoutes(), 'GET campaigns': [campaign(), single] })
    renderPage(CampaignsPage)

    const auto = (await screen.findByRole('button', { name: 'New posts' })).closest('tr')!
    expect(within(auto).getByText('Auto-post')).toBeInTheDocument()
    expect(within(auto).getByText('All accounts')).toBeInTheDocument()
    expect(within(auto).getByText('Active')).toBeInTheDocument()
    expect(within(auto).getByText('When you publish a post')).toBeInTheDocument()
    expect(within(auto).getByText('4 sent')).toBeInTheDocument()
    expect(within(auto).getByRole('link', { name: 'Share log of New posts' })).toHaveAttribute('href', '#/log?campaign=auto-3')

    const one = screen.getByRole('button', { name: 'Launch day' }).closest('tr')!
    expect(within(one).getByText('Single post')).toBeInTheDocument()
    expect(within(one).getByText('Scheduled')).toBeInTheDocument()
    expect(within(one).queryByRole('link', { name: /Share log/ })).toBeNull()
  })

  it('filters the list by campaign type', async () => {
    fakeServer({ ...storeRoutes(), 'GET campaigns': [campaign(), single] })
    renderPage(CampaignsPage)
    await screen.findByRole('button', { name: 'New posts' })

    await userEvent.click(within(screen.getByRole('tablist', { name: 'Campaign type' })).getByRole('tab', { name: 'Single post' }))

    expect(screen.queryByRole('button', { name: 'New posts' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Launch day' })).toBeInTheDocument()
  })

  it('opens a campaign in the composer to edit or duplicate it', async () => {
    fakeServer({ ...storeRoutes(), 'GET campaigns': [single] })
    const { openComposer } = renderPage(CampaignsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Launch day' }))
    expect(openComposer).toHaveBeenLastCalledWith({ campaign: { type: 'single', id: 7, accounts: ['bluesky'], copy: false } })

    await userEvent.click(screen.getByRole('button', { name: 'Duplicate Launch day' }))
    expect(openComposer).toHaveBeenLastCalledWith({ campaign: { type: 'single', id: 7, accounts: ['bluesky'], copy: true } })
  })

  it('pauses and resumes an auto-post campaign', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET campaigns': [campaign(), campaign({ id: 4, name: 'Old posts', status: 'paused', actions: ['resume'] })], 'POST campaigns/:id/active': { ok: true } })
    renderPage(CampaignsPage)

    await userEvent.click(within((await screen.findByRole('button', { name: 'New posts' })).closest('tr')!).getByRole('button', { name: 'Pause' }))
    await findToast('Campaign paused.')
    expect(server.to('POST campaigns/:id/active')[0]).toMatchObject({ path: 'campaigns/3/active', body: { active: false } })

    await userEvent.click(within(screen.getByRole('button', { name: 'Old posts' }).closest('tr')!).getByRole('button', { name: 'Resume' }))
    await findToast('Campaign resumed.')
    expect(server.to('POST campaigns/:id/active')[1]).toMatchObject({ path: 'campaigns/4/active', body: { active: true } })
  })

  it('has no Pause for a user who cannot publish', async () => {
    setCaps('sint_view', 'sint_share')
    fakeServer({ ...storeRoutes(), 'GET campaigns': [campaign()] })
    renderPage(CampaignsPage)

    await screen.findByRole('button', { name: 'New posts' })
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  it('deletes a campaign on the second click and removes it at once', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET campaigns': [campaign(), single], 'DELETE campaigns/7': { deleted: true } })
    renderPage(CampaignsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Launch day' }))
    expect(server.to('DELETE campaigns/7')).toHaveLength(0)
    server.on({ 'GET campaigns': [campaign()] })
    await userEvent.click(screen.getByRole('button', { name: 'Click again to delete' }))

    await findToast('Campaign deleted. Shares already sent stay in the share log.')
    expect(server.to('DELETE campaigns/7')).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Launch day' })).toBeNull())
  })

  it('shows the error when a delete fails', async () => {
    fakeServer({ ...storeRoutes(), 'GET campaigns': [single], 'DELETE campaigns/7': fail('The campaign is sending now.', 409) })
    renderPage(CampaignsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Launch day' }))
    await userEvent.click(screen.getByRole('button', { name: 'Click again to delete' }))

    await findToast('The campaign is sending now.')
    expect(screen.getByRole('button', { name: 'Launch day' })).toBeInTheDocument()
  })

  it('has the same actions in the narrow menu', async () => {
    fakeServer({ ...storeRoutes(), 'GET campaigns': [campaign()] })
    const { go } = renderPage(CampaignsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for New posts' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Pause', 'Share log', 'Edit', 'Duplicate', 'Delete'])
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Share log' }))
    expect(go).toHaveBeenCalledWith('log?campaign=auto-3')
  })

  it('shows a load error', async () => {
    fakeServer({ ...storeRoutes(), 'GET campaigns': fail('Database error.') })
    renderPage(CampaignsPage)

    expect(await screen.findByRole('alert')).toHaveTextContent('The campaigns did not load. Database error.')
  })
})
