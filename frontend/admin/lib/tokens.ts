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
  for (const [token] of text.matchAll(/\{[^{}\s]+\}/g)) {
    if (seen.has(token)) continue
    seen.add(token)
    const field = /^\{field:(.*)\}$/.exec(token)
    if (field) {
      if (fields === null || fields.includes(field[1]!)) continue
      const near = closest(field[1]!, fields)
      issues.push({ token, field: true, suggestion: near ? `{field:${near}}` : undefined })
    } else if (!tokens.includes(token)) {
      const near = closest(token.slice(1, -1), tokens.map((t) => t.slice(1, -1)))
      issues.push({ token, field: false, suggestion: near ? `{${near}}` : undefined })
    }
  }
  return issues
}
