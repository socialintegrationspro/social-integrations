import { __, sprintf } from '../lib/i18n'
import type { TokenIssue } from '../lib/tokens'
import { Icon } from './ui'

/**
 * Tokens that the plugin cannot fill, each with what happens to it in the share, and a button
 * that replaces it with the closest token. The list updates while the user types.
 */
export function TokenIssues({ issues, onFix }: { issues: TokenIssue[]; onFix: (from: string, to: string) => void }) {
  if (issues.length === 0) return null
  return (
    <ul className="sint-token-issues" aria-live="polite">
      {issues.map((i) => (
        <li key={i.token}>
          <Icon name="alert" size={14} stroke={2.2} />
          <span>
            {i.field
              ? sprintf(__('%s: no recent post of this type has this field. When a post does not have it, the share leaves it empty.', 'social-integrations'), i.token)
              : sprintf(__('%s is not a token. The share shows it as text.', 'social-integrations'), i.token)}
          </span>
          {i.suggestion && (
            <button type="button" className="sint-btn ghost sm" onClick={() => onFix(i.token, i.suggestion!)}>
              {sprintf(__('Use %s', 'social-integrations'), i.suggestion)}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
