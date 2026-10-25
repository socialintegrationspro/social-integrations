import { useCallback, useState, type MouseEvent, type ReactNode } from 'react'
import { AccountAvatar, Icon, Modal } from '../../components/ui'
import { can, caps } from '../../lib/config'
import { applyFilters } from '../../lib/hooks'
import { __, _n, sprintf } from '../../lib/i18n'
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

/** What a `sint.composer.accounts` filter gets: it adds controls that select accounts. */
export interface AccountControlsContext {
  /** The accounts that can get a share. */
  accounts: Account[]
  selected: string[]
  setSelected: (update: (ids: string[]) => string[]) => void
  locked: boolean
}

/** Filter `sint.composer.accounts`: other plugins add controls in a row above the accounts. */
export function AccountControls(ctx: AccountControlsContext) {
  const extra = applyFilters<ReactNode[]>('sint.composer.accounts', [], ctx)
  return extra.length ? <div className="sint-share-to">{extra}</div> : null
}

/** The "Share to" row: a short summary of the selected accounts, and a side panel to change them. */
export function AccountPicker({ accounts, connected, selected, setSelected, locked, onLeave }: Props) {
  const { network } = useStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // 'all', a network key, or 'expired'.
  const [filter, setFilter] = useState('all')
  const close = useCallback(() => setOpen(false), [])
  const all = connected.length > 0 && connected.every((a) => selected.includes(a.id))
  const expired = accounts.filter((a) => a.status === 'expired')
  const chosen = connected.filter((a) => selected.includes(a.id))
  const networks = Array.from(new Set(accounts.map((a) => a.network)))
  const q = query.trim().toLowerCase()
  const shown = accounts
    .filter((a) => (filter === 'all' ? true : filter === 'expired' ? a.status === 'expired' : a.network === filter))
    .filter((a) => !q || [a.name, a.username, network(a.network)?.label ?? a.network].some((x) => (x ?? '').toLowerCase().includes(q)))
  const reconnect = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    e.preventDefault()
    onLeave(to)
  }

  if (accounts.length === 0) {
    return (
      <div className="sint-share-to">
        <span className="sint-label">{__('Share to', 'social-integrations')}</span>
        {can(caps.manageAccounts) ? <a href="#/accounts" onClick={(e) => reconnect(e, 'accounts')}>{__('Connect an account first', 'social-integrations')}</a> : <span className="sint-sub">{__('No accounts are connected.', 'social-integrations')}</span>}
      </div>
    )
  }

  // An edited share keeps its account: the row only names it.
  if (locked) {
    return (
      <div className="sint-share-to">
        <span className="sint-label">{__('Share to', 'social-integrations')}</span>
        {accounts.map((a) => (
          <span key={a.id} className="sint-acc-one">
            <AccountAvatar account={a} network={network(a.network)} />
            <span>{a.name} · {network(a.network)?.label ?? a.network}</span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="sint-share-to-box">
      <div className="sint-share-to">
        <span className="sint-label">{__('Share to', 'social-integrations')}</span>
        <button type="button" className="sint-acc-summary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <span className="sint-acc-stack" aria-hidden="true">
            {chosen.slice(0, 8).map((a) => <AccountAvatar key={a.id} account={a} network={network(a.network)} />)}
            {chosen.length > 8 && <span className="sint-acc-more">+{chosen.length - 8}</span>}
          </span>
          <span className="sint-acc-count">
            <strong>{sprintf(__('%1$d of %2$d', 'social-integrations'), selected.length, connected.length)}</strong>
            <span>{__('accounts', 'social-integrations')}</span>
          </span>
        </button>
        {expired.length > 0 && (
          <button type="button" className="sint-pill warn sint-acc-warn" onClick={() => { setFilter('expired'); setOpen(true) }}>
            <Icon name="alert" size={13} stroke={2.4} />
            {sprintf(_n('%d needs a new sign-in', '%d need a new sign-in', expired.length, 'social-integrations'), expired.length)}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="sint-btn ghost sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {__('Change', 'social-integrations')}
        </button>
      </div>
      {open && (
        <Modal
          drawer
          title={__('Share to', 'social-integrations')}
          onClose={close}
          footer={
            <>
              <span className="sint-review-sum">{sprintf(__('%1$d of %2$d accounts', 'social-integrations'), selected.length, connected.length)}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="sint-btn primary" onClick={close}>{__('Done', 'social-integrations')}</button>
            </>
          }
        >
        <div className="sint-accounts-panel">
          <div className="sint-acc-tools">
            <label className="sint-acc-search">
              <Icon name="search" size={15} stroke={2} />
              <input type="search" aria-label={__('Search accounts', 'social-integrations')} placeholder={__('Search accounts', 'social-integrations')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {/* A list, not chips: it only filters the cards, and the group chips select accounts. */}
            {(networks.length > 1 || expired.length > 0) && (
              <select className="sint-select sm sint-acc-show" aria-label={__('Show accounts', 'social-integrations')} value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">{sprintf(__('All networks (%d)', 'social-integrations'), accounts.length)}</option>
                {networks.map((n) => <option key={n} value={n}>{`${network(n)?.label ?? n} (${accounts.filter((a) => a.network === n).length})`}</option>)}
                {expired.length > 0 && <option value="expired">{sprintf(__('Needs a new sign-in (%d)', 'social-integrations'), expired.length)}</option>}
              </select>
            )}
            <button type="button" className="sint-btn ghost sm" onClick={() => setSelected(() => (all ? [] : connected.map((a) => a.id)))}>
              {all ? __('Clear', 'social-integrations') : __('Select all', 'social-integrations')}
            </button>
          </div>
          <AccountControls accounts={connected} selected={selected} setSelected={setSelected} locked={locked} />
          {expired.length > 0 && (
            <div className="sint-acc-banner" role="note">
              <Icon name="alert" size={16} stroke={2.2} />
              <span>{sprintf(_n('%d account needs a new sign-in. It gets no shares until you reconnect it.', '%d accounts need a new sign-in. They get no shares until you reconnect them.', expired.length, 'social-integrations'), expired.length)}</span>
            </div>
          )}
          <div className="sint-acc-grid">
            {shown.map((a) => {
              const label = network(a.network)?.label ?? a.network
              if (a.status === 'expired') {
                const to = `accounts?reconnect=${encodeURIComponent(a.id)}`
                return (
                  <div key={a.id} className="sint-acc-card expired">
                    <button type="button" disabled aria-label={sprintf(__('%1$s, %2$s: sign-in expired', 'social-integrations'), a.name, label)}>
                      <AccountAvatar account={a} network={network(a.network)} />
                      <span className="n"><strong>{a.name || a.username}</strong><span>{label}</span></span>
                    </button>
                    {can(caps.manageAccounts) && <a href={`#/${to}`} onClick={(e) => reconnect(e, to)}>{__('Reconnect', 'social-integrations')}</a>}
                  </div>
                )
              }
              const on = selected.includes(a.id)
              return (
                <div key={a.id} className="sint-acc-card">
                  <button type="button" aria-pressed={on} aria-label={`${a.name}, ${label}`} onClick={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))}>
                    <AccountAvatar account={a} network={network(a.network)} />
                    <span className="n"><strong>{a.name || a.username}</strong><span>{label}</span></span>
                    <span className="check" aria-hidden="true">{on && <Icon name="check" size={14} stroke={3} />}</span>
                  </button>
                </div>
              )
            })}
            {shown.length === 0 && <p className="sint-sub">{__('No account matches the search.', 'social-integrations')}</p>}
          </div>
        </div>
        </Modal>
      )}
    </div>
  )
}
