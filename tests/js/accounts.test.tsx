import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsPage } from '../../frontend/admin/pages/Accounts'
import { account, storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, renderPage, renderReady, setCaps } from './render'
import { fail, fakeServer } from './server'

describe('Accounts screen', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => vi.unstubAllGlobals())

  it('shows connected accounts and a Connect tile for each other network', async () => {
    fakeServer(storeRoutes())
    renderPage(AccountsPage)

    expect(await screen.findByText('Shop News')).toBeInTheDocument()
    expect(screen.getByText('shop.bsky.social')).toBeInTheDocument()
    expect(screen.getByText('300 characters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Facebook Page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Threads' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Telegram' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Bluesky' })).toBeNull()
  })

  it('warns about an expired account and opens its sign-in from Reconnect', async () => {
    fakeServer(storeRoutes([account({ id: 'threads', network: 'threads', name: 'Shop', status: 'expired', via: 'broker' })]))
    renderPage(AccountsPage)

    expect(await screen.findByText('Shop on Threads: sign-in expired')).toBeInTheDocument()
    expect(screen.getByText('Sign-in expired')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Reconnect' })[0]!)

    const dialog = screen.getByRole('dialog', { name: 'Connect Threads' })
    expect(within(dialog).getByRole('button', { name: 'Sign in to Threads' })).toBeInTheDocument()
  })

  it('connects a network with a token and loads the accounts again', async () => {
    const server = fakeServer({ ...storeRoutes(), 'POST accounts/telegram': account({ id: 'telegram', network: 'telegram' }) })
    renderPage(AccountsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Telegram' }))
    const dialog = screen.getByRole('dialog', { name: 'Connect Telegram' })
    await userEvent.type(within(dialog).getByLabelText('Bot token'), '123:abc')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))

    await findToast('Telegram is connected.')
    expect(server.to('POST accounts/telegram')[0]!.body).toEqual({ bot_token: '123:abc' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(server.to('GET accounts').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the server error when a credentials connect fails', async () => {
    fakeServer({ ...storeRoutes([]), 'POST accounts/bluesky': fail('Bluesky did not accept the app password.', 400) })
    renderPage(AccountsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Bluesky' }))
    const dialog = screen.getByRole('dialog', { name: 'Connect Bluesky' })
    await userEvent.type(within(dialog).getByLabelText('Handle'), 'shop.bsky.social')
    await userEvent.type(within(dialog).getByLabelText('App password'), 'xxxx')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))

    expect(await within(dialog).findByText('Bluesky did not accept the app password.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('asks how to sign in when a network has two methods, and starts the app sign-in', async () => {
    const server = fakeServer({ ...storeRoutes(), 'POST oauth/facebook/start': { url: 'https://broker.example/start' } })
    const href = vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, href: '' } as Location)
    renderPage(AccountsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Facebook Page' }))
    const dialog = screen.getByRole('dialog', { name: 'Connect Facebook Page' })
    expect(within(dialog).getByRole('button', { name: /Use my own app/ })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /Connect with Social Integrations/ }))

    await waitFor(() => expect(server.to('POST oauth/facebook/start')).toHaveLength(1))
    expect(server.to('POST oauth/facebook/start')[0]!.body).toEqual({ method: 'broker' })
    href.mockRestore()
  })

  it('saves the details of an own app before the sign-in', async () => {
    const server = fakeServer({ ...storeRoutes(), 'POST apps/facebook': { ok: true } })
    renderPage(AccountsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Facebook Page' }))
    const dialog = screen.getByRole('dialog', { name: 'Connect Facebook Page' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Use my own app/ }))
    expect(within(dialog).getByRole('link', { name: /Create an app on Facebook Page/ })).toHaveAttribute('href', 'https://developers.example.com/apps')
    await userEvent.type(within(dialog).getByLabelText('App ID'), 'id1')
    await userEvent.type(within(dialog).getByLabelText('App secret'), 's1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save app' }))

    expect(await within(dialog).findByRole('button', { name: 'Sign in to Facebook Page' })).toBeInTheDocument()
    expect(server.to('POST apps/facebook')[0]!.body).toEqual({ client_id: 'id1', client_secret: 's1' })
    expect(within(dialog).getByRole('button', { name: 'Change app' })).toBeInTheDocument()
  })

  it('disconnects an account after the user confirms', async () => {
    const server = fakeServer({ ...storeRoutes(), 'DELETE accounts/bluesky': { deleted: true } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage(AccountsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))

    expect(confirm).toHaveBeenCalledWith('Disconnect Shop News? Scheduled shares to it will fail.')
    await findToast('Account disconnected.')
    expect(server.to('DELETE accounts/bluesky')).toHaveLength(1)
  })

  it('keeps the account when the user cancels the disconnect', async () => {
    const server = fakeServer(storeRoutes())
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage(AccountsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))

    expect(server.to('DELETE accounts/:id')).toHaveLength(0)
  })

  it('shows a toast after a sign-in callback and clears the URL', async () => {
    fakeServer(storeRoutes([account({ id: 'threads', network: 'threads' })]))
    const { go } = renderPage(AccountsPage, { params: 'connected=threads' })

    // The store is not loaded on the first render, so the toast names the key.
    await findToast(/is connected\.$/)
    expect(go).toHaveBeenCalledWith('accounts')
  })

  it('opens the sign-in of an account from a reconnect link', async () => {
    fakeServer(storeRoutes())
    renderReady(AccountsPage, { params: 'reconnect=bluesky' })

    expect(await screen.findByRole('dialog', { name: 'Connect Bluesky' })).toBeInTheDocument()
  })

  it('lists the places to post after an OAuth sign-in and connects the chosen one', async () => {
    const server = fakeServer({
      ...storeRoutes([]),
      'GET oauth/facebook/entities': [
        { remote_id: 'p1', name: 'Shop Page', avatar: '' },
        { remote_id: 'p2', name: 'Blog Page', avatar: '' },
      ],
      'POST oauth/facebook/entities': { ok: true },
    })
    const { go } = renderReady(AccountsPage, { params: 'pick=facebook' })

    const dialog = await screen.findByRole('dialog', { name: 'Select where to post on Facebook Page' })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Blog Page' }))

    await findToast('Blog Page is connected.')
    expect(server.to('POST oauth/facebook/entities')[0]!.body).toEqual({ remote_id: 'p2' })
    expect(go).toHaveBeenCalledWith('accounts')
  })

  it('shows a load error for the places to post, with Try again', async () => {
    fakeServer({ ...storeRoutes([]), 'GET oauth/facebook/entities': fail('The sign-in session ended.', 400) })
    renderReady(AccountsPage, { params: 'pick=facebook' })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The sign-in session ended.')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows the sign-in error that the server kept', async () => {
    window.sintConfig!.oauthError = 'Facebook refused the permission.'
    fakeServer(storeRoutes())
    const { go } = renderPage(AccountsPage, { params: 'error=1' })

    expect(await screen.findByText('Facebook refused the permission.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Facebook refused the permission.')).toBeNull()
    expect(go).toHaveBeenCalledWith('accounts')
    window.sintConfig!.oauthError = ''
  })
})
