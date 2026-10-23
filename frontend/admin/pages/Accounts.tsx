import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Header, type PageProps } from '../components/Header'
import { AccountAvatar, CopyField, Icon, Modal, NetBadge, useToast } from '../components/ui'
import { api } from '../lib/api'
import { config } from '../lib/config'
import { fmtDate } from '../lib/format'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { Account, Network } from '../lib/types'

interface Entity {
  remote_id: string
  name: string
  avatar: string
}

export function AccountsPage({ params, go }: PageProps) {
  const { networks, accounts, network, reload, redirectUri } = useStore()
  const toast = useToast()
  const [connecting, setConnecting] = useState<Network | null>(null)
  // The URL only flags an error; the text comes from the server, so a link cannot set it.
  const [error, setError] = useState(params.get('error') ? config.oauthError : '')
  const pick = params.get('pick')

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

  const disconnect = async (account: Account) => {
    if (!window.confirm(sprintf(__('Disconnect %s? Scheduled shares to it will fail.', 'social-integrations'), account.name || account.username))) return
    await api.del(`accounts/${account.id}`)
    toast(__('Account disconnected.', 'social-integrations'))
    reload()
  }

  const expired = accounts.filter((a) => a.status === 'expired')

  return (
    <>
      <Header title={__('Accounts', 'social-integrations')} />
      <div className="sint-body">
        <p className="sint-sub">{__('Sign-in tokens are stored encrypted on your site and never leave it except to the network.', 'social-integrations')}</p>

        {error && (
          <div className="sint-banner bad">
            <Icon name="alert" size={20} />
            <div style={{ flex: 1 }}>{error}</div>
            <button type="button" className="sint-btn ghost sm" onClick={() => { setError(''); go('accounts') }}>{__('Dismiss', 'social-integrations')}</button>
          </div>
        )}

        {expired.map((a) => (
          <div key={a.id} className="sint-banner warn">
            <Icon name="alert" size={20} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{sprintf(__('%1$s on %2$s: sign-in expired', 'social-integrations'), a.name || a.username, network(a.network)?.label ?? a.network)}</div>
              <div style={{ fontSize: 13, color: 'var(--warn-text)' }}>{__('Shares to this account stop until you reconnect it. Scheduled shares wait.', 'social-integrations')}</div>
            </div>
            <button type="button" className="sint-btn warn" style={{ marginLeft: 'auto' }} onClick={() => setConnecting(network(a.network) ?? null)}>{__('Reconnect', 'social-integrations')}</button>
          </div>
        ))}

        <div className="sint-grid">
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
                      <div className="sint-kv"><span>{__('Caption limit', 'social-integrations')}</span><span>{sprintf(__('%s characters', 'social-integrations'), n.char_limit.toLocaleString())}</span></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {account.status === 'expired' && <button type="button" className="sint-btn warn sm" onClick={() => setConnecting(n)}>{__('Reconnect', 'social-integrations')}</button>}
                      {account.profile_url && (
                        <a className="sint-btn sm" href={account.profile_url} target="_blank" rel="noreferrer">
                          {__('Open', 'social-integrations')} <Icon name="external" size={14} />
                        </a>
                      )}
                      <button type="button" className="sint-btn ghost sm" style={{ marginLeft: 'auto', border: 0, color: 'var(--muted)' }} onClick={() => disconnect(account)}>{__('Disconnect', 'social-integrations')}</button>
                    </div>
                  </div>
                ))}
                {extra}
              </Fragment>
            )
          })}
        </div>
      </div>

      {connecting && <ConnectModal network={connecting} redirectUri={redirectUri} onClose={() => setConnecting(null)} onDone={() => { setConnecting(null); reload() }} />}
      {pick && network(pick) && <PickEntity network={network(pick)!} onClose={() => go('accounts')} onDone={() => { reload(); go('accounts') }} />}
    </>
  )
}

function ConnectModal({ network, redirectUri, onClose, onDone }: { network: Network; redirectUri: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [appReady, setAppReady] = useState(network.app_configured)
  const oauth = network.auth_type === 'oauth2'
  const fields = oauth && !appReady ? network.app_fields : network.connect_fields

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (oauth && !appReady) {
        await api.post(`apps/${network.key}`, values)
        setAppReady(true)
        setValues({})
      } else if (oauth) {
        const r = await api.post<{ url: string }>(`oauth/${network.key}/start`)
        window.location.href = r.data.url
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
      <form onSubmit={submit} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {oauth && !appReady && (
          <>
            <p className="sint-sub">{sprintf(__('%s connects through an app you create on its developer site. Enter the app details, then sign in.', 'social-integrations'), network.label)}</p>
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
        {oauth && appReady && <p className="sint-sub">{sprintf(__('Sign in to %s to give this site permission to post.', 'social-integrations'), network.label)}</p>}
        {fields.map((f) => (
          <label key={f.name} className="sint-field">
            <span>{f.label}</span>
            <input className="sint-input" type={f.type === 'password' ? 'password' : 'text'} autoComplete="off" placeholder={f.placeholder} value={values[f.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} required />
            {f.help && <small>{f.help}</small>}
          </label>
        ))}
        {error && <div className="sint-banner bad" style={{ padding: '10px 14px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {oauth && appReady && (
            <button type="button" className="sint-btn ghost" onClick={() => setAppReady(false)}>{__('Change app', 'social-integrations')}</button>
          )}
          <button type="button" className="sint-btn ghost" onClick={onClose}>{__('Cancel', 'social-integrations')}</button>
          <button type="submit" className="sint-btn primary" disabled={busy}>
            {busy ? __('Working…', 'social-integrations') : oauth && !appReady ? __('Save app', 'social-integrations') : oauth ? sprintf(__('Sign in to %s', 'social-integrations'), network.label) : __('Connect', 'social-integrations')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PickEntity({ network, onClose, onDone }: { network: Network; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [entities, setEntities] = useState<Entity[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<Entity[]>(`oauth/${network.key}/entities`).then((r) => setEntities(r.data), (e) => setError((e as Error).message))
  }, [network.key])
  const choose = async (e: Entity) => {
    try {
      await api.post(`oauth/${network.key}/entities`, { remote_id: e.remote_id })
      toast(sprintf(__('%s is connected.', 'social-integrations'), e.name))
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <Modal title={sprintf(__('Select where to post on %s', 'social-integrations'), network.label)} onClose={onClose} narrow>
      <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {error && <div className="sint-banner bad">{error}</div>}
        {!entities && !error && <div className="sint-skeleton" style={{ height: 120 }} />}
        {entities?.map((e) => (
          <button key={e.remote_id} type="button" className="sint-item" onClick={() => choose(e)}>
            {e.avatar ? <img className="sint-thumb" src={e.avatar} alt="" style={{ borderRadius: 999 }} /> : <span className="sint-thumb" style={{ borderRadius: 999 }} />}
            <span style={{ fontWeight: 600 }}>{e.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
