import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../frontend/admin/lib/types'
import { SettingsPage } from '../../frontend/admin/pages/Settings'
import { storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, Providers, renderPage, setCaps } from './render'
import { fail, fakeServer, type Call } from './server'

const settings = (over: Partial<Settings> = {}): Settings => ({
  blocks: { 'core/paragraph': 'excerpt', 'core/image': 'media' },
  block_fallback: 'text',
  allow_block_override: true,
  max_images: 4,
  log_days: 0,
  ai: { provider: '', tone: 'friendly', model: '' },
  ai_providers: [
    { key: 'openai', label: 'OpenAI', needs_key: true, has_key: false, default_model: 'gpt-4o-mini' },
    { key: 'claude', label: 'Claude', needs_key: true, has_key: true, default_model: 'claude-haiku' },
  ],
  ...over,
})

const blocks = {
  blocks: [
    { name: 'core/paragraph', title: 'Paragraph', category: 'text', core: true, use: 'excerpt' },
    { name: 'core/image', title: 'Image', category: 'media', core: true, use: 'media' },
    { name: 'core/quote', title: 'Quote', category: 'text', core: true, use: null },
    { name: 'shop/price', title: 'Price', category: 'widgets', core: false, use: null },
  ],
}

/** The server saves what it gets and sends it back, without the keys. */
const saveRoute = (c: Call) => {
  const { ai_keys, ...rest } = c.body as Settings & { ai_keys: Record<string, string | null> }
  const providers = rest.ai_providers.map((p) => (p.key in ai_keys ? { ...p, has_key: ai_keys[p.key] !== null } : p))
  return { ...rest, ai_providers: providers }
}

/** Opens a section from the Settings menu. */
const open = async (name: string) => userEvent.click(within(await screen.findByRole('navigation', { name: 'Settings sections' })).getByRole('link', { name: new RegExp(`^${name}`) }))

