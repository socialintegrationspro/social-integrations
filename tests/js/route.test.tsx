import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRoute } from '../../frontend/admin/lib/store'

describe('useRoute', () => {
  it('opens the dashboard when there is no hash', () => {
    const { result } = renderHook(() => useRoute())
    expect(result.current.path).toBe('dashboard')
  })

  it('reads the path and the query from the hash', () => {
    window.location.hash = '#/accounts?connected=bluesky'
    const { result } = renderHook(() => useRoute())

    expect(result.current.path).toBe('accounts')
    expect(result.current.params.get('connected')).toBe('bluesky')
  })

  it('follows a change of the hash', async () => {
    const { result } = renderHook(() => useRoute())

    await act(async () => {
      result.current.go('/calendar')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(window.location.hash).toBe('#/calendar')
    expect(result.current.path).toBe('calendar')
  })
})
