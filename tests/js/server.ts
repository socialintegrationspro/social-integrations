import { vi } from 'vitest'

/** One request that the app sent to the REST API. */
export interface Call {
  method: string
  /** The route without the namespace and the query, such as 'queue/7/retry'. */
  path: string
  query: URLSearchParams
  body: unknown
}

/** An answer with a status other than 200, or with headers. */
export interface Reply {
  __reply: true
  status: number
  body: unknown
  headers?: Record<string, string>
}

export const reply = (status: number, body: unknown, headers?: Record<string, string>): Reply => ({ __reply: true, status, body, headers })

/** An error answer as the WordPress REST API sends it. */
export const fail = (message: string, status = 500, code = 'error') => reply(status, { code, message })

type Handler = unknown | ((call: Call) => unknown)

const BASE = '/wp-json/sint/v1/'

/**
 * A fake REST API. Each key is 'METHOD route', and ':name' matches one path part, such as
 * 'POST queue/:id/retry'. A handler is the answer, or a function that gives the answer.
 * A request without a route gets a 404. The app's fetch() calls go here.
 */
export function fakeServer(routes: Record<string, Handler> = {}) {
  const calls: Call[] = []
  const table = { ...routes }

  const match = (method: string, path: string): Handler | undefined => {
    for (const [key, handler] of Object.entries(table)) {
      const [m, route] = key.split(' ') as [string, string]
      if (m !== method) continue
      const re = new RegExp('^' + route.replace(/:[a-z_]+/gi, '[^/]+') + '$')
      if (re.test(path)) return handler
    }
    return undefined
  }

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost')
    const route = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname
    const method = init.method ?? 'GET'
    const call: Call = { method, path: route, query: url.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    const handler = match(method, route)
    if (handler === undefined) return new Response(JSON.stringify({ code: 'rest_no_route', message: `No route ${method} ${route}` }), { status: 404 })
    const out = typeof handler === 'function' ? await (handler as (c: Call) => unknown)(call) : handler
    if (out && typeof out === 'object' && (out as Reply).__reply) {
      const r = out as Reply
      return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers })
    }
    return new Response(JSON.stringify(out ?? null), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  return {
    calls,
    /** Adds or replaces routes. */
    on(more: Record<string, Handler>) {
      Object.assign(table, more)
    },
    /** The requests to a route, such as 'POST settings'. */
    to(key: string): Call[] {
      const [m, route] = key.split(' ') as [string, string]
      const re = new RegExp('^' + route.replace(/:[a-z_]+/gi, '[^/]+') + '$')
      return calls.filter((c) => c.method === m && re.test(c.path))
    },
  }
}

/** A promise that the test resolves, for a request that must stay open. */
export function deferred<T = unknown>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
