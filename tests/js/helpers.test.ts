import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultLocal, hostOf, measure, timePresets } from '../../frontend/admin/pages/composer/helpers'
import type { Network } from '../../frontend/admin/lib/types'

const net = (url_length: number) => ({ url_length }) as Network

describe('composer helpers', () => {
  afterEach(() => vi.useRealTimers())

  it('counts characters, not UTF-16 units', () => {
    expect(measure('héllo 👋')).toBe(7)
  })

  it('counts each link as the fixed length of the network', () => {
    const text = 'Read https://example.com/a/very/long/path?x=1 now'
    expect(measure(text, net(23))).toBe('Read '.length + 23 + ' now'.length)
    expect(measure(text, net(0))).toBe(text.length)
  })

  it('gives the host of a URL, or the text when it is not a URL', () => {
    expect(hostOf('https://www.example.com/a?b')).toBe('www.example.com')
    expect(hostOf('not a url')).toBe('not a url')
  })

  it('suggests times in the site time zone', () => {
    vi.useFakeTimers()
    // Friday 2026-10-23 20:10 UTC is Saturday 02:10 at UTC+6. The week starts on Monday.
    vi.setSystemTime(new Date('2026-10-23T20:10:00Z'))

    expect(defaultLocal()).toBe('2026-10-24T03:00')
    expect(timePresets('').map((p) => p.value)).toEqual(['2026-10-24T03:00', '2026-10-25T09:00', '2026-10-26T09:00'])
    expect(timePresets('2026-11-01T10:00')).toHaveLength(4)
  })

  it('moves "next week" a full week when today is the first day', () => {
    vi.useFakeTimers()
    // Monday 2026-10-26 08:00 at UTC+6.
    vi.setSystemTime(new Date('2026-10-26T02:00:00Z'))

    expect(timePresets('')[2]!.value).toBe('2026-11-02T09:00')
  })
})
