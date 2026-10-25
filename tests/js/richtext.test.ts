import { describe, expect, it } from 'vitest'
import { hasMarks, parseRich, plainText, toUnicode } from '../../frontend/admin/lib/richtext'
import { measure } from '../../frontend/admin/pages/composer/helpers'
import { networks } from './fixtures'

// The same cases as tests/php/Unit/RichTextTest.php, so the editor and the server read marks the same way.
describe('richtext', () => {
  it('reads marks and ends them at the line end', () => {
    expect(parseRich('{b}Sale {i}now{/i}{/b} today\n{b}open')).toEqual([
      { text: 'Sale ', marks: ['b'] },
      { text: 'now', marks: ['b', 'i'] },
      { text: ' today', marks: [] },
      { text: '\n', marks: [] },
      { text: 'open', marks: ['b'] },
    ])
  })

  it('reads a mark in double braces as text', () => {
    expect(plainText('Use {{b}} for bold')).toBe('Use {b} for bold')
    expect(hasMarks('Use {{b}} for bold')).toBe(false)
    expect(hasMarks('A {b}bold{/b} word')).toBe(true)
  })

  it('converts to Unicode letters and keeps links, hashtags and mentions', () => {
    expect(toUnicode('{b}Sale 2 #Shoes @shop https://a.example/x{/b} done')).toBe('\u{1D5E6}\u{1D5EE}\u{1D5F9}\u{1D5F2} \u{1D7EE} #Shoes @shop https://a.example/x done')
    expect(toUnicode('{i}a{/i}')).toBe('\u{1D622}')
    expect(toUnicode('{b}{i}a{/i}{/b}')).toBe('\u{1D656}')
    expect(toUnicode('{m}a1{/m}')).toBe('\u{1D68A}\u{1D7F7}')
    expect(toUnicode('{u}a b{/u}')).toBe('a̲ b̲')
  })

  it('counts the text that a network gets', () => {
    const plain = { ...networks[0]!, url_length: 0, text_format: 'unicode' as const }
    const real = { ...plain, text_format: 'own' as const }
    expect(measure('{b}Sale{/b}', plain)).toBe(4)
    expect(measure('{u}Sale{/u}', plain)).toBe(8)
    expect(measure('{u}Sale{/u}', real)).toBe(4)
  })
})
