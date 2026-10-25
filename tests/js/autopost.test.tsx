import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../frontend/admin/lib/store'
import { Composer, type CampaignRef } from '../../frontend/admin/pages/Composer'
import { account, postTypes, storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, Providers, setCaps } from './render'
import { fail, fakeServer } from './server'

const accounts = [account(), account({ id: 'threads', network: 'threads', name: 'Shop Threads' })]

const sample = { id: 10, title: 'Summer sale', type: 'post', status: 'publish', date: '', link: '', edit_link: '', author: '', thumbnail: '', auto: true, shares: [] }

const preview = { caption: 'Summer sale\n\nhttps://shop.example/s', captions: {}, link: 'https://shop.example/s', media: [], fields: {}, tokens: {}, blocks: [], links: [] }

/** Opens the composer on the Auto-post tab, as the app does. Its "Share to" row is the row of every tab. */
async function renderAutoPost(campaign?: CampaignRef) {
  const onSaved = vi.fn()
  function WhenReady() {
    const { loading } = useStore()
    return loading ? null : <Composer seed={{ campaign }} onClose={vi.fn()} onSaved={onSaved} />
  }
  render(<Providers><WhenReady /></Providers>)
  if (!campaign) await userEvent.click(await screen.findByRole('button', { name: 'Auto-post' }))
  return { onSaved }
}

