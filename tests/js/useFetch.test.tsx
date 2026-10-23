import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyFilters, useFetch } from '../../frontend/admin/lib/hooks'
import type { ApiResponse } from '../../frontend/admin/lib/api'

/** A client whose answers the test sends, one by one. */
function deferredClient() {
  const pending: { path: string; resolve: (v: unknown) => void; reject: (e: Error) => void }[] = []
  const client = {
    get: <R,>(path: string) =>
      new Promise<ApiResponse<R>>((resolve, reject) => {
        pending.push({ path, resolve: (data) => resolve({ data: data as R, total: 0, totalPages: 0 }), reject })
      }),
  }
  return { client, pending }
}

describe('useFetch', () => {
  afterEach(() => {
    delete window.wp
  })

  it('loads the data of a path', async () => {
    const { client, pending } = deferredClient()
    const { result } = renderHook(() => useFetch<number[]>('items', client))

    expect(result.current).toMatchObject({ data: null, loading: true, stale: false, error: '' })
    await act(async () => pending[0]!.resolve([1, 2]))

    expect(result.current).toMatchObject({ data: [1, 2], loading: false, error: '' })
  })

  it('loads nothing for a null path', () => {
    const { client, pending } = deferredClient()
    const { result } = renderHook(() => useFetch<string>(null, client))

    expect(pending).toHaveLength(0)
    expect(result.current).toMatchObject({ data: null, loading: false, stale: false })
  })

  it('keeps only the answer of the newest path', async () => {
    const { client, pending } = deferredClient()
    const { result, rerender } = renderHook(({ path }) => useFetch<string>(path, client), { initialProps: { path: 'a' } })

    rerender({ path: 'b' })
    await act(async () => pending[1]!.resolve('B'))
    await act(async () => pending[0]!.resolve('A, too late'))

    expect(result.current.data).toBe('B')
  })

  it('shows the old data as stale while a new path loads, then the cache at once', async () => {
    const { client, pending } = deferredClient()
    const { result, rerender } = renderHook(({ path }) => useFetch<string>(path, client), { initialProps: { path: 'one' } })
    await act(async () => pending[0]!.resolve('ONE'))

    rerender({ path: 'two' })
    expect(result.current).toMatchObject({ data: 'ONE', stale: true, loading: true })
    await act(async () => pending[1]!.resolve('TWO'))

    rerender({ path: 'one' })
    expect(result.current).toMatchObject({ data: 'ONE', stale: false, loading: true })
  })

  it('keeps the data and shows the error when a reload fails', async () => {
    const { client, pending } = deferredClient()
    const { result } = renderHook(() => useFetch<string>('e', client))
    await act(async () => pending[0]!.resolve('OK'))

    act(() => void result.current.reload())
    await act(async () => pending[1]!.reject(new Error('Offline')))

    expect(result.current).toMatchObject({ data: 'OK', error: 'Offline', loading: false })
  })

  it('changes the data at once with mutate', async () => {
    const { client, pending } = deferredClient()
    const { result } = renderHook(() => useFetch<number[]>('m', client))
    await act(async () => pending[0]!.resolve([1]))

    act(() => result.current.mutate((current) => [...(current ?? []), 2]))

    expect(result.current.data).toEqual([1, 2])
  })

  it('applies filters of other plugins through wp.hooks', () => {
    expect(applyFilters('sint.routes', ['a'])).toEqual(['a'])

    const applyFiltersMock = vi.fn((_name: string, value: unknown) => [...(value as string[]), 'b'])
    window.wp = { hooks: { applyFilters: applyFiltersMock, doAction: vi.fn() } }

    expect(applyFilters('sint.routes', ['a'], 'extra')).toEqual(['a', 'b'])
    expect(applyFiltersMock).toHaveBeenCalledWith('sint.routes', ['a'], 'extra')
  })
})
