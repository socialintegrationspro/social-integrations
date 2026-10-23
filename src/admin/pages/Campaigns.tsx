import { useEffect, useState } from 'react'
import { Header, type PageProps } from '../App'
import { Empty, Icon, NetBadge, Pagination, usePaged, useToast } from '../components/ui'
import { api } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'

/** A row of GET campaigns. */
export interface CampaignItem {
  id: number | string
  type: string
  name: string
  /** Empty: every account. */
  accounts: string[]
  status: string
  next_at: string
  last_at: string
  sent: number
  total: number
  updated_at: string
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
  active: { label: () => __('Active'), tone: 'ok' },
  scheduled: { label: () => __('Scheduled'), tone: 'accent' },
  draft: { label: () => __('Draft'), tone: 'muted' },
  failed: { label: () => __('Failed'), tone: 'bad' },
  published: { label: () => __('Shared'), tone: 'ok' },
  paused: { label: () => __('Paused'), tone: 'warn' },
  ended: { label: () => __('Ended'), tone: 'muted' },
}

/** Every campaign: single posts, auto-post rules and the types other plugins add. */
export function CampaignsPage({ openComposer }: PageProps) {
  const { accounts, network } = useStore()
  const toast = useToast()
  const [items, setItems] = useState<CampaignItem[] | null>(null)
  const [filter, setFilter] = useState('all')
  const [armed, setArmed] = useState('')
  const [busy, setBusy] = useState('')

  const load = () => api.get<CampaignItem[]>('campaigns').then((r) => setItems(r.data), () => setItems([]))
  useEffect(() => {
    load()
  }, [])

  // Filter `sint.campaigns.actions`: buttons for other campaign types, keyed by type.
  const handlers = applyFilters<Record<string, CampaignActions>>('sint.campaigns.actions', {
    single: { label: __('Single post'), remove: (c) => api.del(`campaigns/${c.id}`) },
    auto: {
      label: __('Auto-post'),
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
      toast(done)
      await load()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setBusy('')
    setArmed('')
  }
  const remove = (c: CampaignItem) => {
    if (armed !== keyOf(c)) return setArmed(keyOf(c))
    run(c, 'remove', __('Campaign deleted. Shares already sent stay in the share log.'))
  }
  const open = (c: CampaignItem, copy: boolean) => openComposer({ campaign: { type: c.type, id: c.id, accounts: c.accounts, copy } })

  const types = Array.from(new Set((items ?? []).map((c) => c.type)))
  const shown = (items ?? []).filter((c) => filter === 'all' || c.type === filter)
  const { rows: pageRows, pager } = usePaged(shown, filter)

  return (
    <>
      <Header title={__('Campaigns')}>
        <button type="button" className="sint-btn primary" onClick={() => openComposer()}>
          <Icon name="plus" size={16} stroke={2.4} />
          {__('New campaign')}
        </button>
      </Header>
      <div className="sint-body">
        {items === null ? (
          <div className="sint-skeleton" style={{ height: 320 }} />
        ) : items.length === 0 ? (
          <Empty title={__('No campaigns yet')}>
            <p className="sint-sub">{__('Share one post now or later, schedule many posts, or share new posts when they are published.')}</p>
            <button type="button" className="sint-btn primary" onClick={() => openComposer()}>{__('New campaign')}</button>
          </Empty>
        ) : (
          <>
            {types.length > 1 && (
              <div className="sint-seg" role="tablist" aria-label={__('Campaign type')} style={{ alignSelf: 'flex-start' }}>
                <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{__('All')}</button>
                {types.map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={filter === t} className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>{handlers[t]?.label ?? t}</button>
                ))}
              </div>
            )}
            <div className="sint-table-wrap">
              <table className="sint-table">
                <thead>
                  <tr>
                    <th>{__('Campaign')}</th>
                    <th>{__('Accounts')}</th>
                    <th>{__('Status')}</th>
                    <th>{__('Next')}</th>
                    <th>{__('Last shared')}</th>
                    <th><span className="sint-sr">{__('Actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => {
                    const status = STATUS[c.status] ?? { label: () => c.status, tone: 'muted' }
                    const on = c.accounts.length ? accounts.filter((a) => c.accounts.includes(a.id)) : []
                    const k = keyOf(c)
                    const can = (a: string) => c.actions.includes(a) && (a === 'edit' || a === 'duplicate' || !!handlers[c.type])
                    return (
                      <tr key={k}>
                        <td>
                          <button type="button" className="sint-camp-name" onClick={() => can('edit') && open(c, false)}>{c.name}</button>
                          <span className="sint-pill muted">{handlers[c.type]?.label ?? c.type}</span>
                        </td>
                        <td>
                          {c.accounts.length === 0 ? (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{__('All accounts')}</span>
                          ) : (
                            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} title={on.map((a) => a.name).join(', ')}>
                              {on.map((a) => <NetBadge key={a.id} network={a.network} color={network(a.network)?.color} size={22} />)}
                            </span>
                          )}
                        </td>
                        <td><span className={`sint-pill ${status.tone}`}>{status.label()}</span></td>
                        <td>{c.next_at ? fmtDateTime(c.next_at) : c.type === 'auto' && c.status === 'active' ? <span style={{ color: 'var(--muted)' }}>{__('When a post is published')}</span> : '—'}</td>
                        <td>{c.last_at ? fmtDateTime(c.last_at) : '—'}{c.sent > 0 && <span style={{ color: 'var(--muted)' }}> · {sprintf(__('%d sent'), c.sent)}</span>}</td>
                        <td>
                          <span className="sint-camp-actions">
                            {can('pause') && <button type="button" className="sint-btn ghost sm" disabled={busy === k} onClick={() => run(c, 'pause', __('Campaign paused.'))}>{__('Pause')}</button>}
                            {can('resume') && <button type="button" className="sint-btn ghost sm" disabled={busy === k} onClick={() => run(c, 'resume', __('Campaign resumed.'))}>{__('Resume')}</button>}
                            {c.sent > 0 && <a className="sint-pc-tool" href={`#/log?campaign=${encodeURIComponent(k)}`} aria-label={sprintf(__('Share log of %s'), c.name)} title={__('Share log')}><Icon name="log" size={15} /></a>}
                            {can('edit') && <button type="button" className="sint-pc-tool" aria-label={sprintf(__('Edit %s'), c.name)} title={__('Edit')} onClick={() => open(c, false)}><Icon name="edit" size={15} /></button>}
                            {can('duplicate') && <button type="button" className="sint-pc-tool" aria-label={sprintf(__('Duplicate %s'), c.name)} title={__('Duplicate')} onClick={() => open(c, true)}><Icon name="copy" size={15} /></button>}
                            {can('delete') && (
                              <button type="button" className={`sint-pc-tool${armed === k ? ' armed' : ''}`} disabled={busy === k} aria-label={armed === k ? __('Click again to delete') : sprintf(__('Delete %s'), c.name)} title={armed === k ? __('Click again to delete') : __('Delete')} onBlur={() => setArmed('')} onClick={() => remove(c)}>
                                <Icon name="trash" size={15} />
                              </button>
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
