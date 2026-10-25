import { __, sprintf } from './i18n'

/** A modifier of a token, such as ['upper', ''] or ['words', '20']. */
export type Modifier = [name: string, arg: string]

/** A piece of a template: text, or a token with its modifiers. */
export type Piece = { type: 'text'; text: string } | { type: 'token'; name: string; mods: Modifier[]; raw: string }

/** Names of the modifiers, as backend/Templates/Modifiers.php has them. */
export const MODIFIERS = ['upper', 'lower', 'title', 'words', 'chars', 'default'] as const

/**
 * A token: {name} or {field:key}, with modifiers such as |upper or |words:20. A token in double
 * braces, such as {{title}}, is text. The same pattern as TemplateParser::TOKEN in PHP.
 */
const TOKEN = /\{\{((?:field:)?[A-Za-z0-9_-]+(?:\|[^{}\n]*)?)\}\}|\{(field:[A-Za-z0-9_-]+|[A-Za-z0-9_]+)((?:\|[a-z]+(?::[^{}|\n]{0,200})?)*)\}/g

/** The modifiers of a token, from the text after its name, such as '|upper|words:20'. */
export function parseModifiers(text: string): Modifier[] {
  return text
    .split('|')
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(':')
      return (at < 0 ? [part, ''] : [part.slice(0, at), part.slice(at + 1)]) as Modifier
    })
    .filter(([name]) => (MODIFIERS as readonly string[]).includes(name))
}

/**
 * The text and the tokens of a template.
 *
 * @param keepEscapes True to keep a token in double braces as it is typed ('{{title}}'), as the editor shows it.
 *                    False to give the text that the share shows ('{title}').
 */
export function parseTemplate(text: string, keepEscapes = false): Piece[] {
  const pieces: Piece[] = []
  let last = 0
  const push = (t: string) => {
    if (!t) return
    const prev = pieces[pieces.length - 1]
    if (prev?.type === 'text') prev.text += t
    else pieces.push({ type: 'text', text: t })
  }
  for (const m of text.matchAll(TOKEN)) {
    push(text.slice(last, m.index))
    if (m[1] !== undefined) push(keepEscapes ? m[0] : `{${m[1]}}`)
    else pieces.push({ type: 'token', name: m[2]!, mods: parseModifiers(m[3] ?? ''), raw: m[0] })
    last = m.index! + m[0].length
  }
  push(text.slice(last))
  return pieces
}

/** A token as template text, such as '{title|upper|words:20}'. */
export function stringifyToken(name: string, mods: Modifier[]): string {
  return `{${name}${mods.map(([n, a]) => `|${n}${a !== '' ? `:${a.replace(/[{}|\n]/g, '')}` : ''}`).join('')}}`
}

/** The value of a token with its modifiers applied, as Modifiers::apply() does in PHP. */
export function applyModifiers(value: string, mods: Modifier[]): string {
  for (const [name, arg] of mods) {
    const n = Math.max(1, Math.min(1000, parseInt(arg, 10) || 1))
    if (name === 'upper') value = value.toUpperCase()
    else if (name === 'lower') value = value.toLowerCase()
    else if (name === 'title') value = value.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, s: string, c: string) => s + c.toUpperCase())
    else if (name === 'words') {
      const words = value.trim().split(/\s+/).filter(Boolean)
      if (words.length > n) value = words.slice(0, n).join(' ').replace(/[\s,.;:]+$/, '') + '…'
    } else if (name === 'chars' && [...value].length > n) {
      let cut = [...value].slice(0, Math.max(1, n - 1)).join('')
      const space = cut.lastIndexOf(' ')
      if (space > 0) cut = cut.slice(0, space)
      value = cut.replace(/[\s,.;:]+$/, '') + '…'
    } else if (name === 'default' && value.trim() === '') value = arg
  }
  return value
}

/** The label of a token in a chip, such as 'Title' for {title} or the field label for {field:key}. */
export function tokenLabel(name: string, fields: { key: string; label: string }[] = []): string {
  if (name.startsWith('field:')) {
    const key = name.slice(6)
    return fields.find((f) => f.key === key)?.label ?? key
  }
  const labels: Record<string, string> = {
    title: __('Title', 'social-integrations'),
    excerpt: __('Excerpt', 'social-integrations'),
    url: __('Link', 'social-integrations'),
    tags: __('Tags', 'social-integrations'),
    author: __('Author', 'social-integrations'),
    site: __('Site name', 'social-integrations'),
    text: __('Post text', 'social-integrations'),
    price: __('Price', 'social-integrations'),
    regular_price: __('Regular price', 'social-integrations'),
    sale_price: __('Sale price', 'social-integrations'),
  }
  return labels[name] ?? name
}

/** Short texts for the modifiers of a chip, such as ['UPPERCASE', '20 words']. */
export function modifierBadges(mods: Modifier[]): string[] {
  return mods.map(([name, arg]) => {
    if (name === 'upper') return __('UPPERCASE', 'social-integrations')
    if (name === 'lower') return __('lowercase', 'social-integrations')
    if (name === 'title') return __('Title Case', 'social-integrations')
    if (name === 'words') return sprintf(__('%s words', 'social-integrations'), arg)
    if (name === 'chars') return sprintf(__('%s characters', 'social-integrations'), arg)
    return sprintf(__('if empty: %s', 'social-integrations'), arg)
  })
}