describe('Settings screen', () => {
  beforeEach(() => setCaps(...ALL_CAPS))
  afterEach(() => {
    window.sintConfig!.ai.ready = false
    vi.unstubAllGlobals()
  })

  it('shows a skeleton, then the block rules with rules and other blocks', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

    expect(screen.getByText('Loading')).toBeInTheDocument()
    await open('Block rules')
    expect(await screen.findByRole('combobox', { name: 'Use of Paragraph' })).toHaveValue('excerpt')
    expect(screen.getByRole('combobox', { name: 'Use of Price' })).toHaveValue('')
    expect(screen.queryByRole('combobox', { name: 'Use of Quote' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Show all 4 blocks' }))
    expect(screen.getByRole('combobox', { name: 'Use of Quote' })).toBeInTheDocument()
    const quote = screen.getByRole('combobox', { name: 'Use of Quote' })
    expect(within(quote).getByRole('option', { name: 'Default (Text: {text})' })).toBeInTheDocument()
    expect(within(quote).getAllByRole('option').map((o) => o.textContent)).toEqual(['Default (Text: {text})', 'Text: {excerpt}', 'Text: {text}', 'Media', 'Link', 'Leave out'])
  })

  it('keeps a block row while the user changes it to Default', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

    await open('Block rules')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Use of Image' }), { target: { value: '' } })

    expect(screen.getByRole('combobox', { name: 'Use of Image' })).toHaveValue('')
  })

  it('explains each use in a tip on the Use as column', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

    await open('Block rules')
    await screen.findByRole('combobox', { name: 'Use of Paragraph' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'More information' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('The text goes into {excerpt} when the post has no excerpt.')
  })

  it('shows a load error with Try again', async () => {
    let first = true
    fakeServer({ ...storeRoutes(), 'GET settings': () => (first ? ((first = false), fail('No access.', 403)) : settings()), 'GET blocks': blocks })
    renderPage(SettingsPage)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The settings did not load. No access.')
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('marks unsaved changes and saves the block rules', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks, 'POST settings': saveRoute })
    renderPage(SettingsPage)

    await open('Block rules')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Use of Paragraph' }), { target: { value: 'text' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Use of Image' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Any other block' }), { target: { value: 'skip' } })
    await userEvent.click(screen.getByRole('switch', { name: 'Let editors change the rule for one block' }))
    // The changes stay when the user opens another section, and the menu marks the section.
    await open('Share log')
    fireEvent.change(screen.getByRole('combobox', { name: 'Keep the share log' }), { target: { value: '90' } })
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('link', { name: 'Block rules Unsaved changes' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'AI captions' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await findToast('Settings saved.')
    expect(server.to('POST settings')[0]!.body).toMatchObject({ blocks: { 'core/paragraph': 'text' }, block_fallback: 'skip', allow_block_override: false, log_days: 90, ai_keys: {} })
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('warns before the page closes with unsaved changes', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

    await open('Share log')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Keep the share log' }), { target: { value: '30' } })
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('sends a new API key once and turns AI on', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks, 'POST settings': saveRoute })
    renderPage(SettingsPage)

    fireEvent.change(await screen.findByRole('combobox', { name: 'Provider' }), { target: { value: 'openai' } })
    await userEvent.type(screen.getByLabelText(/^OpenAI API key/), 'sk-123')
    expect(screen.getByLabelText(/^Model/)).toHaveAttribute('placeholder', 'gpt-4o-mini')
    fireEvent.change(screen.getByRole('combobox', { name: 'Tone' }), { target: { value: 'bold' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await findToast('Settings saved.')
    expect(server.to('POST settings')[0]!.body).toMatchObject({ ai: { provider: 'openai', tone: 'bold', model: '' }, ai_keys: { openai: 'sk-123' } })
    expect(window.sintConfig!.ai.ready).toBe(true)
    // The key does not show again; the field says that a key is saved.
    expect(screen.getByLabelText('OpenAI API key')).toHaveValue('')
    expect(screen.getByLabelText('OpenAI API key')).toHaveAccessibleDescription('The plugin keeps the key encrypted on your site. It does not show the key again.')
    expect(screen.getByLabelText(/^OpenAI API key/)).toHaveAttribute('placeholder', 'Saved. Type a new key to replace it.')
  })

  it('removes a saved API key on save', async () => {
    const server = fakeServer({ ...storeRoutes(), 'GET settings': settings({ ai: { provider: 'claude', tone: 'friendly', model: '' } }), 'GET blocks': blocks, 'POST settings': saveRoute })
    renderPage(SettingsPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(screen.getByText('The plugin removes the key when you save.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await findToast('Settings saved.')
    expect(server.to('POST settings')[0]!.body).toMatchObject({ ai_keys: { claude: null } })
    expect(window.sintConfig!.ai.ready).toBe(false)
  })

  it('shows the error of a failed save and keeps the changes', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks, 'POST settings': fail('Settings were not saved.') })
    renderPage(SettingsPage)

    await open('Share log')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Keep the share log' }), { target: { value: '30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await findToast('Settings were not saved.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  })

  it('opens the section in the URL, and puts the section in the URL', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage, { params: 'section=log' })

    expect(await screen.findByRole('heading', { name: 'Share log' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Share log' })).toHaveAttribute('aria-current', 'page')
    await open('AI captions')
    expect(window.location.hash).toBe('#/settings?section=ai')
    expect(screen.getByRole('combobox', { name: 'Provider' })).toBeInTheDocument()
  })

  it('opens another section when the URL changes while the screen is open', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    const { rerender, go, openComposer } = renderPage(SettingsPage, { params: 'section=ai' })
    expect(await screen.findByRole('heading', { name: 'AI captions' })).toBeInTheDocument()

    rerender(<Providers><SettingsPage params={new URLSearchParams('section=log')} go={go} openComposer={openComposer} /></Providers>)

    expect(await screen.findByRole('heading', { name: 'Share log' })).toBeInTheDocument()
  })

  it('adds the sections of other plugins to the menu, and they save their own data', async () => {
    window.wp = { hooks: { applyFilters: (name: string, value: unknown) => (name === 'sint.settings.sections' ? [{ key: 'team', label: 'Team', description: 'Who can approve posts.', component: () => <p>Team rules</p> }] : value) } } as unknown as Window['wp']
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

    await open('Team')
    expect(screen.getByText('Team rules')).toBeInTheDocument()
    expect(screen.getByText('Who can approve posts.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    delete window.wp
  })

  it('hides the AI fields when AI is off', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

    await screen.findByRole('combobox', { name: 'Provider' })
    expect(screen.queryByRole('combobox', { name: 'Tone' })).toBeNull()
    expect(screen.queryByLabelText(/API key/)).toBeNull()
  })
})
