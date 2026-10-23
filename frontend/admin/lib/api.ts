import { config } from './config'

class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message)
  }
}

export interface ApiResponse<T> {
  data: T
  total: number
  totalPages: number
}

/**
 * A client for one REST namespace. `base` is the namespace URL, such as '/wp-json/sint/v1/'.
 * Other plugins get it through window.sintApp for their own namespace.
 */
export function createApi(base: string, nonce: string) {
  /**
   * REST URL for a path such as 'content?type=post'. With plain permalinks the base is
   * '/?rest_route=/sint/v1/', so the path's own query must join with '&', not a second '?'.
   */
  const restUrl = (path: string): string => {
    const [route, qs] = path.replace(/^\//, '').split('?')
    const url = base + route
    return qs ? url + (url.includes('?') ? '&' : '?') + qs : url
  }

  const request = async <T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> => {
    const res = await fetch(restUrl(path), {
      method,
      credentials: 'same-origin',
      headers: { 'X-WP-Nonce': nonce, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new ApiError(json?.message ?? `Request failed (${res.status})`, json?.code ?? 'error', res.status)
    }
    return {
      data: json as T,
      total: Number(res.headers.get('X-WP-Total') ?? 0),
      totalPages: Number(res.headers.get('X-WP-TotalPages') ?? 0),
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
  }
}

export const api = createApi(config.restUrl, config.nonce)

export const query = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
