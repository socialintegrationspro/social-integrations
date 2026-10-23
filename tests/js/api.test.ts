import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApi, query } from '../../frontend/admin/lib/api'

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? 'not json' : JSON.stringify(body), { status, headers })

describe('api', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('sends the nonce and reads the paging headers', async () => {
    fetchMock.mockResolvedValue(answer(200, [{ id: 1 }], { 'X-WP-Total': '12', 'X-WP-TotalPages': '2' }))

    const r = await createApi('/wp-json/sint/v1/', 'n1').get('/queue?page=2')

    expect(fetchMock).toHaveBeenCalledWith('/wp-json/sint/v1/queue?page=2', expect.objectContaining({ method: 'GET', credentials: 'same-origin', headers: { 'X-WP-Nonce': 'n1' } }))
    expect(r).toEqual({ data: [{ id: 1 }], total: 12, totalPages: 2 })
  })

  it('joins the query with & for plain permalinks', async () => {
    fetchMock.mockResolvedValue(answer(200, {}))

    await createApi('/?rest_route=/sint/v1/', 'n').get('content?type=post')

    expect(fetchMock.mock.calls[0]![0]).toBe('/?rest_route=/sint/v1/content&type=post')
  })

  it('sends a JSON body', async () => {
    fetchMock.mockResolvedValue(answer(200, { ok: true }))

    await createApi('/b/', 'n').post('settings', { a: 1 })

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.headers).toEqual({ 'X-WP-Nonce': 'n', 'Content-Type': 'application/json' })
  })

  it('throws the message and the code of the server', async () => {
    fetchMock.mockResolvedValue(answer(403, { code: 'rest_forbidden', message: 'No access.' }))

    await expect(createApi('/b/', 'n').del('accounts/1')).rejects.toMatchObject({ message: 'No access.', code: 'rest_forbidden', status: 403 })
  })

  it('throws a general message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(answer(502, undefined))

    await expect(createApi('/b/', 'n').get('x')).rejects.toMatchObject({ message: 'Request failed (502)', code: 'error' })
  })

  it('builds a query string without empty values', () => {
    expect(query({ status: 'failed', page: 2, q: '', network: undefined, s: 'a b&c' })).toBe('status=failed&page=2&s=a%20b%26c')
  })
})
