import { describe, expect, it } from 'vitest'
import { fmtDate, initials, localToUtc, siteParts, utcToLocal } from '../../frontend/admin/lib/format'

describe('format', () => {
  it('reads date parts in the site time zone', () => {
    // 20:30 UTC is 02:30 on the next day at UTC+6.
    expect(siteParts(new Date('2026-10-24T20:30:00Z'))).toEqual({ y: 2026, m: 10, d: 25, h: 2, min: 30, key: '2026-10-25' })
  })

  it('shows a date in the site time zone', () => {
    expect(fmtDate('2026-12-31T20:00:00Z')).toContain('2027')
  })

  it('converts between UTC and the datetime-local value of the site', () => {
    expect(utcToLocal('2026-10-24T20:30:00Z')).toBe('2026-10-25T02:30')
    expect(localToUtc('2026-10-25T02:30')).toBe('2026-10-24T20:30:00.000Z')
    expect(localToUtc(utcToLocal('2026-03-01T00:00:00.000Z'))).toBe('2026-03-01T00:00:00.000Z')
  })

  it.each([
    ['Jane Doe', 'JD'],
    ['jane.doe@example.com', 'JD'],
    ['@handle', 'H'],
    ['one two three', 'OT'],
    ['', '?'],
  ])('makes initials of %j', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})
