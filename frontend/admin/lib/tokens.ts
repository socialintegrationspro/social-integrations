import { MARKS } from './richtext'
import { parseTemplate, stringifyToken } from './template'

/** A token in a template that the plugin cannot fill, and the closest token that it can fill. */
export interface TokenIssue {
  token: string
  /** True for {field:key}: the share leaves it empty. False for {name}: the share shows it as text. */
  field: boolean
  suggestion?: string
}

/** The number of letters to add, remove or change to make one word from the other. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const next = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = next
    }
  }
  return row[b.length]!
}

/** The closest word of a list, when it is near enough to be a typing error. */
function closest(word: string, list: string[]): string | undefined {
  let best: string | undefined
  let score = Infinity
  for (const item of list) {
    const d = distance(word.toLowerCase(), item.toLowerCase())
    if (d < score) {
      score = d
      best = item
    }
  }
  return best !== undefined && score <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined
}

/**
 * The tokens of a template that the plugin cannot fill.
 *
 * @param text   The template.
 * @param tokens The tokens that the plugin fills, such as '{title}'.
 * @param fields The custom field names of the post type, or null when they are not known. Then {field:key} is not checked.
 */
export function checkTokens(text: string, tokens: string[], fields: string[] | null): TokenIssue[] {
  const issues: TokenIssue[] = []
  const seen = new Set<string>()
  for (const piece of parseTemplate(text)) {
    // A style mark, such as {b}, is not a token.
    if (piece.type !== 'token' || seen.has(piece.raw) || (MARKS as readonly string[]).includes(piece.name)) continue
    seen.add(piece.raw)
    const { name, mods, raw } = piece
    if (name.startsWith('field:')) {
      const key = name.slice(6)
      if (fields === null || fields.includes(key)) continue
      const near = closest(key, fields)
      issues.push({ token: raw, field: true, suggestion: near ? stringifyToken(`field:${near}`, mods) : undefined })
    } else if (!tokens.includes(`{${name}}`)) {
      const near = closest(name, tokens.map((t) => t.slice(1, -1)))
      issues.push({ token: raw, field: false, suggestion: near ? stringifyToken(near, mods) : undefined })
    }
  }
  return issues
}
