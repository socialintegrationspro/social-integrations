import { render, renderHook, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Menu, Pagination, Segmented, Toggle, usePaged } from '../../frontend/admin/components/ui'

describe('ui', () => {
  it('Toggle is a switch that flips its value', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Auto-post" />)

    const toggle = screen.getByRole('switch', { name: 'Auto-post' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle)

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('Segmented marks the selected option', async () => {
    function View() {
      const [value, setValue] = useState<'week' | 'list'>('week')
      return <Segmented value={value} onChange={setValue} label="View" options={[{ value: 'week', label: 'Week' }, { value: 'list', label: 'List' }]} />
    }
    render(<View />)

    await userEvent.click(screen.getByRole('button', { name: 'List' }))

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Menu opens, moves with arrow keys and closes with Escape', async () => {
    const onEdit = vi.fn()
    render(
      <Menu
        label="More actions"
        items={[
          { key: 'edit', label: 'Edit', onSelect: onEdit },
          { key: 'off', label: 'Disabled', disabled: true, onSelect: vi.fn() },
          { key: 'delete', label: 'Delete', danger: true, onSelect: vi.fn() },
        ]}
      />,
    )
    const button = screen.getByRole('button', { name: 'More actions' })

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()

    await userEvent.click(button)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('Menu stays open when an item asks for a second click', async () => {
    render(<Menu label="More" items={[{ key: 'delete', label: 'Delete', onSelect: () => true }]} />)

    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('usePaged splits a list and goes back to page 1 when the filter changes', () => {
    window.localStorage.clear()
    const items = Array.from({ length: 25 }, (_, i) => i)
    const { result, rerender } = renderHook(({ reset }) => usePaged(items, reset), { initialProps: { reset: 'all' } })

    expect(result.current.rows).toEqual(items.slice(0, 10))
    expect(result.current.pager).toMatchObject({ page: 1, pages: 3, size: 10, total: 25 })

    act(() => result.current.pager.setPage(3))
    expect(result.current.rows).toEqual([20, 21, 22, 23, 24])

    rerender({ reset: 'failed' })
    expect(result.current.pager.page).toBe(1)

    act(() => result.current.pager.setSize(20))
    expect(window.localStorage.getItem('sint-page-size')).toBe('20')
    expect(result.current.pager.pages).toBe(2)
  })

  it('Pagination shows nothing for one short page', () => {
    const { container } = render(<Pagination page={1} pages={1} size={10} total={8} setPage={vi.fn()} setSize={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('Pagination moves between pages', async () => {
    const setPage = vi.fn()
    render(<Pagination page={1} pages={3} size={10} total={25} setPage={setPage} setSize={vi.fn()} />)

    expect(screen.getByText('1–10 of 25')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(setPage).toHaveBeenCalledWith(2)
  })
})
