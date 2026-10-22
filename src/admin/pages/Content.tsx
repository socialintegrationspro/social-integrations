import { useEffect, useState } from 'react'
import { Header, type PageProps } from '../App'
import { Empty, Icon, NetBadge, typeColor } from '../components/ui'
import { api, query } from '../lib/api'
import { fmtDate, fmtDateTime } from '../lib/format'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { ContentItem } from '../lib/types'

export function ContentPage({ openComposer }: PageProps) {
  const { postTypes, accounts, network } = useStore()
  const [type, setType] = useState('any')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ContentItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [selected, setSelected] = useState<number[]>([])

  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 300)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => setPage(1), [type, term])
  useEffect(() => {
    setItems(null)
    api
      .get<ContentItem[]>(`content?${query({ type, search: term, page, per_page: 20 })}`)
      .then((r) => {
        setItems(r.data)
        setTotal(r.total)
        setPages(r.totalPages || 1)
      })
      .catch(() => setItems([]))
  }, [type, term, page])

  const types = postTypes.map((t) => t.name)
  const all = postTypes.reduce((n, t) => n + t.count, 0)
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <>
      <Header title={__('Content')}>
        <label className="sint-search">
          <Icon name="search" size={16} stroke={2} />
          <span className="sint-sr">{__('Search content')}</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={__('Search titles and text')} />
        </label>
      </Header>
      <div className="sint-body">
        <p className="sint-sub">{__('Everything on your site that has a public page, from every post type. Share any item.')}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="tablist" aria-label={__('Post type')}>
          <button type="button" role="tab" aria-selected={type === 'any'} className={`sint-chip${type === 'any' ? ' on' : ''}`} onClick={() => setType('any')}>
            {__('All types')} <span className="count">{all}</span>
          </button>
          {postTypes.map((t) => (
            <button key={t.name} type="button" role="tab" aria-selected={type === t.name} className={`sint-chip${type === t.name ? ' on' : ''}`} onClick={() => setType(t.name)}>
              <span className="sint-type-dot" style={{ background: typeColor(types, t.name) }} />
              {t.label} <span className="count">{t.count}</span>
            </button>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="sint-banner" style={{ background: 'var(--accent-soft)', border: '1px solid #4b2fa0', padding: '10px 14px' }}>
            <strong>{sprintf(__('%d selected'), selected.length)}</strong>
            <button type="button" className="sint-btn primary sm" onClick={() => openComposer({ postId: selected[0] })}>{__('Share the first one')}</button>
            <button type="button" className="sint-btn ghost sm" style={{ marginLeft: 'auto', border: 0 }} onClick={() => setSelected([])}>{__('Clear')}</button>
          </div>
        )}

        <div className="sint-table-wrap">
          {items === null ? (
            <div className="sint-skeleton" style={{ height: 360, margin: 12 }} />
          ) : items.length === 0 ? (
            <Empty title={term ? __('Nothing matches your search') : __('No published content of this type')} />
          ) : (
            <table className="sint-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}><span className="sint-sr">{__('Select')}</span></th>
                  <th>{__('Title')}</th>
                  <th>{__('Type')}</th>
                  <th>{__('Published')}</th>
                  <th>{__('Shared to')}</th>
                  <th style={{ textAlign: 'right' }}>{__('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const pt = postTypes.find((t) => t.name === item.type)
                  const failed = item.shares.find((s) => s.status === 'failed')
                  const last = item.shares.find((s) => s.status === 'published')
                  return (
                    <tr key={item.id} className={selected.includes(item.id) ? 'selected' : ''}>
                      <td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={sprintf(__('Select %s'), item.title)} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          {item.thumbnail ? <img className="sint-thumb" src={item.thumbnail} alt="" /> : <span className="sint-thumb" />}
                          <div style={{ minWidth: 0 }}>
                            <a href={item.edit_link} style={{ fontWeight: 700, color: 'var(--text)' }}>{item.title || __('(no title)')}</a>
                            <div style={{ fontSize: 12, color: 'var(--faint)' }}>{item.author}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="sint-pill muted">
                          <span className="sint-type-dot" style={{ background: typeColor(types, item.type) }} />
                          {pt?.singular ?? item.type}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-2)' }}>{item.status === 'publish' ? fmtDate(item.date) : item.status}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {accounts.map((a) => {
                            const share = item.shares.find((s) => s.account_id === a.id)
                            return (
                              <span key={a.id} style={{ position: 'relative', opacity: share ? 1 : 0.3 }} title={share ? `${share.status} · ${fmtDateTime(share.date)}` : __('Not shared')}>
                                <NetBadge network={a.network} color={network(a.network)?.color} size={22} />
                                {share && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: 999, border: '2px solid var(--table)', background: share.status === 'published' ? 'var(--ok)' : 'var(--bad)' }} />}
                              </span>
                            )
                          })}
                        </div>
                        {failed ? (
                          <div style={{ fontSize: 11, color: 'var(--bad-text)', marginTop: 4, fontWeight: 600 }}>{failed.message}</div>
                        ) : last ? (
                          <div style={{ fontSize: 11, color: 'var(--ok-text)', marginTop: 4, fontWeight: 600 }}>{sprintf(__('Shared %s'), fmtDateTime(last.date))}</div>
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>{__('Not shared')}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className={`sint-btn sm${item.shares.length ? '' : ' primary'}`} onClick={() => openComposer({ postId: item.id })}>
                          {item.shares.length ? __('Share again') : __('Share')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 13 }}>
          <span>{sprintf(__('%d items'), total)}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button type="button" className="sint-btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{__('Previous')}</button>
            <span style={{ alignSelf: 'center' }}>{sprintf(__('Page %1$d of %2$d'), page, pages)}</span>
            <button type="button" className="sint-btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{__('Next')}</button>
          </div>
        </div>
      </div>
    </>
  )
}
