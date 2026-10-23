import { AccountToggle, Icon } from '../../components/ui'
import { can, caps } from '../../lib/config'
import { __, sprintf } from '../../lib/i18n'
import { useStore } from '../../lib/store'
import type { Account } from '../../lib/types'

interface Props {
  /** Shown accounts; an edited share shows its own account only. */
  accounts: Account[]
  connected: Account[]
  selected: string[]
  setSelected: (update: (ids: string[]) => string[]) => void
  /** An edited share keeps its account. */
  locked: boolean
  /** Leaves the composer for another screen, such as 'accounts'. The composer asks first when there are unsaved changes. */
  onLeave: (to: string) => void
}

/** The "Share to" row: one button for each account, plus Select all and expired sign-ins. */
export function AccountPicker({ accounts, connected, selected, setSelected, locked, onLeave }: Props) {
  const { network } = useStore()
  const all = selected.length === connected.length

  return (
    <div className="sint-share-to">
      <span className="sint-label">{__('Share to', 'social-integrations')}</span>
      {accounts.length === 0 && (can(caps.manageAccounts) ? <a href="#/accounts" onClick={(e) => { e.preventDefault(); onLeave('accounts') }}>{__('Connect an account first', 'social-integrations')}</a> : <span className="sint-sub">{__('No accounts are connected.', 'social-integrations')}</span>)}
      {/* One row of accounts; on a phone it scrolls sideways instead of filling the screen. */}
      {accounts.length > 0 && (
        <span className="sint-share-to-list">
          {accounts.map((a) => {
            const on = selected.includes(a.id)
            const expired = a.status === 'expired'
            return <AccountToggle key={a.id} account={a} network={network(a.network)} on={on && !expired} disabled={expired || locked} onToggle={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))} />
          })}
        </span>
      )}
      {!locked && connected.length > 1 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
          {sprintf(__('%1$d of %2$d', 'social-integrations'), selected.length, connected.length)}
          <button type="button" className="sint-btn ghost sm" onClick={() => setSelected(() => (all ? [] : connected.map((a) => a.id)))}>
            {all ? __('Clear', 'social-integrations') : __('Select all', 'social-integrations')}
          </button>
        </span>
      )}
      {accounts.filter((a) => a.status === 'expired').map((a) => (
        <span key={a.id} style={{ fontSize: 12, color: 'var(--warn-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="alert" size={14} stroke={2.2} />
          {sprintf(__('%1$s on %2$s: sign-in expired', 'social-integrations'), a.name || a.username, network(a.network)?.label ?? a.network)}
          {can(caps.manageAccounts) && (
            <>
              {' · '}
              <a href={`#/accounts?reconnect=${encodeURIComponent(a.id)}`} onClick={(e) => { e.preventDefault(); onLeave(`accounts?reconnect=${encodeURIComponent(a.id)}`) }} style={{ color: 'var(--warn-text)', fontWeight: 700 }}>{__('Reconnect', 'social-integrations')}</a>
            </>
          )}
        </span>
      ))}
    </div>
  )
}
