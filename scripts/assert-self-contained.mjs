// Fails if the plugin source carries an edition flag, a licence test, or a
// split file name. The plugin is one complete plugin; this keeps it that way.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const dirs = ['backend', 'frontend', 'social-integrations.php', 'uninstall.php']
const patterns = [
  [/\bpro\b/i, 'the word "pro"'],
  [/premium/i, 'the word "premium"'],
  [/licen[cs]e[_ -]?(key|check|valid|status)/i, 'a licence check'],
  [/is_?pro|has_?pro|IS_PRO/i, 'an edition flag'],
  [/upgrade (now|to)/i, 'an upgrade prompt'],
]
const files = []
const walk = (p) => {
  const s = statSync(p)
  if (s.isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f)))
  else if (/\.(php|tsx?|jsx?|css)$/.test(p)) files.push(p)
}
dirs.forEach((d) => { try { walk(join(root, d)) } catch {} })

const problems = []
for (const file of files) {
  const rel = relative(root, file)
  if (/\.(pro|free)\.[a-z]+$/.test(rel)) problems.push(`${rel}: split file name`)
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, what] of patterns) if (re.test(line)) problems.push(`${rel}:${i + 1}: ${what}`)
  })
}
if (problems.length) {
  console.error('The plugin source must be one complete plugin:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`Self-contained: ${files.length} files checked.`)
