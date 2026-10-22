import { useEffect, useState, type FormEvent } from 'react'
import { Header, type PageProps } from '../App'
import { AccountAvatar, Icon, Modal, NetBadge, useToast } from '../components/ui'
import { api } from '../lib/api'
import { fmtDate } from '../lib/format'
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
  const [error, setError] = useState(params.get('error') ?? '')
  const pick = params.get('pick')

  useEffect(() => {
    const done = params.get('connected')
    if (done) {
      toast(sprintf(__('%s is connected.'), network(done)?.label ?? done))
      reload()
      go('accounts')
    }
    // Only on arrival from the sign-in callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disconnect = async (account: Account) => {
    if (!window.confirm(sprintf(__('Disconnect %s? Scheduled shares to it will fail.'), account.name || account.username))) return
    await api.del(`accounts/${account.id}`)
    toast(__('Account disconnected.'))
    reload()
  }

  const expired = accounts.filter((a) => a.status === 'expired')

  return (
    <>
      <Header title={__('Accounts')} />
      <div className="sint-body">
        <p className="sint-sub">{__('Connect one account for each network. Sign-in tokens are stored encrypted on your site and never leave it except to the network.')}</p>

        {error && (
          <div className="sint-banner bad">
            <Icon name="alert" size={20} />
            <div style={{ flex: 1 }}>{error}</div>
            <button type="button" className="sint-btn ghost sm" onClick={() => { setError(''); go('accounts') }}>{__('Dismiss')}</button>
          </div>
        )}

        {expired.map((a) => (
          <div key={a.id} className="sint-banner warn">
            <Icon name="alert" size={20} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{sprintf(__('%s sign-in expired'), network(a.network)?.label ?? a.network)}</div>
              <div style={{ fontSize: 13, color: '#e5d3a1' }}>{__('Shares to this account stop until you reconnect it. Scheduled shares wait.')}</div>
            </div>
            <button type="button" className="sint-btn warn" style={{ marginLeft: 'auto' }} onClick={() => setConnecting(network(a.network) ?? null)}>{__('Reconnect')}</button>
          </div>
        ))}

        <div className="sint-grid">
          {networks.map((n) => {
            const account = accounts.find((a) => a.network === n.key)
            if (!account) {
              return (
                <div key={n.key} className="sint-acc add">
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span className="sint-avatar lg" style={{ background: 'var(--raised)' }}>
                      <NetBadge network={n.key} color={n.color} size={28} />
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{n.label}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{__('Not connected')}</div>
                    </div>
                  </div>
                  <button type="button" className="sint-btn primary" onClick={() => setConnecting(n)}>{sprintf(__('Connect %s'), n.label)}</button>
                </div>
              )
            }
            return (
              <div key={n.key} className={`sint-acc${account.status === 'expired' ? ' expired' : ''}`}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <AccountAvatar account={account} network={n} large />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.name || account.username}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{n.label}</div>
                  </div>
                  {account.status === 'expired' ? (
                    <span className="sint-pill warn" style={{ marginLeft: 'auto' }}>{__('Sign-in expired')}</span>
                  ) : (
                    <span className="sint-pill ok" style={{ marginLeft: 'auto' }}>{__('Connected')}</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {account.username && <div className="sint-kv"><span>{__('Handle')}</span><span>{account.username}</span></div>}
                  <div className="sint-kv"><span>{__('Connected')}</span><span>{fmtDate(account.connected_at)}</span></div>
                  <div className="sint-kv"><span>{__('Caption limit')}</span><span>{sprintf(__('%s characters'), n.char_limit.toLocaleString())}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {account.status === 'expired' && <button type="button" className="sint-btn warn sm" onClick={() => setConnecting(n)}>{__('Reconnect')}</button>}
                  {account.profile_url && (
                    <a className="sint-btn sm" href={account.profile_url} target="_blank" rel="noreferrer">
                      {__('Open')} <Icon name="external" size={14} />
                    </a>
                  )}
                  <button type="button" className="sint-btn ghost sm" style={{ marginLeft: 'auto', border: 0, color: 'var(--muted)' }} onClick={() => disconnect(account)}>{__('Disconnect')}</button>
                </div>
              </div>
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
        toast(sprintf(__('%s is connected.'), network.label))
        onDone()
      }
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <Modal title={sprintf(__('Connect %s'), network.label)} onClose={onClose} narrow>
      <form onSubmit={submit} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {oauth && !appReady && (
          <>
            <p className="sint-sub">{sprintf(__('%s connects through an app you create on its developer site. Enter the app details, then sign in.'), network.label)}</p>
            <div className="sint-field">
              <span>{__('Redirect URL for the app')}</span>
              <input className="sint-input" readOnly value={redirectUri} onFocus={(e) => e.target.select()} />
              <small>{__('Add this URL to the app as an allowed redirect URL.')}</small>
            </div>
            {network.app_setup_url && (
              <a href={network.app_setup_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                {sprintf(__('Create an app on %s'), network.label)} <Icon name="external" size={14} />
              </a>
            )}
          </>
        )}
        {oauth && appReady && <p className="sint-sub">{sprintf(__('Sign in to %s to give this site permission to post.'), network.label)}</p>}
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
            <button type="button" className="sint-btn ghost" onClick={() => setAppReady(false)}>{__('Change app')}</button>
          )}
          <button type="button" className="sint-btn ghost" onClick={onClose}>{__('Cancel')}</button>
          <button type="submit" className="sint-btn primary" disabled={busy}>
            {busy ? __('Working…') : oauth && !appReady ? __('Save app') : oauth ? sprintf(__('Sign in to %s'), network.label) : __('Connect')}
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
      toast(sprintf(__('%s is connected.'), e.name))
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <Modal title={sprintf(__('Select where to post on %s'), network.label)} onClose={onClose} narrow>
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
