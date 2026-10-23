import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiResponse } from './api'

// Extension points for other plugins, through wp.hooks. A plugin adds its script
// to the `sint/admin_script_dependencies` PHP filter so its filters are in place
// before this app renders.
export function applyFilters<T>(name: string, value: T, ...args: unknown[]): T {
  const hooks = window.wp?.hooks
  return hooks ? (hooks.applyFilters(name, value, ...args) as T) : value
}

type Client = { get: <R>(path: string) => Promise<ApiResponse<R>> }

export interface Fetched<T> {
  /** The answer for this path, or the last answer of an other path while this path loads. */
  data: T | null
  /** True when `data` is the answer of an other path. */
  stale: boolean
  loading: boolean
  /** The message of the last request that failed, or ''. */
  error: string
  reload: () => Promise<void>
  /** Changes the data now, before the server confirms a change. Call reload() after it. */
  mutate: (next: T | ((current: T | null) => T)) => void
}

// The last answer of each path, for each client. A screen that opens again shows it at once
// and loads again behind it.
const caches = new WeakMap<Client, Map<string, unknown>>()
const CACHE_MAX = 40

function cacheOf(client: Client): Map<string, unknown> {
  let cache = caches.get(client)
  if (!cache) caches.set(client, (cache = new Map()))
  return cache
}

function remember(cache: Map<string, unknown>, path: string, data: unknown) {
  cache.delete(path)
  cache.set(path, data)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
}

/**
 * Data from a GET route. A new `path` loads again, and `null` loads nothing.
 * Only the answer to the newest request is kept, so a slow old answer cannot replace a new one.
 * Other plugins give their own client from `createApi`. The client must not change between renders.
 */
export function useFetch<T>(path: string | null, client: Client = api): Fetched<T> {
  const cache = cacheOf(client)
  const [state, setState] = useState(() => ({
    path,
    data: (path !== null ? cache.get(path) ?? null : null) as T | null,
    loading: path !== null,
    error: '',
  }))
  const request = useRef(0)

  const reload = useCallback(async () => {
    const id = ++request.current
    if (path === null) return setState((s) => ({ ...s, path, loading: false }))
    setState((s) => ({ ...s, loading: true }))
    try {
      const r = await client.get<T>(path)
      if (id !== request.current) return
      remember(cache, path, r.data)
      setState({ path, data: r.data, loading: false, error: '' })
    } catch (e) {
      if (id !== request.current) return
      setState((s) => ({ path, data: s.path === path ? s.data : null, loading: false, error: (e as Error).message }))
    }
  }, [path, client])

  useEffect(() => {
    reload()
    // An answer that comes after the path changes or the screen closes is not used.
    return () => {
      request.current++
    }
  }, [reload])

  const mutate = useCallback(
    (next: T | ((current: T | null) => T)) => {
      if (path === null) return
      setState((s) => {
        const current = s.path === path ? s.data : ((cache.get(path) ?? null) as T | null)
        const data = typeof next === 'function' ? (next as (c: T | null) => T)(current) : next
        remember(cache, path, data)
        return { ...s, path, data }
      })
    },
    [path, client],
  )

  // Until this path answers, show its cached answer, or else the last answer of the old path.
  const cached = path !== null && state.path !== path && cache.has(path)
  const data = cached ? (cache.get(path) as T) : state.data
  return { data, stale: !cached && state.path !== path, loading: state.loading || state.path !== path, error: state.path === path ? state.error : '', reload, mutate }
}
