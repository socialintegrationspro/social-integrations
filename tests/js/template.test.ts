import { describe, expect, it } from 'vitest'
import { applyModifiers, modifierBadges, parseModifiers, parseTemplate, stringifyToken } from '../../frontend/admin/lib/template'

describe('template', () => {
  it('splits a template into text and tokens with modifiers', () => {
    expect(parseTemplate('Hi {title|upper}, {field:venue|default:Online now}!')).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'token', name: 'title', mods: [['upper', '']], raw: '{title|upper}' },
      { type: 'text', text: ', ' },
      { type: 'token', name: 'field:venue', mods: [['default', 'Online now']], raw: '{field:venue|default:Online now}' },
      { type: 'text', text: '!' },
    ])
  })

  it('reads a token in double braces as text', () => {
    expect(parseTemplate('Type {{title}} here')).toEqual([{ type: 'text', text: 'Type {title} here' }])
    expect(parseTemplate('Type {{title}} here', true)).toEqual([{ type: 'text', text: 'Type {{title}} here' }])
  })

  it('keeps braces with spaces and a brace without its pair as text', () => {
    expect(parseTemplate('Save { 20% } {title')).toEqual([{ type: 'text', text: 'Save { 20% } {title' }])
  })

  it('drops unknown modifiers and writes a token back', () => {
    expect(parseModifiers('|upper|shout|words:20')).toEqual([['upper', ''], ['words', '20']])
    expect(stringifyToken('excerpt', [['upper', ''], ['words', '20'], ['default', 'A {b} | c']])).toBe('{excerpt|upper|words:20|default:A b  c}')
  })

  it('applies modifiers as the PHP code does', () => {
    expect(applyModifiers('Trail runner', [['upper', '']])).toBe('TRAIL RUNNER')
    expect(applyModifiers('trail runner', [['title', '']])).toBe('Trail Runner')
    expect(applyModifiers('Light trail shoes, with a grippy sole', [['words', '3']])).toBe('Light trail shoes…')
    expect(applyModifiers('Light trail shoes', [['chars', '14']])).toBe('Light trail…')
    expect(applyModifiers('', [['upper', ''], ['default', 'TBA']])).toBe('TBA')
  })

  it('gives the badges of a chip', () => {
    expect(modifierBadges([['upper', ''], ['words', '20'], ['default', 'Ask us']])).toEqual(['UPPERCASE', '20 words', 'if empty: Ask us'])
  })
})
