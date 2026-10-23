import { afterEach, describe, expect, it } from 'vitest'
import { __, sprintf } from '../../frontend/admin/lib/i18n'

describe('i18n', () => {
  afterEach(() => {
    delete window.wp
  })

  it('returns the text when wp.i18n is not loaded', () => {
    expect(__('Share', 'social-integrations')).toBe('Share')
  })

  it('uses wp.i18n when it is loaded', () => {
    window.wp = { i18n: { __: (text, domain) => `${domain}:${text}` } }
    expect(__('Share', 'social-integrations')).toBe('social-integrations:Share')
  })

  it('fills placeholders in order and by position', () => {
    expect(sprintf('%s of %d', 'a', 3)).toBe('a of 3')
    expect(sprintf('%2$s then %1$s', 'first', 'second')).toBe('second then first')
    expect(sprintf('%s and %s', 'one')).toBe('one and ')
  })
})