describe('Auto-post campaign', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => vi.unstubAllGlobals())

  it('creates a campaign for every account by default', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [sample], 'POST content/10/share': preview, 'POST campaigns/auto': { id: 5 } })
    const { onSaved } = await renderAutoPost()

    expect(await screen.findByRole('checkbox', { name: 'Also share to accounts that you connect later' })).toBeChecked()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Blog to all')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await findToast('Campaign created. The plugin will share new posts that match.')
    expect(onSaved).toHaveBeenCalled()
    expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ name: 'Blog to all', active: true, post_types: ['post'], accounts: [], delay: { value: 0, unit: 'minutes' } })
  })

  it('asks for a name before it saves', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    await renderAutoPost()

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
    await renderAutoPost()

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
    await renderAutoPost()

    expect(await screen.findByText('Preview: Summer sale')).toBeInTheDocument()
    expect(await screen.findByText(/^Summer sale\s+https:\/\/shop\.example\/s$/)).toBeInTheDocument()
    expect(server.to('GET content')[0]!.query.get('status')).toBe('publish')
  })

  it('says when no post is available for the preview', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    await renderAutoPost()

    expect(await screen.findByText('No published post is available for the preview.')).toBeInTheDocument()
  })

  it('opens a saved campaign and saves it to its own route', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET campaigns/5': { id: 5, name: 'Blog', active: true, post_types: ['post'], accounts: [], delay: { value: 10, unit: 'minutes' }, caption: '{title}', captions: [], media: 'auto', custom_media: [] },
      'GET content': [],
      'POST campaigns/auto/5': { id: 5 },
    })
    await renderAutoPost({ type: 'auto', id: 5 })

    expect(await screen.findByDisplayValue('Blog')).toBeInTheDocument()
    expect(screen.getByText('10 minutes after you publish')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save campaign' }))

    await findToast('Campaign saved.')
    expect(server.to('POST campaigns/auto/5')[0]!.body).toMatchObject({ name: 'Blog', caption: '{title}', captions: {} })
  })

  it('opens a campaign without accounts with none selected', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET campaigns/5': { id: 5, name: 'Blog', active: false, no_accounts: true, post_types: ['post'], accounts: [], delay: { value: 0, unit: 'minutes' }, caption: '', captions: [], media: 'auto', custom_media: [] },
      'GET content': [],
      'POST campaigns/auto/5': { id: 5 },
    })
    await renderAutoPost({ type: 'auto', id: 5 })

    expect(await screen.findByText('0 of 2')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Also share to accounts that you connect later' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Shop Threads, Threads' }))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto/5')).toHaveLength(1))
    expect(server.to('POST campaigns/auto/5')[0]!.body).toMatchObject({ accounts: ['threads'], no_accounts: false })
  })

  it('keeps an empty selection as no accounts, not every account', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [] })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Shop Threads, Threads' }))
    await userEvent.click(screen.getByRole('button', { name: 'Shop News, Bluesky' }))

    expect(screen.getByText('0 of 2')).toBeInTheDocument()
  })

  it('clears the accounts, then shares to the accounts selected after', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST campaigns/auto': { id: 5 } })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }))
    expect(screen.getByText('0 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Shop Threads, Threads' }))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Threads only')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto')).toHaveLength(1))
    expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ accounts: ['threads'], no_accounts: false })
  })

  it('asks for an account before it saves', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST campaigns/auto': { id: 5 } })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Nobody')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    expect(screen.getByText('Select an account.')).toBeInTheDocument()
    expect(server.to('POST campaigns/auto')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Shop Threads, Threads' }))
    expect(screen.queryByText('Select an account.')).not.toBeInTheDocument()
  })

  it('goes back to every account with Select all', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST campaigns/auto': { id: 5 } })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Shop Threads, Threads' }))
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('checkbox', { name: 'Also share to accounts that you connect later' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'All')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto')).toHaveLength(1))
    expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ accounts: [], no_accounts: false })
  })

  it('shares to the selected accounts only when the user turns off the accounts connected later', async () => {
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST campaigns/auto': { id: 5 } })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Also share to accounts that you connect later' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'These two')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto')).toHaveLength(1))
    expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ accounts: ['bluesky', 'threads'] })
  })

  it('opens a campaign with its own list with the accounts connected later turned off', async () => {
    fakeServer({
      ...storeRoutes(accounts),
      'GET campaigns/5': { id: 5, name: 'Blog', active: true, post_types: ['post'], accounts: ['bluesky', 'threads'], delay: { value: 0, unit: 'minutes' }, caption: '', captions: {}, media: 'auto', custom_media: [] },
      'GET content': [],
    })
    await renderAutoPost({ type: 'auto', id: 5 })

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Also share to accounts that you connect later' })).not.toBeChecked())
  })

  it('shows an expired account as the other tabs do, and keeps it in a saved campaign', async () => {
    const three = [account(), account({ id: 'threads', network: 'threads', name: 'Shop Threads', status: 'expired' }), account({ id: 'facebook', network: 'facebook', name: 'Shop Page' })]
    const server = fakeServer({
      ...storeRoutes(three),
      'GET campaigns/5': { id: 5, name: 'Blog', active: true, post_types: ['post'], accounts: ['bluesky', 'threads'], delay: { value: 0, unit: 'minutes' }, caption: '', captions: {}, media: 'auto', custom_media: [] },
      'GET content': [],
      'POST campaigns/auto/5': { id: 5 },
    })
    await renderAutoPost({ type: 'auto', id: 5 })

    expect(await screen.findByText(/Shop Threads on Threads: sign-in expired/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', '#/accounts?reconnect=threads')
    const pick = screen.getByRole('button', { name: 'Shop Threads, Threads: sign-in expired' })
    expect(pick).toBeDisabled()
    expect(pick).toHaveClass('expired')
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Save campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto/5')).toHaveLength(1))
    expect(server.to('POST campaigns/auto/5')[0]!.body).toMatchObject({ accounts: ['bluesky', 'threads'] })
  })

  it('keeps a paused campaign paused and says where to resume it', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET campaigns/5': { id: 5, name: 'Blog', active: false, post_types: ['post'], accounts: [], delay: { value: 0, unit: 'minutes' }, caption: '', captions: {}, media: 'auto', custom_media: [] },
      'GET content': [],
      'POST campaigns/auto/5': { id: 5 },
    })
    await renderAutoPost({ type: 'auto', id: 5 })

    expect(await screen.findByText('This campaign is paused. Resume it on the Campaigns screen.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save campaign' }))
    await waitFor(() => expect(server.to('POST campaigns/auto/5')[0]!.body).toMatchObject({ active: false }))
  })

  it('adds a custom field from the list, with a value of a recent post', async () => {
    const fields = [
      { key: 'event_date', label: 'Event date', media: false, sample: 'October 24, 2026' },
      { key: 'ticket_url', label: 'Ticket link', media: false, sample: 'https://shop.example/t' },
    ]
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'GET post-types/post/fields': fields, 'POST campaigns/auto': { id: 5 } })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Custom field' }))
    const list = screen.getByRole('group', { name: 'Custom field' })
    expect(within(list).getByText('For example: October 24, 2026')).toBeInTheDocument()
    await userEvent.click(within(list).getByRole('button', { name: /^Event date/ }))
    expect(screen.queryByRole('group', { name: 'Custom field' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveValue('{field:event_date}')

    await userEvent.click(screen.getByRole('button', { name: 'Link from a custom field' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Link from a custom field' })).getByRole('button', { name: /^Ticket link/ }))
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue('{field:ticket_url}')

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Events')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
    await waitFor(() => expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ caption: '{field:event_date}', link: '{field:ticket_url}' }))
  })

  it('warns about a token or a field with a typing error, and fixes it', async () => {
    const fields = [{ key: 'buy_url', label: 'Buy link', media: false, sample: 'https://shop.example/b' }]
    fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'GET post-types/post/fields': fields })
    await renderAutoPost()

    const caption = await screen.findByRole('textbox', { name: 'Caption' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Custom field' })).toBeInTheDocument())
    fireEvent.change(caption, { target: { value: '{titel} {field:buy_ul}' } })

    expect(await screen.findByText('{field:buy_ul}: no recent post of this type has this field. When a post does not have it, the share leaves it empty.')).toBeInTheDocument()
    expect(screen.getByText('{titel} is not a token. The share shows it as text.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use {field:buy_url}' }))
    await userEvent.click(screen.getByRole('button', { name: 'Use {title}' }))
    expect(caption).toHaveValue('{title} {field:buy_url}')
    expect(screen.queryByText(/is not a token|has this field/)).toBeNull()

    // The link gets the same check.
    fireEvent.change(screen.getByRole('textbox', { name: 'Link' }), { target: { value: '{field:buy_uri}' } })
    await userEvent.click(screen.getByRole('button', { name: 'Use {field:buy_url}' }))
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue('{field:buy_url}')
  })

  it('says when the posts have no custom fields', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'GET post-types/post/fields': [] })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Custom field' }))
    expect(await screen.findByText('The posts of this type have no custom fields.')).toBeInTheDocument()
  })

  it('uses the images of a custom field as media', async () => {
    const fields = [
      { key: 'venue', label: 'Venue', media: false, sample: 'City Hall' },
      { key: 'event_gallery', label: 'Gallery', media: true, sample: '12, 15' },
    ]
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'GET post-types/post/fields': fields, 'POST campaigns/auto': { id: 5 } })
    await renderAutoPost()

    const media = await screen.findByRole('combobox', { name: 'Media' })
    await waitFor(() => expect(within(media).getByRole('option', { name: 'Images from a custom field' })).toBeInTheDocument())
    fireEvent.change(media, { target: { value: 'field' } })
    const field = screen.getByRole('combobox', { name: 'Field with the images' })
    expect(within(field).getAllByRole('option').map((o) => o.textContent)).toEqual(['Gallery'])

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Gallery')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
    await waitFor(() => expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ media: 'field', media_field: 'event_gallery' }))
  })

  it('shows the price tokens for products', async () => {
    const types = [...postTypes, { name: 'product', label: 'Products', singular: 'Product', source: 'WooCommerce', builtin: false, count: 4, tokens: ['price', 'regular_price', 'sale_price'] }]
    fakeServer({ ...storeRoutes(accounts), 'GET post-types': types, 'GET content': [], 'GET post-types/product/fields': [] })
    await renderAutoPost()

    expect(screen.queryByRole('button', { name: '{price}' })).toBeNull()
    fireEvent.change(await screen.findByRole('combobox', { name: 'Post type' }), { target: { value: 'product' } })
    await userEvent.click(await screen.findByRole('button', { name: '{sale_price}' }))
    expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveValue('{sale_price}')
  })

  it('names a copy of a campaign and saves it as a new one', async () => {
    const server = fakeServer({
      ...storeRoutes(accounts),
      'GET campaigns/5': { id: 5, name: 'Blog', active: true, post_types: ['post'], accounts: [], delay: { value: 0, unit: 'minutes' }, caption: '', captions: {}, media: 'auto', custom_media: [] },
      'GET content': [],
      'POST campaigns/auto': { id: 6 },
    })
    await renderAutoPost({ type: 'auto', id: 5, copy: true })

    expect(await screen.findByDisplayValue('Blog (copy)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
    await waitFor(() => expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ id: 0, name: 'Blog (copy)' }))
  })

  it('shows a load error for a saved campaign', async () => {
    fakeServer({ ...storeRoutes(accounts), 'GET campaigns/5': fail('Campaign not found.', 404) })
    await renderAutoPost({ type: 'auto', id: 5 })

    expect(await screen.findByRole('alert')).toHaveTextContent('The campaign did not load. Campaign not found.')
  })

  it('saves the campaign off for a user who cannot publish', async () => {
    setCaps('sint_view', 'sint_share')
    const server = fakeServer({ ...storeRoutes(accounts), 'GET content': [], 'POST campaigns/auto': { id: 5 } })
    await renderAutoPost()

    expect(await screen.findByText('You save the campaign off. A user who can publish turns it on.')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Mine')
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() => expect(server.to('POST campaigns/auto')[0]!.body).toMatchObject({ active: false }))
  })

  it('cannot save without a connected account', async () => {
    fakeServer({ ...storeRoutes([]), 'GET content': [] })
    await renderAutoPost()

    expect(await screen.findByRole('link', { name: 'Connect an account first' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create campaign' })).toBeDisabled()
  })
})

describe('Auto-post campaign: sint.composer.accounts', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => {
    delete window.wp
    vi.unstubAllGlobals()
  })

  it('gives the controls every ID for all accounts, and stores a full list as all accounts', async () => {
    let ctx: { selected: string[]; setSelected: (u: (ids: string[]) => string[]) => void } | undefined
    const Controls = (c: typeof ctx) => {
      ctx = c
      return <button type="button" onClick={() => c!.setSelected((ids) => ids.filter((id) => id !== 'threads'))}>Only Bluesky</button>
    }
    window.wp = { hooks: { applyFilters: (name: string, value: unknown, c: typeof ctx) => (name === 'sint.composer.accounts' ? [<Controls key="c" {...c!} />] : value) } } as unknown as Window['wp']
    fakeServer({ ...storeRoutes(accounts), 'GET content': [sample], 'POST content/10/share': preview })
    await renderAutoPost()

    await userEvent.click(await screen.findByRole('button', { name: 'Only Bluesky' }))
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(ctx!.selected).toEqual(['bluesky'])

    act(() => ctx!.setSelected(() => ['bluesky', 'threads']))
    expect(await screen.findByRole('checkbox', { name: 'Also share to accounts that you connect later' })).toBeChecked()
  })
})
