import { useEffect, useState } from 'react'
import { Header, type PageProps } from '../components/Header'
import { Empty, Icon, LoadError, Menu, NetBadge, Pagination, RefreshButton, SkeletonTable, usePaged, useToast, type MenuItem } from '../components/ui'
import { api } from '../lib/api'
import { fmtStamp } from '../lib/format'
import { can as userCan, caps } from '../lib/config'
import { applyFilters, useFetch } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'

/** A row of GET campaigns. */
export interface CampaignItem {
  id: number | string
  type: string
  name: string
  /** Empty: every account, unless `no_accounts`. */
  accounts: string[]
  /** True when its last account was disconnected: it shares to no account. */
  no_accounts?: boolean
  status: string
  next_at: string
  last_at: string
  sent: number
  total: number
  updated_at: string
  /** The user who made the campaign, and the user's name: empty when the user does not exist now. */
  created_by?: number
  author?: string
  actions: string[]
}

/** How the screen handles one campaign type. Edit and Duplicate open the composer for every type. */
export interface CampaignActions {
  label: string
  remove: (item: CampaignItem) => Promise<unknown>
  pause?: (item: CampaignItem) => Promise<unknown>
  resume?: (item: CampaignItem) => Promise<unknown>
}

const STATUS: Record<string, { label: () => string; tone: string }> = {
  active: { label: () => __('Active', 'social-integrations'), tone: 'ok' },
  scheduled: { label: () => __('Scheduled', 'social-integrations'), tone: 'accent' },
  draft: { label: () => __('Draft', 'social-integrations'), tone: 'muted' },
  failed: { label: () => __('Failed', 'social-integrations'), tone: 'bad' },
  published: { label: () => __('Shared', 'social-integrations'), tone: 'ok' },
  paused: { label: () => __('Paused', 'social-integrations'), tone: 'warn' },
  ended: { label: () => __('Ended', 'social-integrations'), tone: 'muted' },
}

/** The most networks that a row shows before "+N". */
const NETS_SHOWN = 6

/** Networks of the accounts, in order of first use, with the number of accounts of each. */
const nets = (list: { network: string }[]): [string, number][] => {
  const n = new Map<string, number>()
  for (const a of list) n.set(a.network, (n.get(a.network) ?? 0) + 1)
  return Array.from(n)
}

