import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../frontend/admin/lib/types'
import { SettingsPage } from '../../frontend/admin/pages/Settings'
import { storeRoutes } from './fixtures'
import { ALL_CAPS, findToast, renderPage, setCaps } from './render'
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
    expect(await screen.findByRole('combobox', { name: 'Use of Paragraph' })).toHaveValue('excerpt')
    expect(screen.getByRole('combobox', { name: 'Use of Price' })).toHaveValue('')
    expect(screen.queryByRole('combobox', { name: 'Use of Quote' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Show all 4 blocks' }))
    expect(screen.getByRole('combobox', { name: 'Use of Quote' })).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Use of Quote' })).getByRole('option', { name: 'Default (Caption text)' })).toBeInTheDocument()
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

    fireEvent.change(await screen.findByRole('combobox', { name: 'Use of Paragraph' }), { target: { value: 'text' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Use of Image' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Default use' }), { target: { value: 'skip' } })
    await userEvent.click(screen.getByRole('switch', { name: 'Let editors change the rule for one block' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Keep the share log' }), { target: { value: '90' } })
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await findToast('Settings saved.')
    expect(server.to('POST settings')[0]!.body).toMatchObject({ blocks: { 'core/paragraph': 'text' }, block_fallback: 'skip', allow_block_override: false, log_days: 90, ai_keys: {} })
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('warns before the page closes with unsaved changes', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

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

    fireEvent.change(await screen.findByRole('combobox', { name: 'Keep the share log' }), { target: { value: '30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await findToast('Settings were not saved.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes')
  })

  it('hides the AI fields when AI is off', async () => {
    fakeServer({ ...storeRoutes(), 'GET settings': settings(), 'GET blocks': blocks })
    renderPage(SettingsPage)

    await screen.findByRole('combobox', { name: 'Provider' })
    expect(screen.queryByRole('combobox', { name: 'Tone' })).toBeNull()
    expect(screen.queryByLabelText(/API key/)).toBeNull()
  })
})
