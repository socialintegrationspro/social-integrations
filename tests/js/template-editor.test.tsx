import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldPreview } from '../../frontend/admin/components/FieldPreview'
import { fieldValue, missingMedia, resolveFields, tabFields } from '../../frontend/admin/components/PostFields'
import { TemplateEditor, type ShareTemplate } from '../../frontend/admin/components/TemplateEditor'
import { useStore } from '../../frontend/admin/lib/store'
import { bluesky, networks, storeRoutes, threads } from './fixtures'
import { Providers } from './render'
import { fakeServer } from './server'

const network = (key: string) => networks.find((n) => n.key === key)

const BLANK: ShareTemplate = { caption: '', captions: {}, media: 'auto', custom_media: [] }

/** A template editor that keeps its own value, and reports each change. */
function renderEditor(nets: string[], start: Partial<ShareTemplate> = {}) {
  const changes = vi.fn()
  let latest: ShareTemplate = { ...BLANK, ...start }
  function Editor() {
    const [value, setValue] = useState<ShareTemplate>(latest)
    const [tab, setTab] = useState('all')
    return (
      <TemplateEditor
        value={value}
        onChange={(patch) => {
          changes(patch)
          setValue((v) => (latest = { ...v, ...patch }))
        }}
        nets={nets}
        tab={tab}
        setTab={setTab}
        placeholder="{title}"
        hint="Leave empty to use the default."
      />
    )
  }
  function WhenReady() {
    const { loading } = useStore()
    return loading ? null : <Editor />
  }
  render(<Providers><WhenReady /></Providers>)
  return { changes, value: () => latest }
}

describe('post field helpers', () => {
  it('lists the shared fields of all networks once, with the networks that have them', () => {
    const fields = tabFields(['bluesky', 'threads'], 'all', network)
    expect(fields.map((f) => [f.field.name, f.nets])).toEqual([
      ['format', ['bluesky']],
      ['first_comment', ['bluesky']],
    ])
    expect(tabFields(['bluesky'], 'bluesky', network).map((f) => f.field.name)).toEqual(['format', 'first_comment'])
    expect(tabFields(['threads'], 'threads', network)).toEqual([])
  })

  it('uses the network value, then the value for all networks, then the base', () => {
    const field = bluesky.post_fields[1]!
    expect(fieldValue({ bluesky: { first_comment: 'own' }, '*': { first_comment: 'all' } }, 'bluesky', field, 'base')).toBe('own')
    expect(fieldValue({ '*': { first_comment: 'all' } }, 'bluesky', field, 'base')).toBe('all')
    expect(fieldValue({}, 'bluesky', field, 'base')).toBe('base')
  })

  it('resolves the final values of each network', () => {
    expect(resolveFields({ '*': { format: 'link' } }, ['bluesky', 'threads'], network, (_n, f) => f.default)).toEqual({
      bluesky: { format: 'link', first_comment: '' },
      threads: {},
    })
  })

  it('finds networks that need media or a video', () => {
    const videoNet = { ...threads, key: 'video', media_required: 'video' as const }
    const look = (k: string) => (k === 'video' ? videoNet : network(k))
    expect(missingMedia(['threads', 'bluesky', 'video'], look, [])).toEqual({ media: ['threads'], video: ['video'] })
    expect(missingMedia(['threads', 'video'], look, [{ type: 'image' }])).toEqual({ media: [], video: ['video'] })
    expect(missingMedia(['threads', 'video'], look, [{ type: 'video' }])).toEqual({ media: [], video: [] })
  })
})

describe('TemplateEditor', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('edits the caption for all networks and adds tokens', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky', 'threads'])

    const caption = await screen.findByRole('textbox', { name: /^Caption/ })
    expect(caption).toHaveAttribute('placeholder', '{title}')
    await userEvent.click(screen.getByRole('button', { name: '{title}' }))
    await userEvent.click(screen.getByRole('button', { name: '{url}' }))

    expect(value().caption).toBe('{title}{url}')
  })

  it('keeps a network caption apart and removes it when it is empty', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky', 'threads'], { caption: '{title}' })

    await userEvent.click(await screen.findByRole('tab', { name: /Threads/ }))
    const own = screen.getByRole('textbox', { name: /^Caption for Threads/ })
    expect(own).toHaveAttribute('placeholder', '{title}')
    fireEvent.change(own, { target: { value: '{excerpt}' } })
    expect(value().captions).toEqual({ threads: '{excerpt}' })
    expect(screen.getByRole('tab', { name: /Threads/ })).toContainElement(screen.getByLabelText('Edited'))

    fireEvent.change(own, { target: { value: '  ' } })
    expect(value().captions).toEqual({})
  })

  it('warns when the template sends no media to a network that needs it', async () => {
    fakeServer(storeRoutes())
    renderEditor(['threads'])

    fireEvent.change(await screen.findByRole('combobox', { name: 'Media' }), { target: { value: 'none' } })

    expect(screen.getByRole('note')).toHaveTextContent('These networks need an image or a video: Threads. With no media, the plugin cannot share to them.')
  })

  it('removes a chosen image', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'], { media: 'custom', custom_media: [{ type: 'image', id: 4, url: 'a.jpg', alt: '' }] })

    await userEvent.click(await screen.findByRole('button', { name: 'Remove image 1' }))

    expect(value().custom_media).toEqual([])
  })

  it('sets a link template and a post field template with token chips', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'])

    fireEvent.change(await screen.findByRole('textbox', { name: /^Link/ }), { target: { value: '{field:shop_url}' } })
    expect(value().link).toBe('{field:shop_url}')

    await userEvent.click(screen.getByLabelText('First comment'))
    await userEvent.click(screen.getAllByRole('button', { name: '{site}' }).at(-1)!)
    expect(value().fields).toEqual({ '*': { first_comment: '{site}' } })

    fireEvent.change(screen.getByLabelText('Post format'), { target: { value: 'text' } })
    expect(value().fields).toEqual({ '*': { first_comment: '{site}', format: 'text' } })
  })
})

describe('FieldPreview', () => {
  afterEach(() => vi.unstubAllGlobals())

  function renderPreview(fields: Parameters<typeof FieldPreview>[0]['fields'], link?: string) {
    function WhenReady() {
      const { loading } = useStore()
      return loading ? null : <FieldPreview nets={['bluesky']} fields={fields} link={link} />
    }
    return render(<Providers><WhenReady /></Providers>)
  }

  it('shows the link and the fields that are not empty or the default', async () => {
    fakeServer(storeRoutes())
    renderPreview({ bluesky: { format: 'link', first_comment: 'Hi' } }, 'https://shop.example/s')

    expect(await screen.findByText('https://shop.example/s')).toBeInTheDocument()
    expect(screen.getByText('Link card only')).toBeInTheDocument()
    expect(screen.getByText('Hi')).toBeInTheDocument()
  })

  it('shows nothing when there is nothing to show', async () => {
    fakeServer(storeRoutes())
    const { container } = renderPreview({ bluesky: { format: 'auto', first_comment: '' } })

    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('.sint-field-preview')).toBeNull()
    expect(within(container).queryByText('Automatic')).toBeNull()
  })
})
