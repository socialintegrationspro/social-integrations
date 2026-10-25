import { describe, expect, it } from 'vitest'
import { checkTokens } from '../../frontend/admin/lib/tokens'

const TOKENS = ['{title}', '{excerpt}', '{url}', '{tags}', '{price}']

describe('checkTokens', () => {
  it('finds no issue in a template with known tokens and fields', () => {
    expect(checkTokens('{title} {price}\n{field:buy_url}', TOKENS, ['buy_url'])).toEqual([])
  })

  it('names a field that the posts do not have, with the closest field', () => {
    expect(checkTokens('{title} {field:buy_ul}', TOKENS, ['buy_url', 'venue'])).toEqual([{ token: '{field:buy_ul}', field: true, suggestion: '{field:buy_url}' }])
  })

  it('names an unknown token, with the closest token', () => {
    expect(checkTokens('{titel} and {titel}', TOKENS, null)).toEqual([{ token: '{titel}', field: false, suggestion: '{title}' }])
  })

  it('gives no suggestion when nothing is near', () => {
    expect(checkTokens('{field:zzzzzz} {completely}', TOKENS, ['buy_url'])).toEqual([
      { token: '{field:zzzzzz}', field: true, suggestion: undefined },
      { token: '{completely}', field: false, suggestion: undefined },
    ])
  })

  it('does not check fields while they are not known', () => {
    expect(checkTokens('{field:anything}', TOKENS, null)).toEqual([])
  })

  it('ignores text in braces with spaces, and a brace without its pair', () => {
    expect(checkTokens('Save { 20% } today {title', TOKENS, [])).toEqual([])
  })
})