/** Every campaign: single posts, auto-post rules and the types other plugins add. */
export function CampaignsPage({ openComposer, go }: PageProps) {
  const { accounts, network } = useStore()
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [armed, setArmed] = useState('')
  const [busy, setBusy] = useState('')
  // Campaigns checked for bulk delete. The bulk delete arms as 'bulk'.
  const [selected, setSelected] = useState<string[]>([])

  const campaigns = useFetch<CampaignItem[]>('campaigns')
  const items = campaigns.data
  const load = campaigns.reload

  // Filter `sint.campaigns.actions`: buttons for other campaign types, keyed by type.
  const handlers = applyFilters<Record<string, CampaignActions>>('sint.campaigns.actions', {
    single: { label: __('Single post', 'social-integrations'), remove: (c) => api.del(`campaigns/${c.id}`) },
    auto: {
      label: __('Auto-post', 'social-integrations'),
      remove: (c) => api.del(`campaigns/${c.id}`),
      pause: (c) => api.post(`campaigns/${c.id}/active`, { active: false }),
      resume: (c) => api.post(`campaigns/${c.id}/active`, { active: true }),
    },
  })

  const keyOf = (c: CampaignItem) => `${c.type}-${c.id}`
  const run = async (c: CampaignItem, action: 'remove' | 'pause' | 'resume', done: string) => {
    const fn = handlers[c.type]?.[action]
    if (!fn) return
    setBusy(keyOf(c))
    try {
      await fn(c)
      // A deleted campaign leaves the list at once. The list loads again behind it.
      if (action === 'remove') campaigns.mutate((list) => (list ?? []).filter((x) => keyOf(x) !== keyOf(c)))
      toast(done)
      load()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setBusy('')
    setArmed('')
  }
  const remove = (c: CampaignItem) => {
    if (armed !== keyOf(c)) return setArmed(keyOf(c))
    run(c, 'remove', __('Campaign deleted. Shares already sent stay in the share log.', 'social-integrations'))
  }
  const removeMany = async (list: CampaignItem[]) => {
    setBusy('bulk')
    const gone: string[] = []
    let last = ''
    for (const c of list) {
      try {
        await handlers[c.type]!.remove(c)
        gone.push(keyOf(c))
      } catch (e) {
        last = (e as Error).message
      }
    }
    if (gone.length) campaigns.mutate((all) => (all ?? []).filter((x) => !gone.includes(keyOf(x))))
    if (gone.length === list.length) toast(sprintf(__('%d campaigns deleted. Shares already sent stay in the share log.', 'social-integrations'), gone.length))
    else toast(sprintf(__('%1$d of %2$d campaigns deleted. %3$s', 'social-integrations'), gone.length, list.length, last), true)
    setSelected((s) => s.filter((k) => !gone.includes(k)))
    setBusy('')
    setArmed('')
    load()
  }
  const open = (c: CampaignItem, copy: boolean) => openComposer({ campaign: { type: c.type, id: c.id, accounts: c.accounts, copy } })

  // Sorted by label, so the tabs keep their places when a new campaign comes first in the list.
  const typeLabel = (t: string) => handlers[t]?.label ?? t
  const types = Array.from(new Set((items ?? []).map((c) => c.type))).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))
  const shown = (items ?? []).filter((c) => filter === 'all' || c.type === filter)
  const { rows: pageRows, pager } = usePaged(shown, filter)
  // Only campaigns that the screen can delete get a checkbox.
  const deletable = (c: CampaignItem) => c.actions.includes('delete') && !!handlers[c.type]
  const choosable = pageRows.filter(deletable)
  const picked = choosable.filter((c) => selected.includes(keyOf(c)))
  // Rows keep Pause and Resume in one column, so a row without them keeps the space.
  const toggles = pageRows.some((c) => (c.actions.includes('pause') || c.actions.includes('resume')) && !!handlers[c.type] && userCan(caps.publish))
  const pick = (key: string, on: boolean) => setSelected((s) => (on ? [...s, key] : s.filter((k) => k !== key)))
  // A new page or filter clears the selection.
  useEffect(() => {
    setSelected([])
    setArmed('')
  }, [filter, pager.page, pager.size])

  return (
    <>
      <Header title={__('Campaigns', 'social-integrations')}>
        <RefreshButton loading={campaigns.loading} onClick={() => load()} label={__('Refresh the campaigns', 'social-integrations')} />
        <button type="button" className="sint-btn primary" onClick={() => openComposer()}>
          <Icon name="plus" size={16} stroke={2.4} />
          {__('New campaign', 'social-integrations')}
        </button>
      </Header>
      <div className="sint-body">
        {campaigns.error && <LoadError message={sprintf(__('The campaigns did not load. %s', 'social-integrations'), campaigns.error)} onRetry={() => load()} busy={campaigns.loading} />}
        {items === null ? (
          !campaigns.error && <SkeletonTable cols={6} />
        ) : items.length === 0 ? (
          <Empty title={__('No campaigns yet', 'social-integrations')}>
            <p className="sint-sub">{__('Share one post now or later, schedule many posts, or share new posts when you publish them.', 'social-integrations')}</p>
            <button type="button" className="sint-btn primary" onClick={() => openComposer()}>{__('New campaign', 'social-integrations')}</button>
          </Empty>
        ) : (
          <>
            {types.length > 1 && (
              <div className="sint-seg" role="tablist" aria-label={__('Campaign type', 'social-integrations')} style={{ alignSelf: 'flex-start' }}>
                <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{__('All', 'social-integrations')}</button>
                {types.map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={filter === t} className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>{typeLabel(t)}</button>
                ))}
              </div>
            )}
            <div className={`sint-table-wrap sint-camp-wrap${campaigns.loading ? ' sint-loading' : ''}`} aria-busy={campaigns.loading}>
              <table className={`sint-table sint-camp-table${choosable.length ? ' choosable' : ''}${picked.length ? ' selecting' : ''}`}>
                <thead>
                  <tr className={picked.length ? 'sint-bulk' : ''}>
                    {choosable.length > 0 && (
                      <th className="sint-check-cell">
                        <input
                          type="checkbox"
                          aria-label={__('Select all campaigns on this page', 'social-integrations')}
                          checked={picked.length === choosable.length}
                          ref={(el) => {
                            if (el) el.indeterminate = picked.length > 0 && picked.length < choosable.length
                          }}
                          onChange={(ev) => setSelected(ev.target.checked ? choosable.map(keyOf) : [])}
                        />
                      </th>
                    )}
                    {picked.length ? (
                      // While campaigns are selected, the header row holds the bulk actions.
                      <th colSpan={6}>
                        <span className="sint-bulk-bar" role="group" aria-label={__('Selected campaigns', 'social-integrations')}>
                          <span className="sint-bulk-count">{sprintf(__('%d selected', 'social-integrations'), picked.length)}</span>
                          <button type="button" className="sint-bulk-link" onClick={() => { setSelected([]); setArmed('') }}>{__('Clear', 'social-integrations')}</button>
                          <button
                            type="button"
                            className={`sint-bulk-delete${armed === 'bulk' ? ' armed' : ''}`}
                            disabled={busy === 'bulk'}
                            title={__('Shares already sent stay in the share log.', 'social-integrations')}
                            onClick={() => (armed === 'bulk' ? removeMany(picked) : setArmed('bulk'))}
                            onBlur={() => armed === 'bulk' && setArmed('')}
                          >
                            <Icon name="trash" size={14} stroke={2} />
                            {busy === 'bulk' ? __('Wait…', 'social-integrations') : armed === 'bulk' ? __('Click again to delete', 'social-integrations') : __('Delete', 'social-integrations')}
                          </button>
                        </span>
                      </th>
                    ) : (
                      <>
                        <th>{__('Campaign', 'social-integrations')}</th>
                        <th>{__('Accounts', 'social-integrations')}</th>
                        <th>{__('Status', 'social-integrations')}</th>
                        <th>{__('Next', 'social-integrations')}</th>
                        <th>{__('Last shared', 'social-integrations')}</th>
                        <th><span className="sint-sr">{__('Actions', 'social-integrations')}</span></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => {
                    const status = STATUS[c.status] ?? { label: () => c.status, tone: 'muted' }
                    const on = c.accounts.length ? accounts.filter((a) => c.accounts.includes(a.id)) : []
                    const k = keyOf(c)
                    // Pause and Resume turn a campaign on or off, so they need the publish capability.
                    const can = (a: string) => c.actions.includes(a) && (a === 'edit' || a === 'duplicate' || !!handlers[c.type]) && ((a !== 'pause' && a !== 'resume') || userCan(caps.publish))
                    // Every row has the same three places: Pause or Resume, Edit, and a menu of the other actions.
                    const menu: MenuItem[] = [
                      ...(c.sent > 0 ? [{ key: 'log', label: __('Share log', 'social-integrations'), icon: 'log', onSelect: () => go(`log?campaign=${encodeURIComponent(k)}`) }] : []),
                      ...(can('duplicate') ? [{ key: 'duplicate', label: __('Duplicate', 'social-integrations'), icon: 'copy', onSelect: () => open(c, true) }] : []),
                      ...(can('delete')
                        ? [{
                            key: 'delete',
                            label: armed === k ? __('Click again to delete', 'social-integrations') : __('Delete', 'social-integrations'),
                            icon: 'trash',
                            danger: true,
                            disabled: busy === k,
                            onSelect: () => {
                              const first = armed !== k
                              remove(c)
                              return first
                            },
                          }]
                        : []),
                    ]
                    return (
                      <tr key={k} className={selected.includes(k) ? 'selected' : ''}>
                        {choosable.length > 0 && (
                          <td className="sint-check-cell">
                            {deletable(c) && <input type="checkbox" aria-label={sprintf(__('Select %s', 'social-integrations'), c.name)} checked={selected.includes(k)} disabled={busy === 'bulk'} onChange={(ev) => pick(k, ev.target.checked)} />}
                          </td>
                        )}
                        <td className="name">
                          <button type="button" className="sint-camp-name" onClick={() => can('edit') && open(c, false)}>{c.name}</button>
                          <span className="sint-camp-meta">
                            <span className="sint-pill muted">{handlers[c.type]?.label ?? c.type}</span>
                            {c.author && <span className="sint-camp-author">{sprintf(__('by %s', 'social-integrations'), c.author)}</span>}
                          </span>
                        </td>
                        <td className="accts">
                          {c.no_accounts ? (
                            <span style={{ fontSize: 12, color: 'var(--bad-text)' }}>{__('No accounts', 'social-integrations')}</span>
                          ) : c.accounts.length === 0 ? (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{__('All accounts', 'social-integrations')}</span>
                          ) : (
                            <span className="sint-camp-nets" title={on.map((a) => a.name).join(', ')}>
                              {/* One badge for each network, with the number of its accounts. */}
                              {nets(on).slice(0, NETS_SHOWN).map(([net, n]) => (
                                <span key={net} className="sint-camp-net">
                                  <NetBadge network={net} color={network(net)?.color} size={22} />
                                  {n > 1 && <span className="sint-camp-net-n">{n}</span>}
                                </span>
                              ))}
                              {nets(on).length > NETS_SHOWN && <span className="sint-camp-net-more">+{nets(on).length - NETS_SHOWN}</span>}
                              <span className="sint-sr">{sprintf(on.length === 1 ? __('%d account', 'social-integrations') : __('%d accounts', 'social-integrations'), on.length)}</span>
                            </span>
                          )}
                        </td>
                        <td className="status"><span className={`sint-pill ${status.tone}`}>{status.label()}</span></td>
                        <td className="when next" data-label={__('Next', 'social-integrations')}>
                          {c.next_at ? <span className="d">{fmtStamp(c.next_at)}</span> : c.type === 'auto' && c.status === 'active' ? <span className="sint-camp-sub">{__('When you publish a post', 'social-integrations')}</span> : '—'}
                        </td>
                        <td className="when last" data-label={__('Last shared', 'social-integrations')}>
                          {c.last_at ? <span className="d">{fmtStamp(c.last_at)}</span> : '—'}
                          {c.sent > 0 && <span className="sint-camp-sub">{sprintf(__('%d sent', 'social-integrations'), c.sent)}</span>}
                        </td>
                        <td className="acts">
                          <span className="sint-camp-actions">
                            {can('pause') ? (
                              <button type="button" className="sint-btn ghost sm sint-camp-toggle" disabled={busy === k} onClick={() => run(c, 'pause', __('Campaign paused.', 'social-integrations'))}>{__('Pause', 'social-integrations')}</button>
                            ) : can('resume') ? (
                              <button type="button" className="sint-btn ghost sm sint-camp-toggle" disabled={busy === k} onClick={() => run(c, 'resume', __('Campaign resumed.', 'social-integrations'))}>{__('Resume', 'social-integrations')}</button>
                            ) : (
                              toggles && <span className="sint-camp-toggle" aria-hidden="true" />
                            )}
                            {can('edit') && (
                              <button type="button" className="sint-btn ghost sm sint-camp-edit" aria-label={sprintf(__('Edit %s', 'social-integrations'), c.name)} onClick={() => open(c, false)}>
                                <Icon name="edit" size={14} />
                                <span>{__('Edit', 'social-integrations')}</span>
                              </button>
                            )}
                            {menu.length > 0 ? (
                              <Menu label={sprintf(__('More actions for %s', 'social-integrations'), c.name)} items={menu} onClose={() => armed === k && setArmed('')} />
                            ) : (
                              <span className="sint-pc-tool-space" aria-hidden="true" />
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Pagination {...pager} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
