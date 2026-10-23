import { Fragment, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Header, type PageProps } from '../components/Header'
import { AccountAvatar, copyText, Empty, Icon, Modal, NetBadge, Pagination, usePageSize, useToast } from '../components/ui'
import { api, query } from '../lib/api'
import { fmtStamp, siteParts } from '../lib/format'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { LogEntry, LogPage as LogData, LogRequest, LogShare, LogTry } from '../lib/types'

type Range = '' | 'today' | '7' | '30' | 'month' | 'custom'

const RANGES: { value: Range; label: () => string }[] = [
  { value: '', label: () => __('Any time', 'social-integrations') },
  { value: 'today', label: () => __('Today', 'social-integrations') },
  { value: '7', label: () => __('Last 7 days', 'social-integrations') },
  { value: '30', label: () => __('Last 30 days', 'social-integrations') },
  { value: 'month', label: () => __('This month', 'social-integrations') },
  { value: 'custom', label: () => __('Custom range', 'social-integrations') },
]

/** From and to dates ('Y-m-d', site time) for a preset range. */
function rangeDates(range: Range): { from: string; to: string } {
  const today = siteParts(new Date()).key
  const ago = (days: number) => siteParts(new Date(Date.now() - days * 86400000)).key
  switch (range) {
    case 'today':
      return { from: today, to: today }
    case '7':
      return { from: ago(6), to: today }
    case '30':
      return { from: ago(29), to: today }
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today }
    default:
      return { from: '', to: '' }
  }
}

const count = (shares: LogShare[], status: LogShare['status']) => shares.filter((s) => s.status === status).length
// Only a share that still has its queue row can be sent again.
const retryable = (shares: LogShare[]) => shares.filter((s) => s.status === 'failed' && s.queue_id > 0)

