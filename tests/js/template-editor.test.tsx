import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { $createTextNode, $getRoot, type ParagraphNode, type TextNode } from 'lexical'
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
import { captionValue, findCaption, typeCaption } from './caption'

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

  it('edits the caption for all networks and adds tokens as chips at the caret', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky', 'threads'])

    await findCaption(/^Caption/)
    expect(document.querySelector('.sint-cap-ph')).toHaveTextContent('{title}')
    await userEvent.click(screen.getByRole('button', { name: '{title}' }))
    await userEvent.click(screen.getByRole('button', { name: '{url}' }))

    expect(value().caption).toBe('{title}{url}')
    expect(screen.getByRole('button', { name: 'Title token. Select to change.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link token. Select to change.' })).toBeInTheDocument()
  })

  it('turns a typed token into a chip, and keeps an unknown one as text', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'])

    const caption = await findCaption(/^Caption/)
    await typeCaption(caption, 'New: {title} and {titel}')

    expect(value().caption).toBe('New: {title} and {titel}')
    expect(captionValue(caption)).toBe('New: {title} and {titel}')
    expect(screen.getByRole('button', { name: 'Title token. Select to change.' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /titel token/ })).toBeNull()
    expect(screen.getByText('{titel} is not a token. The share shows it as text.')).toBeInTheDocument()
  })

  it('sets the letter case, the length and a text for an empty value from the chip menu', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'], { caption: '{excerpt}' })

    await findCaption(/^Caption/)
    await userEvent.click(screen.getByRole('button', { name: 'Excerpt token. Select to change.' }))
    const menu = screen.getByRole('group', { name: 'Change the Excerpt token' })
    await userEvent.click(within(menu).getByRole('button', { name: 'UPPERCASE' }))
    await userEvent.click(within(menu).getByRole('button', { name: '20 words' }))
    fireEvent.change(within(menu).getByRole('textbox', { name: 'Text if empty' }), { target: { value: 'Ask us {now}' } })

    await waitFor(() => expect(value().caption).toBe('{excerpt|upper|words:20|default:Ask us now}'))
    expect(screen.getByRole('button', { name: 'Excerpt, UPPERCASE, 20 words, if empty: Ask us now token. Select to change.' })).toBeInTheDocument()

    await userEvent.click(within(menu).getByRole('button', { name: 'As written' }))
    await userEvent.click(within(menu).getByRole('button', { name: 'No limit' }))
    expect(value().caption).toBe('{excerpt|default:Ask us now}')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Change the Excerpt token' })).toBeNull()
  })

  it('shows the styles of a caption and makes selected text bold', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'], { caption: '{i}New{/i} sale {title}' })

    const caption = await findCaption(/^Caption/)
    expect(caption.querySelector('.sint-t-i')).toHaveTextContent('New')
    expect(screen.getByText(/Text styles use special characters on most networks/)).toBeInTheDocument()

    // Select "sale", then select Bold.
    await act(async () => {
      caption.__lexicalEditor!.update(() => {
        const sale = $getRoot().getFirstDescendant()!.getNextSibling() as TextNode
        sale.select(1, 5)
      }, { discrete: true })
    })
    const tools = within(caption.closest('.sint-cap') as HTMLElement)
    await userEvent.click(tools.getByRole('button', { name: 'Bold' }))

    await waitFor(() => expect(value().caption).toBe('{i}New{/i} {b}sale{/b} {title}'))
    expect(tools.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('writes a template with the AI menu and shows a warning for a removed token', async () => {
    window.sintConfig!.ai.ready = true
    const server = fakeServer({ ...storeRoutes(), 'POST ai/caption': { caption: 'New {title}', warnings: ['The AI removed {url}. Add it again if the caption needs it.'] } })
    const { value } = renderEditor(['bluesky'], { caption: '{title} {url}' })

    await findCaption(/^Caption/)
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'AI' })).getByRole('menuitem', { name: /^Make shorter/ }))

    await waitFor(() => expect(value().caption).toBe('New {title}'))
    expect(server.to('POST ai/caption')[0]!.body).toMatchObject({ mode: 'shorter', text: '{title} {url}', template: true, limit: 300 })
    expect(await screen.findByText('The AI removed {url}. Add it again if the caption needs it.')).toBeInTheDocument()
    window.sintConfig!.ai.ready = false
  })

  it('opens a list of tokens when the user types "{" and inserts the one selected as a chip', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'])

    const caption = await findCaption(/^Caption/)
    await act(async () => {
      caption.__lexicalEditor!.update(() => {
        const p = $getRoot().getFirstChild() as ParagraphNode
        p.clear()
        p.append($createTextNode('Hi {ti'))
        p.selectEnd()
      }, { discrete: true })
    })

    const list = await screen.findByRole('listbox', { name: 'Tokens' })
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Title{title}'])
    await userEvent.click(within(list).getByRole('option', { name: /Title/ }))

    await waitFor(() => expect(value().caption).toBe('Hi {title}'))
    expect(screen.queryByRole('listbox', { name: 'Tokens' })).toBeNull()
  })

  it('makes a chip bold with the text around it, and keeps the style of a saved chip', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'], { caption: '{i}{excerpt}{/i} and {title} sale' })

    const caption = await findCaption(/^Caption/)
    expect(screen.getByRole('button', { name: 'Excerpt, italic token. Select to change.' })).toBeInTheDocument()

    await act(async () => {
      caption.__lexicalEditor!.update(() => {
        const p = $getRoot().getFirstChild() as ParagraphNode
        p.select(2, p.getChildrenSize())
      }, { discrete: true })
    })
    await userEvent.click(within(caption.closest('.sint-cap') as HTMLElement).getByRole('button', { name: 'Bold' }))

    await waitFor(() => expect(value().caption).toBe('{i}{excerpt}{/i} and {b}{title}{/b}{b} sale{/b}'))
    expect(screen.getByRole('button', { name: 'Title, bold token. Select to change.' })).toBeInTheDocument()
  })

  it('removes a token from its menu', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky'], { caption: '{title} now' })

    await findCaption(/^Caption/)
    await userEvent.click(screen.getByRole('button', { name: 'Title token. Select to change.' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove token' }))

    expect(value().caption).toBe(' now')
  })

  it('keeps a network caption apart and removes it when it is empty', async () => {
    fakeServer(storeRoutes())
    const { value } = renderEditor(['bluesky', 'threads'], { caption: '{title}' })

    await userEvent.click(await screen.findByRole('tab', { name: /Threads/ }))
    const own = await findCaption(/^Caption for Threads/)
    expect(document.querySelector('.sint-cap-ph')).toHaveTextContent('{title}')
    await typeCaption(own, '{excerpt}')
    expect(value().captions).toEqual({ threads: '{excerpt}' })
    expect(screen.getByRole('tab', { name: /Threads/ })).toContainElement(screen.getByLabelText('Edited'))

    await typeCaption(own, '  ')
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

    // The options for each network are closed until the user opens them.
    expect(screen.queryByLabelText('Post format')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^Options for each network/ }))
    // The first comment is a chip field: a token goes in as a chip.
    const comment = await findCaption('First comment')
    await userEvent.click(comment)
    await userEvent.click(screen.getAllByRole('button', { name: '{site}' }).at(-1)!)
    await waitFor(() => expect(value().fields).toEqual({ '*': { first_comment: '{site}' } }))
    expect(within(comment).getByRole('button', { name: 'Site name token. Select to change.' })).toBeInTheDocument()

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
