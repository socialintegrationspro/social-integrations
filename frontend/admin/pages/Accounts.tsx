import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Header, type PageProps } from '../components/Header'
import { AccountAvatar, ConfirmDialog, CopyField, Icon, LoadError, Modal, NetBadge, RefreshButton, SkeletonList, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { config } from '../lib/config'
import { fmtDate } from '../lib/format'
import { applyFilters, useExpiredNotices, useFetch } from '../lib/hooks'
import { __, _n, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { Account, Network } from '../lib/types'

/** What the Accounts screen gives a `sint.accounts.view` view, which shows the accounts in place of the grid. */
export interface AccountsViewProps {
  networks: Network[]
  accounts: Account[]
  /** Opens the sign-in of a network. `via` reconnects an account with the same method. */
  connect: (network: Network, via?: string) => void
  /** Asks first, then disconnects the account. */
  disconnect: (account: Account) => void
  /** The ID of the account that the plugin disconnects now. */
  removing: string
  reload: () => Promise<void>
}

interface Entity {
  remote_id: string
  name: string
  avatar: string
}

export function AccountsPage({ params, go }: PageProps) {
  const { networks, accounts, network, reload, redirectUri } = useStore()
  const toast = useToast()
  // `via` is set for Reconnect, so the account signs in again with the same method.
  const [connecting, setConnectingState] = useState<{ network: Network; via?: string } | null>(null)
  const setConnecting = (network: Network | null, via?: string) => setConnectingState(network ? { network, via } : null)
  // The URL only flags an error; the text comes from the server, so a link cannot set it.
  const [error, setError] = useState(params.get('error') ? config.oauthError : '')
  const pick = params.get('pick')
  const [refreshing, setRefreshing] = useState(false)
  // The ID of the account that the plugin disconnects now.
  const [removing, setRemoving] = useState('')

  const refresh = async () => {
    setRefreshing(true)
    try {
      await reload()
    } catch (e) {
      toast(sprintf(__('The accounts did not load. %s', 'social-integrations'), (e as Error).message), true)
    }
    setRefreshing(false)
  }

  // From a Reconnect button on another screen: open the sign-in of that account at once.
  useEffect(() => {
    const id = params.get('reconnect')
    const account = id ? accounts.find((a) => a.id === id) : undefined
    const net = account ? network(account.network) : undefined
    if (account && net) setConnecting(net, account.via)
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const done = params.get('connected')
    if (done) {
      toast(sprintf(__('%s is connected.', 'social-integrations'), network(done)?.label ?? done))
      reload()
      go('accounts')
    }
    // Only on arrival from the sign-in callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The account that the confirm dialog asks about.
  const [confirming, setConfirming] = useState<Account | null>(null)
  const disconnect = (account: Account) => setConfirming(account)

  const remove = async (account: Account) => {
    setRemoving(account.id)
    try {
      const r = await api.del<{ shares?: number }>(`accounts/${account.id}`)
      const shares = r.data.shares ?? 0
      toast(shares ? sprintf(_n('Account disconnected. The plugin stopped %d scheduled share.', 'Account disconnected. The plugin stopped %d scheduled shares.', shares, 'social-integrations'), shares) : __('Account disconnected.', 'social-integrations'))
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setRemoving('')
    setConfirming(null)
  }

  // A closed notice shows again when another sign-in expires.
  const { expired, shown, dismiss } = useExpiredNotices(accounts)
  const closeButton = (ids: string[]) => (
    <button type="button" className="sint-icon-btn sm" style={{ border: 0, background: 'transparent', color: 'var(--warn-text)', flex: '0 0 auto' }} aria-label={__('Close the notice', 'social-integrations')} onClick={() => dismiss(ids)}>
      <Icon name="close" size={16} stroke={2.2} />
    </button>
  )
  // Filter `sint.accounts.view`: another plugin supplies the view of the networks and accounts.
  const CustomView = applyFilters<null | ((p: AccountsViewProps) => JSX.Element)>('sint.accounts.view', null)

  return (
    <>
      <Header title={__('Accounts', 'social-integrations')}>
        {/* Filter `sint.accounts.actions`: other plugins add buttons next to Refresh. */}
        {applyFilters<ReactNode[]>('sint.accounts.actions', [], { go, reload })}
        <RefreshButton loading={refreshing} onClick={refresh} label={__('Refresh the accounts', 'social-integrations')} />
      </Header>
      <div className="sint-body">
        <p className="sint-sub">{__('The plugin keeps sign-in tokens encrypted on your site. It sends each token only to its network.', 'social-integrations')}</p>

        {error && (
          <div className="sint-banner bad">
            <Icon name="alert" size={20} />
            <div style={{ flex: 1 }}>{error}</div>
            <button type="button" className="sint-btn ghost sm" onClick={() => { setError(''); go('accounts') }}>{__('Dismiss', 'social-integrations')}</button>
          </div>
        )}

        {/* Three or more expired sign-ins: one banner with a Reconnect button for each account. */}
        {expired.length > 2 ? (
          shown.length > 0 && (
            <div className="sint-banner warn">
              <Icon name="alert" size={20} />
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{sprintf(__('%d accounts: sign-in expired', 'social-integrations'), expired.length)}</div>
                  <div style={{ fontSize: 13, color: 'var(--warn-text)' }}>{__('Shares to these accounts stop until you reconnect them. Scheduled shares wait.', 'social-integrations')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {expired.map((a) => (
                    <button key={a.id} type="button" className="sint-btn warn sm" onClick={() => setConnecting(network(a.network) ?? null, a.via)}>
                      {sprintf(__('Reconnect %1$s (%2$s)', 'social-integrations'), a.name || a.username, network(a.network)?.label ?? a.network)}
                    </button>
                  ))}
                </div>
              </div>
              {closeButton(expired.map((a) => a.id))}
            </div>
          )
        ) : (
          shown.map((a) => (
            <div key={a.id} className="sint-banner warn">
              <Icon name="alert" size={20} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{sprintf(__('%1$s on %2$s: sign-in expired', 'social-integrations'), a.name || a.username, network(a.network)?.label ?? a.network)}</div>
                <div style={{ fontSize: 13, color: 'var(--warn-text)' }}>{__('Shares to this account stop until you reconnect it. Scheduled shares wait.', 'social-integrations')}</div>
              </div>
              <button type="button" className="sint-btn warn" style={{ marginLeft: 'auto' }} onClick={() => setConnecting(network(a.network) ?? null, a.via)}>{__('Reconnect', 'social-integrations')}</button>
              {closeButton([a.id])}
            </div>
          ))
        )}

        {CustomView ? (
          <div className={refreshing ? 'sint-loading' : undefined} aria-busy={refreshing}>
            <CustomView networks={networks} accounts={accounts} connect={setConnecting} disconnect={disconnect} removing={removing} reload={reload} />
          </div>
        ) : (
        <div className={`sint-grid${refreshing ? ' sint-loading' : ''}`} aria-busy={refreshing}>
          {networks.map((n) => {
            const list = accounts.filter((a) => a.network === n.key)
            if (!list.length) {
              return (
                <div key={n.key} className="sint-acc add">
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <NetBadge network={n.key} color={n.color} size={52} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{n.label}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{__('Not connected', 'social-integrations')}</div>
                    </div>
                  </div>
                  <button type="button" className="sint-btn" onClick={() => setConnecting(n)}>
                    <Icon name="plus" size={16} stroke={2.4} />
                    {sprintf(__('Connect %s', 'social-integrations'), n.label)}
                  </button>
                </div>
              )
            }
            // Filter `sint.accounts.tiles`: other plugins add tiles after a network's accounts.
            const extra = applyFilters<ReactNode[]>('sint.accounts.tiles', [], n, { connect: () => setConnecting(n) })
            return (
              <Fragment key={n.key}>
                {list.map((account) => (
                  <div key={account.id} className={`sint-acc${account.status === 'expired' ? ' expired' : ''}`}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <AccountAvatar account={account} network={n} large />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.name || account.username}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{n.label}</div>
                      </div>
                      {account.status === 'expired' ? (
                        <span className="sint-pill warn" style={{ marginLeft: 'auto' }}>{__('Sign-in expired', 'social-integrations')}</span>
                      ) : (
                        <span className="sint-pill ok" style={{ marginLeft: 'auto' }}>{__('Connected', 'social-integrations')}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {account.username && <div className="sint-kv"><span>{__('Handle', 'social-integrations')}</span><span>{account.username}</span></div>}
                      <div className="sint-kv"><span>{__('Connected', 'social-integrations')}</span><span>{fmtDate(account.connected_at)}</span></div>
                      {n.auth_type === 'oauth2' && <div className="sint-kv"><span>{__('App', 'social-integrations')}</span><span>{account.via === 'broker' ? __('Social Integrations app', 'social-integrations') : __('Your own app', 'social-integrations')}</span></div>}
                      <div className="sint-kv"><span>{__('Caption limit', 'social-integrations')}</span><span>{sprintf(__('%s characters', 'social-integrations'), n.char_limit.toLocaleString())}</span></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {account.status === 'expired' && <button type="button" className="sint-btn warn sm" onClick={() => setConnecting(n, account.via)}>{__('Reconnect', 'social-integrations')}</button>}
                      {account.profile_url && (
                        <a className="sint-btn sm" href={account.profile_url} target="_blank" rel="noreferrer">
                          {__('Open', 'social-integrations')} <Icon name="external" size={14} />
                        </a>
                      )}
                      <button type="button" className="sint-btn quiet-danger sm" style={{ marginLeft: 'auto' }} disabled={removing === account.id} onClick={() => disconnect(account)}>
                        {removing === account.id && <Spinner size={14} />}
                        {__('Disconnect', 'social-integrations')}
                      </button>
                    </div>
                  </div>
                ))}
                {extra}
              </Fragment>
            )
          })}
        </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={sprintf(__('Disconnect %s?', 'social-integrations'), confirming.name || confirming.username)}
          confirmLabel={__('Disconnect', 'social-integrations')}
          onConfirm={() => remove(confirming)}
          onClose={() => setConfirming(null)}
        >
          <div className="sint-confirm-who">
            <AccountAvatar account={confirming} network={network(confirming.network)} large />
            <p>{__('The plugin removes the sign-in token from your site. Shares already sent stay in the share log.', 'social-integrations')}</p>
          </div>
          <DisconnectImpact id={confirming.id} />
        </ConfirmDialog>
      )}
      {connecting && <ConnectModal network={connecting.network} via={connecting.via} redirectUri={redirectUri} onClose={() => setConnecting(null)} onDone={() => { setConnecting(null); reload() }} />}
      {pick && network(pick) && <PickEntity network={network(pick)!} onClose={() => go('accounts')} onDone={() => { reload(); go('accounts') }} />}
    </>
  )
}

/** What a disconnect changes: the campaigns that use the account and its scheduled shares. */
function DisconnectImpact({ id }: { id: string }) {
  const { data } = useFetch<{ campaigns: number; shares: number }>(`accounts/${id}/impact`)
  if (!data || (!data.campaigns && !data.shares)) return null
  return (
    <ul className="sint-confirm-list">
      {data.shares > 0 && <li>{sprintf(_n('The plugin stops %d scheduled share to this account.', 'The plugin stops %d scheduled shares to this account.', data.shares, 'social-integrations'), data.shares)}</li>}
      {data.campaigns > 0 && <li>{sprintf(_n('The plugin removes the account from %d campaign. A campaign without accounts stops.', 'The plugin removes the account from %d campaigns. A campaign without accounts stops.', data.campaigns, 'social-integrations'), data.campaigns)}</li>}
    </ul>
  )
}

type Method = 'broker' | 'app'

function ConnectModal({ network, via, redirectUri, onClose, onDone }: { network: Network; via?: string; redirectUri: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [appReady, setAppReady] = useState(network.app_configured)
  const oauth = network.auth_type === 'oauth2'
  const methods = network.methods as Method[]
  // One method, or the method of the account to reconnect: no choice step.
  const [method, setMethod] = useState<Method | null>(() => {
    if (via && methods.includes(via as Method)) return via as Method
    return methods.length === 1 ? methods[0]! : null
  })
  const ownApp = oauth && method === 'app'
  const fields = ownApp && !appReady ? network.app_fields : oauth ? [] : network.connect_fields

  const signIn = async (m: Method) => {
    const r = await api.post<{ url: string }>(`oauth/${network.key}/start`, { method: m })
    window.location.href = r.data.url
  }

  const startBroker = async () => {
    setBusy(true)
    setError('')
    try {
      await signIn('broker')
      return
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (oauth && method === 'broker') {
      await startBroker()
      return
    }
    setBusy(true)
    setError('')
    try {
      if (ownApp && !appReady) {
        await api.post(`apps/${network.key}`, values)
        setAppReady(true)
        setValues({})
      } else if (ownApp) {
        await signIn('app')
        return
      } else {
        await api.post(`accounts/${network.key}`, values)
        toast(sprintf(__('%s is connected.', 'social-integrations'), network.label))
        onDone()
      }
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <Modal title={sprintf(__('Connect %s', 'social-integrations'), network.label)} onClose={onClose} narrow>
      {oauth && method === null ? (
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="sint-sub">{sprintf(__('Select how this site signs in to %s.', 'social-integrations'), network.label)}</p>
          <button type="button" className="sint-method" disabled={busy} onClick={startBroker}>
            <span className="sint-method-title">
              {busy && <Spinner size={14} />}
              {__('Connect with Social Integrations', 'social-integrations')}
            </span>
            <span className="sint-method-text">{sprintf(__('Sign in to %s. You do not need a developer app.', 'social-integrations'), network.label)}</span>
          </button>
          <button type="button" className="sint-method" disabled={busy} onClick={() => setMethod('app')}>
            <span className="sint-method-title">{__('Use my own app', 'social-integrations')}</span>
            <span className="sint-method-text">{sprintf(__('Enter the details of an app that you created on the %s developer site.', 'social-integrations'), network.label)}</span>
          </button>
          {error && <div className="sint-banner bad" style={{ padding: '10px 14px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="sint-btn ghost" onClick={onClose}>{__('Cancel', 'social-integrations')}</button>
          </div>
        </div>
      ) : (
      <form onSubmit={submit} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {oauth && method === 'broker' && <p className="sint-sub">{sprintf(__('Sign in to %s to give this site permission to post. The Social Integrations app connects the account.', 'social-integrations'), network.label)}</p>}
        {ownApp && !appReady && (
          <>
            <p className="sint-sub">{sprintf(__('%s connects through an app that you create on its developer site. Enter the app details. Then sign in.', 'social-integrations'), network.label)}</p>
            <div className="sint-field">
              <span id="sint-redirect-label">{__('Redirect URL for the app', 'social-integrations')}</span>
              <CopyField value={redirectUri} labelledBy="sint-redirect-label" />
              <small>{__('Add this URL to the app as an allowed redirect URL.', 'social-integrations')}</small>
            </div>
            {network.app_setup_url && (
              <a href={network.app_setup_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                {sprintf(__('Create an app on %s', 'social-integrations'), network.label)} <Icon name="external" size={14} />
              </a>
            )}
          </>
        )}
        {ownApp && appReady && <p className="sint-sub">{sprintf(__('Sign in to %s to give this site permission to post.', 'social-integrations'), network.label)}</p>}
        {fields.map((f) => (
          <label key={f.name} className="sint-field">
            <span>{f.label}</span>
            <input className="sint-input" type={f.type === 'password' ? 'password' : 'text'} autoComplete="off" placeholder={f.placeholder} value={values[f.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} required />
            {f.help && <small>{f.help}</small>}
          </label>
        ))}
        {error && <div className="sint-banner bad" style={{ padding: '10px 14px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {oauth && methods.length > 1 && (
            <button type="button" className="sint-btn ghost" onClick={() => { setMethod(null); setError('') }}>{__('Back', 'social-integrations')}</button>
          )}
          {ownApp && appReady && (
            <button type="button" className="sint-btn ghost" onClick={() => setAppReady(false)}>{__('Change app', 'social-integrations')}</button>
          )}
          <button type="button" className="sint-btn ghost" onClick={onClose}>{__('Cancel', 'social-integrations')}</button>
          <button type="submit" className="sint-btn primary" disabled={busy}>
            {busy ? __('Wait…', 'social-integrations') : ownApp && !appReady ? __('Save app', 'social-integrations') : oauth ? sprintf(__('Sign in to %s', 'social-integrations'), network.label) : __('Connect', 'social-integrations')}
          </button>
        </div>
      </form>
      )}
    </Modal>
  )
}

function PickEntity({ network, onClose, onDone }: { network: Network; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const fetched = useFetch<Entity[]>(`oauth/${network.key}/entities`)
  const entities = fetched.stale ? null : fetched.data
  const loadError = fetched.error
  const [chooseError, setError] = useState('')
  const [choosing, setChoosing] = useState('')
  const choose = async (e: Entity) => {
    if (choosing) return
    setChoosing(e.remote_id)
    setError('')
    try {
      await api.post(`oauth/${network.key}/entities`, { remote_id: e.remote_id })
      toast(sprintf(__('%s is connected.', 'social-integrations'), e.name))
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
    setChoosing('')
  }
  return (
    <Modal title={sprintf(__('Select where to post on %s', 'social-integrations'), network.label)} onClose={onClose} narrow>
      <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 6 }} aria-busy={!entities || !!choosing}>
        {chooseError && <div className="sint-banner bad" role="alert">{chooseError}</div>}
        {loadError && <LoadError message={loadError} onRetry={() => fetched.reload()} busy={fetched.loading} />}
        {!entities && !loadError && <SkeletonList rows={3} />}
        {entities?.length === 0 && <p className="sint-sub">{sprintf(__('%s sent no place to post. Make sure that you gave permission for a page or an account.', 'social-integrations'), network.label)}</p>}
        {entities?.map((e) => (
          <button key={e.remote_id} type="button" className="sint-item" disabled={!!choosing} onClick={() => choose(e)}>
            {e.avatar ? <img className="sint-thumb" src={e.avatar} alt="" style={{ borderRadius: 999 }} /> : <span className="sint-thumb" style={{ borderRadius: 999 }} />}
            <span style={{ fontWeight: 600, flex: 1 }}>{e.name}</span>
            {choosing === e.remote_id && <Spinner size={16} />}
          </button>
        ))}
      </div>
    </Modal>
  )
}
