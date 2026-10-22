import { useEffect, useState } from 'react'
import { Header, type PageProps } from '../App'
import { Empty, Icon, NetBadge } from '../components/ui'
import { api } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { __ } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { LogItem } from '../lib/types'

export function LogPage(_props: PageProps) {
  const { network } = useStore()
  const [rows, setRows] = useState<LogItem[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'failed'>('all')

  useEffect(() => {
    api.get<LogItem[]>('logs').then((r) => setRows(r.data), () => setRows([]))
  }, [])

  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === 'failed')

  return (
    <>
      <Header title={__('Share log')}>
        <div className="sint-seg" role="group" aria-label={__('Filter')}>
          <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{__('All')}</button>
          <button type="button" className={filter === 'failed' ? 'on' : ''} onClick={() => setFilter('failed')}>{__('Failed')}</button>
        </div>
      </Header>
      <div className="sint-body">
        <div className="sint-table-wrap">
          {rows === null ? (
            <div className="sint-skeleton" style={{ height: 300, margin: 12 }} />
          ) : shown.length === 0 ? (
            <Empty title={__('No shares yet')}>{__('Each share to a network appears here with its result.')}</Empty>
          ) : (
            <table className="sint-table">
              <thead><tr><th>{__('Date')}</th><th>{__('Network')}</th><th>{__('Content')}</th><th>{__('Result')}</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td>
                    <td><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><NetBadge network={r.network} color={network(r.network)?.color} size={22} />{network(r.network)?.label ?? r.network}</span></td>
                    <td style={{ fontWeight: 600 }}>{r.post_title || __('Written in the composer')}</td>
                    <td>
                      {r.status === 'published' ? <span className="sint-pill ok">{__('Published')}</span> : <span className="sint-pill bad">{__('Failed')}</span>}
                      {r.message && <div style={{ fontSize: 12, color: 'var(--bad-text)', marginTop: 4 }}>{r.message}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.remote_url && <a href={r.remote_url} target="_blank" rel="noreferrer" className="sint-btn sm">{__('View')} <Icon name="external" size={14} /></a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