export function LogPage({ params, go }: PageProps) {
  const { network, accounts } = useStore()
  const toast = useToast()
  const [data, setData] = useState<LogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'' | 'failed'>('')
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<Range>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = usePageSize()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState('')
  // The share whose details show in the side panel.
  const [detail, setDetail] = useState<{ share: LogShare; entry: LogEntry } | null>(null)
  // Entries checked for bulk delete, and the delete that waits for a second click.
  const [selected, setSelected] = useState<string[]>([])
  const [armed, setArmed] = useState('')
  const request = useRef(0)
  // The first row opens once, when the log first loads.
  const firstOpened = useRef(false)
  const campaign = params.get('campaign') ?? ''

  // Filter `sint.campaigns.actions` also names the campaign types of other plugins.
  const types = applyFilters<Record<string, { label: string }>>('sint.campaigns.actions', {
    single: { label: __('Single post', 'social-integrations') },
    auto: { label: __('Auto-post', 'social-integrations') },
  })

  // Search after the last change to the text.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(typed.trim()), 300)
    return () => window.clearTimeout(t)
  }, [typed])

  // A new filter starts at the first page.
  useEffect(() => setPage(1), [campaign, status, search, from, to, size])
  // A new page or filter clears the selection.
  useEffect(() => {
    setSelected([])
    setArmed('')
  }, [page, campaign, status, search, from, to, size])

  const load = () => {
    const id = ++request.current
    setLoading(true)
    return api
      .get<LogData>(`logs?${query({ page, per_page: size, campaign, status, search, from, to })}`)
      .then(
        (r) => {
          if (id !== request.current) return
          setData(r.data)
          if (!firstOpened.current && r.data.items[0]) {
            firstOpened.current = true
            setOpen({ [r.data.items[0].key]: true })
          }
        },
        (e) => {
          if (id === request.current) toast((e as Error).message, true)
        },
      )
      .finally(() => {
        if (id === request.current) setLoading(false)
      })
  }
  useEffect(() => {
    load()
  }, [page, size, campaign, status, search, from, to])

  const names = new Map((data?.campaigns ?? []).map((c) => [c.key, c]))
  const setCampaign = (key: string) => go(key ? `log?campaign=${encodeURIComponent(key)}` : 'log')
  const pickRange = (next: Range) => {
    setRange(next)
    // A custom range keeps the dates until the user changes them.
    if (next !== 'custom') {
      const d = rangeDates(next)
      setFrom(d.from)
      setTo(d.to)
    }
  }
  const filtered = !!(campaign || status || search || from || to)
  const clear = () => {
    setStatus('')
    setTyped('')
    setSearch('')
    setRange('')
    setFrom('')
    setTo('')
    setCampaign('')
  }

  const retry = async (shares: LogShare[], key: string) => {
    setBusy(key)
    let sent = 0
    let last = ''
    for (const s of shares) {
      try {
        const r = await api.post<{ status: string; message: string }>(`queue/${s.queue_id}/retry`)
        if (r.data.status === 'published') sent++
        else last = r.data.message
      } catch (e) {
        last = (e as Error).message
      }
    }
    if (shares.length === 1) toast(sent ? __('Shared.', 'social-integrations') : last, !sent)
    else toast(sprintf(__('%1$d of %2$d shares sent.', 'social-integrations'), sent, shares.length), sent < shares.length)
    setBusy('')
    load()
  }

  // Deletes the log rows of entries. The shares stay in the calendar.
  const remove = async (keys: string[]) => {
    setBusy('delete')
    try {
      await api.post('logs/delete', { keys })
      toast(keys.length === 1 ? __('Entry deleted.', 'social-integrations') : sprintf(__('%d entries deleted.', 'social-integrations'), keys.length))
      setSelected([])
      setArmed('')
      // When the page is now empty, show the page before it.
      if (data && keys.length >= data.items.length && page > 1) setPage(page - 1)
      else load()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy('')
    }
  }
  const pick = (key: string, on: boolean) => setSelected((s) => (on ? [...s, key] : s.filter((k) => k !== key)))

  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }))
  // A click anywhere on the row opens it, except on its own links and buttons.
  const rowClick = (e: MouseEvent, key: string) => {
    if (!(e.target as HTMLElement).closest('a, button, input, label')) toggle(key)
  }

  const campaignCell = (e: LogEntry) => {
    const c = names.get(e.campaign_key)
    const post = e.post_title || e.excerpt || __('Written in the composer', 'social-integrations')
    // Shares without a campaign show their post alone; the Type column says "—".
    const postLine = (className: string) =>
      e.edit_url ? (
        <a className={className} href={e.edit_url} title={__('Edit the post', 'social-integrations')}>{post}</a>
      ) : (
        <div className={className}>{post}</div>
      )
    if (!e.campaign_key) return postLine('sint-log-title')
    return (
      <>
        {c ? (
          <button type="button" className="sint-log-camp-link" title={__('Show the shares of this campaign', 'social-integrations')} onClick={() => setCampaign(e.campaign_key)}>{c.name}</button>
        ) : (
          <span className="sint-log-none">{__('Deleted campaign', 'social-integrations')}</span>
        )}
        {post !== c?.name && postLine('sint-log-post')}
      </>
    )
  }

  // A picture for each account; the arrow at the end of the row opens them.
  const accountsCell = (e: LogEntry) => {
    const bad = count(e.shares, 'failed')
    return (
      <span className="sint-log-accts">
        <span className="sint-log-avatars" aria-hidden="true">
          {e.shares.slice(0, 4).map((s) => {
            const acct = accounts.find((a) => a.id === s.account_id)
            // A failed account gets a red ring, so the row shows who failed without words.
            return (
              <span key={s.id} className={`sint-log-av${s.status === 'failed' ? ' failed' : ''}`}>
                {acct ? <AccountAvatar account={acct} network={network(s.network)} /> : <NetBadge network={s.network} color={network(s.network)?.color} size={28} />}
              </span>
            )
          })}
          {e.shares.length > 4 && <span className="sint-log-av sint-log-more">+{e.shares.length - 4}</span>}
        </span>
        <span className="sint-sr">{sprintf(e.shares.length === 1 ? __('%d account', 'social-integrations') : __('%d accounts', 'social-integrations'), e.shares.length)}</span>
        {bad > 0 && <span className="sint-log-bad">{sprintf(__('%d failed', 'social-integrations'), bad)}</span>}
      </span>
    )
  }

  const shareRow = (e: LogEntry) => (s: LogShare) => {
    const acct = accounts.find((a) => a.id === s.account_id)
    const net = network(s.network)
    return (
      <li key={s.id} className="sint-log-share-item">
        <div className="sint-log-share">
          {acct ? <AccountAvatar account={acct} network={net} /> : <NetBadge network={s.network} color={net?.color} size={32} />}
          <div className="sint-log-who">
            <div className="n">{acct?.name || acct?.username || net?.label || s.network}</div>
            <div className="m">
              {net?.label ?? s.network} · {fmtStamp(s.created_at)}
              {s.tries > 1 && ` · ${sprintf(__('%d tries', 'social-integrations'), s.tries)}`}
            </div>
            {s.message && <div className="sint-log-msg">{s.message}</div>}
          </div>
          <span className={`sint-log-result ${s.status === 'published' ? 'ok' : 'bad'}`}>{s.status === 'published' ? __('Published', 'social-integrations') : __('Failed', 'social-integrations')}</span>
          <span className="sint-log-share-act">
            {s.status === 'failed' && s.queue_id > 0 && (
              <button type="button" className="sint-log-retry" disabled={!!busy} onClick={() => retry([s], `s${s.id}`)}>
                <Icon name="retry" size={14} stroke={2} />
                {busy === `s${s.id}` ? __('Wait…', 'social-integrations') : __('Retry', 'social-integrations')}
              </button>
            )}
            {s.remote_url && (
              <a href={s.remote_url} target="_blank" rel="noreferrer" className="sint-pc-tool" aria-label={__('Open the post on the network', 'social-integrations')} title={__('Open the post on the network', 'social-integrations')}>
                <Icon name="external" size={14} stroke={2} />
              </a>
            )}
            <button type="button" className="sint-pc-tool" aria-haspopup="dialog" aria-label={__('Details', 'social-integrations')} title={__('Details: each try and what the network answered', 'social-integrations')} onClick={() => setDetail({ share: s, entry: e })}>
              <Icon name="code" size={14} stroke={2} />
            </button>
          </span>
        </div>
      </li>
    )
  }

  const total = data?.total ?? 0

  return (
    <>
      <Header title={__('Share log', 'social-integrations')}>
        <button type="button" className="sint-btn ghost sm" onClick={() => load()} disabled={loading} aria-label={__('Refresh the log', 'social-integrations')}>
          <Icon name="retry" size={14} stroke={2} />
          {__('Refresh', 'social-integrations')}
        </button>
      </Header>
      <div className="sint-body">
        <div className="sint-log-filters">
          <label className="sint-search">
            <Icon name="search" size={16} />
            <span className="sint-sr">{__('Search', 'social-integrations')}</span>
            <input type="search" value={typed} placeholder={__('Search post or caption', 'social-integrations')} onChange={(e) => setTyped(e.target.value)} />
          </label>
          <div className="sint-log-filter-set">
            {(data?.campaigns.length ?? 0) > 0 && (
              <label className={`sint-filter${campaign ? ' on' : ''}`}>
                <Icon name="content" size={16} />
                <span className="sint-sr">{__('Campaign', 'social-integrations')}</span>
                <select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
                  <option value="">{__('All campaigns', 'social-integrations')}</option>
                  {data!.campaigns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className={`sint-filter${range ? ' on' : ''}`}>
              <Icon name="calendar" size={16} />
              <span className="sint-sr">{__('Date', 'social-integrations')}</span>
              <select value={range} onChange={(e) => pickRange(e.target.value as Range)}>
                {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label()}</option>)}
              </select>
            </label>
            {range === 'custom' && (
              <span className="sint-log-custom">
                <input type="date" className="sint-input" aria-label={__('From', 'social-integrations')} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                <span aria-hidden="true">–</span>
                <input type="date" className="sint-input" aria-label={__('To', 'social-integrations')} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </span>
            )}
            <div className="sint-seg" role="group" aria-label={__('Result', 'social-integrations')}>
              <button type="button" className={status === '' ? 'on' : ''} aria-pressed={status === ''} onClick={() => setStatus('')}>{__('All', 'social-integrations')}</button>
              <button type="button" className={status === 'failed' ? 'on' : ''} aria-pressed={status === 'failed'} onClick={() => setStatus('failed')}>
                {__('Failed', 'social-integrations')}
                {!!data?.failed && <span className="sint-seg-count bad">{data.failed}</span>}
              </button>
            </div>
            {filtered && <button type="button" className="sint-bulk-link" onClick={clear}>{__('Clear', 'social-integrations')}</button>}
          </div>
        </div>

        {data === null ? (
          <div className="sint-skeleton" style={{ height: 300 }} />
        ) : data.items.length === 0 ? (
          <div className="sint-card">
            {status === 'failed' && !campaign && !search && !from && !to ? (
              // No failed share is a good result, not an empty search.
              <Empty title={__('No failed shares', 'social-integrations')}>
                <span className="sint-empty-ok" aria-hidden="true"><Icon name="check" size={22} stroke={2.4} /></span>
                <p className="sint-sub">{__('The plugin sent every share in the log.', 'social-integrations')}</p>
                <button type="button" className="sint-btn sm" onClick={() => setStatus('')}>{__('Show all shares', 'social-integrations')}</button>
              </Empty>
            ) : filtered ? (
              <Empty title={__('No shares match the filters', 'social-integrations')}>
                <button type="button" className="sint-btn sm" onClick={clear}>{__('Clear filters', 'social-integrations')}</button>
              </Empty>
            ) : (
              <Empty title={__('No shares yet', 'social-integrations')}>{__('Each share to a network appears here with its result.', 'social-integrations')}</Empty>
            )}
          </div>
        ) : (
          <div className={`sint-table-wrap${loading ? ' sint-loading' : ''}`} aria-busy={loading}>
            <table className={`sint-table sint-log-table${selected.length ? ' selecting' : ''}`}>
              <thead>
                <tr className={selected.length ? 'sint-bulk' : ''}>
                  <th className="sint-check-cell">
                    <input
                      type="checkbox"
                      aria-label={__('Select all entries on this page', 'social-integrations')}
                      checked={data.items.length > 0 && selected.length === data.items.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.length > 0 && selected.length < data.items.length
                      }}
                      onChange={(ev) => setSelected(ev.target.checked ? data.items.map((x) => x.key) : [])}
                    />
                  </th>
                  {selected.length ? (
                    // While entries are selected, the header row holds the bulk actions.
                    <th colSpan={5}>
                      <span className="sint-bulk-bar" role="group" aria-label={__('Selected entries', 'social-integrations')}>
                        <span className="sint-bulk-count">{sprintf(__('%d selected', 'social-integrations'), selected.length)}</span>
                        <button type="button" className="sint-bulk-link" onClick={() => { setSelected([]); setArmed('') }}>{__('Clear', 'social-integrations')}</button>
                        <button
                          type="button"
                          className={`sint-bulk-delete${armed === 'bulk' ? ' armed' : ''}`}
                          disabled={busy === 'delete'}
                          title={__('The shares stay in the calendar. The plugin deletes only their log entries.', 'social-integrations')}
                          onClick={() => (armed === 'bulk' ? remove(selected) : setArmed('bulk'))}
                          onBlur={() => armed === 'bulk' && setArmed('')}
                        >
                          <Icon name="trash" size={14} stroke={2} />
                          {busy === 'delete' ? __('Wait…', 'social-integrations') : armed === 'bulk' ? __('Click again to delete', 'social-integrations') : __('Delete', 'social-integrations')}
                        </button>
                      </span>
                    </th>
                  ) : (
                    <>
                      <th>{__('Date', 'social-integrations')}</th>
                      <th>{__('Campaign', 'social-integrations')}</th>
                      <th>{__('Type', 'social-integrations')}</th>
                      <th>{__('Accounts', 'social-integrations')}</th>
                      <th><span className="sint-sr">{__('Actions', 'social-integrations')}</span></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => {
                  const isOpen = !!open[e.key]
                  const failed = retryable(e.shares)
                  const type = names.get(e.campaign_key)?.type ?? e.campaign_key.replace(/-\d+$/, '')
                  return (
                    <Fragment key={e.key}>
                      <tr className={`sint-log-row${isOpen ? ' open' : ''}${selected.includes(e.key) ? ' selected' : ''}`} onClick={(ev) => rowClick(ev, e.key)}>
                        <td className="sint-check-cell">
                          <input type="checkbox" aria-label={sprintf(__('Select the entry of %s', 'social-integrations'), fmtStamp(e.at))} checked={selected.includes(e.key)} onChange={(ev) => pick(e.key, ev.target.checked)} />
                        </td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{fmtStamp(e.at)}</td>
                        <td>{campaignCell(e)}</td>
                        <td>{type ? <span className="sint-pill muted">{types[type]?.label ?? type}</span> : <span className="sint-log-none">—</span>}</td>
                        <td>{accountsCell(e)}</td>
                        <td>
                          <span className="sint-log-actions">
                            {failed.length > 0 && (
                              <button type="button" className="sint-btn danger sm" disabled={!!busy} onClick={() => retry(failed, e.key)}>
                                {busy === e.key ? __('Wait…', 'social-integrations') : failed.length > 1 ? sprintf(__('Retry %d failed', 'social-integrations'), failed.length) : __('Retry', 'social-integrations')}
                              </button>
                            )}
                            <button
                              type="button"
                              className={`sint-log-del${armed === e.key ? ' armed' : ''}`}
                              disabled={busy === 'delete'}
                              aria-label={armed === e.key ? __('Click again to delete', 'social-integrations') : __('Delete the entry', 'social-integrations')}
                              title={armed === e.key ? __('Click again to delete', 'social-integrations') : __('Delete the entry', 'social-integrations')}
                              onClick={() => (armed === e.key ? remove([e.key]) : setArmed(e.key))}
                              onBlur={() => armed === e.key && setArmed('')}
                            >
                              <Icon name="trash" size={15} stroke={2} />
                              {armed === e.key && <span>{__('Click again to delete', 'social-integrations')}</span>}
                            </button>
                            <button type="button" className="sint-log-chev" aria-expanded={isOpen} aria-label={isOpen ? __('Hide accounts', 'social-integrations') : __('Show accounts', 'social-integrations')} title={isOpen ? __('Hide accounts', 'social-integrations') : __('Show accounts', 'social-integrations')} onClick={() => toggle(e.key)}>
                              <Icon name="down" size={16} stroke={2.2} />
                            </button>
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="sint-log-detail">
                          <td colSpan={6}>
                            <ul className="sint-log-shares">{e.shares.map(shareRow(e))}</ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} pages={Math.max(1, Math.ceil(total / size))} size={size} total={total} setPage={setPage} setSize={setSize} />
          </div>
        )}
      </div>
      {detail && (
        <ShareDetails
          share={detail.share}
          entry={detail.entry}
          campaign={names.get(detail.entry.campaign_key)?.name ?? ''}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}

/**
 * Side panel for one account's share: the account and post, then every try with each request
 * and what the network answered. It loads when it opens.
 */
function ShareDetails({ share, entry, campaign, onClose }: { share: LogShare; entry: LogEntry; campaign: string; onClose: () => void }) {
  const { network, accounts } = useStore()
  const toast = useToast()
  const [tries, setTries] = useState<LogTry[] | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const acct = accounts.find((a) => a.id === share.account_id)
  const net = network(share.network)

  useEffect(() => {
    api.get<LogTry[]>(`logs/${share.id}/tries`).then(
      (r) => setTries(r.data),
      (e) => setError((e as Error).message),
    )
  }, [share.id])

  const copy = async () => {
    const text = JSON.stringify({ account: acct?.name ?? share.account_id, network: share.network, campaign, post: entry.post_title || entry.excerpt, tries }, null, 2)
    if (await copyText(text)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      toast(__('The browser did not allow the copy.', 'social-integrations'), true)
    }
  }

  const footer = (
    <>
      <button type="button" className="sint-btn ghost" onClick={copy} disabled={!tries} aria-live="polite">
        <Icon name={copied ? 'check' : 'copy'} size={15} stroke={2} />
        {copied ? __('Copied', 'social-integrations') : __('Copy details', 'social-integrations')}
      </button>
      <button type="button" className="sint-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>{__('Close', 'social-integrations')}</button>
    </>
  )

  return (
    <Modal title={__('Share details', 'social-integrations')} onClose={onClose} drawer footer={footer}>
      <div className="sint-sd">
        <section className="sint-sd-summary">
          <div className="sint-sd-who">
            {acct ? <AccountAvatar account={acct} network={net} large /> : <NetBadge network={share.network} color={net?.color} size={52} />}
            <div style={{ minWidth: 0 }}>
              <div className="n">{acct?.name || acct?.username || net?.label || share.network}</div>
              <div className="m">{net?.label ?? share.network}</div>
            </div>
            <span className={`sint-log-result ${share.status === 'published' ? 'ok' : 'bad'}`}>{share.status === 'published' ? __('Published', 'social-integrations') : __('Failed', 'social-integrations')}</span>
          </div>
          <dl className="sint-sd-facts">
            {campaign && <><dt>{__('Campaign', 'social-integrations')}</dt><dd>{campaign}</dd></>}
            <dt>{__('Post', 'social-integrations')}</dt>
            <dd>{entry.edit_url ? <a href={entry.edit_url}>{entry.post_title || entry.excerpt}</a> : entry.post_title || entry.excerpt || __('Written in the composer', 'social-integrations')}</dd>
            <dt>{__('Last try', 'social-integrations')}</dt>
            <dd>{fmtStamp(share.created_at)}</dd>
            {share.remote_url && (
              <>
                <dt>{__('Post on the network', 'social-integrations')}</dt>
                <dd><a href={share.remote_url} target="_blank" rel="noreferrer">{__('Open on the network', 'social-integrations')} <Icon name="external" size={12} stroke={2} /></a></dd>
              </>
            )}
          </dl>
          {share.message && <div className="sint-banner bad sint-sd-msg">{share.message}</div>}
        </section>

        <section>
          <h3 className="sint-label" style={{ marginBottom: 12 }}>{tries ? (tries.length === 1 ? __('1 try', 'social-integrations') : sprintf(__('%d tries', 'social-integrations'), tries.length)) : __('Tries', 'social-integrations')}</h3>
          {error && <div className="sint-log-msg">{error}</div>}
          {!tries && !error && <div className="sint-skeleton" style={{ height: 120 }} />}
          {tries && (
            <ol className="sint-sd-tries">
              {tries.map((t, i) => (
                <li key={t.id} className={t.status === 'published' ? 'ok' : 'bad'}>
                  <div className="sint-log-try-head">
                    <b>{sprintf(__('Try %d', 'social-integrations'), i + 1)}</b>
                    <span>{fmtStamp(t.created_at)}</span>
                    <span className={`sint-log-result ${t.status === 'published' ? 'ok' : 'bad'}`}>{t.status === 'published' ? __('Published', 'social-integrations') : __('Failed', 'social-integrations')}</span>
                    {t.details?.code && <code>{t.details.code}</code>}
                    {!!t.details?.status && <code>HTTP {t.details.status}</code>}
                  </div>
                  {t.message && <div className="sint-log-msg">{t.message}</div>}
                  {!t.details && <p className="sint-log-tech-none">{__('This try has no details. The plugin saves details only for shares that it sent after this update.', 'social-integrations')}</p>}
                  {t.details?.exception && (
                    <pre className="sint-log-pre">{`${t.details.exception.class}: ${t.details.exception.message}\n${t.details.exception.file}`}</pre>
                  )}
                  {t.details?.requests?.map((r, n) => <RequestRow key={n} r={r} />)}
                  {t.details && !t.details.requests?.length && !t.details.exception && (
                    <p className="sint-log-tech-none">{__('The share stopped before it sent a request to the network.', 'social-integrations')}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  )
}

function RequestRow({ r }: { r: LogRequest }) {
  const tone = r.status === 0 || r.status >= 400 ? 'bad' : 'ok'
  const body = r.error ?? (typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2))
  return (
    <div className="sint-log-req">
      <div className="sint-log-req-line">
        <code className="m">{r.method}</code>
        <code className="u" title={r.url}>{r.url}</code>
        <code className={`s ${tone}`}>{r.status || __('No answer', 'social-integrations')}</code>
        <span className="t">{sprintf(__('%d ms', 'social-integrations'), r.ms)}</span>
      </div>
      {body && body !== '[]' && <pre className="sint-log-pre">{body}</pre>}
    </div>
  )
}
