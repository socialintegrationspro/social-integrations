import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header, type PageProps } from '../App'
import { AccountAvatar, Empty, Icon, NetBadge, Segmented, typeColor, useToast } from '../components/ui'
import { api, query } from '../lib/api'
import { config } from '../lib/config'
import { fmtDate, fmtTime, siteParts } from '../lib/format'
import { applyFilters } from '../lib/hooks'
import { __ } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { QueueItem } from '../lib/types'

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21]
const DAY_MS = 86400000

/** Monday (or the site's first day of the week) 00:00 in UTC terms of the site's day. */
function weekStart(offsetWeeks: number): Date {
  const now = new Date()
  const p = siteParts(now)
  const today = new Date(Date.UTC(p.y, p.m - 1, p.d))
  const diff = (today.getUTCDay() - config.weekStart + 7) % 7
  return new Date(today.getTime() - diff * DAY_MS + offsetWeeks * 7 * DAY_MS)
}

export function CalendarPage({ openComposer }: PageProps) {
  const { accounts, network, postTypes } = useStore()
  const toast = useToast()
  const [view, setView] = useState<'week' | 'list'>('week')
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<QueueItem[] | null>(null)
  const [hidden, setHidden] = useState<string[]>([])

  const start = useMemo(() => weekStart(offset), [offset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS)), [start])

  const load = useCallback(() => {
    // Ask a day either side, because the site's time zone shifts the week edges.
    const from = new Date(start.getTime() - DAY_MS).toISOString()
    const to = new Date(start.getTime() + 8 * DAY_MS).toISOString()
    setItems(null)
    api.get<QueueItem[]>(`queue?${query({ from, to })}`).then((r) => setItems(r.data), () => setItems([]))
  }, [start])
  useEffect(load, [load])

  const types = postTypes.map((t) => t.name)
  const todayKey = siteParts(new Date()).key
  const now = siteParts(new Date())
  const visible = (items ?? []).filter((i) => !hidden.includes(i.post?.type ?? ''))

  const retry = async (item: QueueItem) => {
    try {
      const r = await api.post<{ status: string; message: string }>(`queue/${item.id}/retry`)
      toast(r.data.status === 'published' ? __('Shared.') : r.data.message, r.data.status !== 'published')
      load()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const card = (item: QueueItem) => {
    const net = network(item.network)
    return (
      <div key={item.id} className={`sint-pc ${item.status}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div className="sint-nets">
            <NetBadge network={item.network} color={net?.color} />
          </div>
          <StatusPill item={item} />
        </div>
        <div className="t">{item.post?.title || item.caption.slice(0, 80) || __('Post')}</div>
        <div className="m">
          {item.post && <span className="sint-type-dot" style={{ background: typeColor(types, item.post.type) }} />}
          {item.post ? postTypes.find((t) => t.name === item.post!.type)?.singular ?? item.post.type : __('Post')}
          {item.status !== 'scheduled' && ` · ${fmtTime(item.scheduled_at)}`}
        </div>
        {item.status === 'failed' && (
          <button type="button" className="sint-btn danger sm" style={{ height: 30 }} onClick={() => retry(item)}>
            {__('Retry')}
          </button>
        )}
      </div>
    )
  }

  // Filter `sint.calendar.view`: another plugin may supply a different calendar body.
  const CustomView = applyFilters<null | ((p: { items: QueueItem[]; days: Date[]; reload: () => void }) => JSX.Element)>('sint.calendar.view', null, view)

  return (
    <>
      <Header title={__('Calendar')}>
        <button type="button" className="sint-btn primary" onClick={() => openComposer()}>
          <Icon name="plus" size={16} stroke={2.4} />
          {__('Create post')}
        </button>
      </Header>
      <div className="sint-cal-layout">
        <aside className="sint-cal-side">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 6px' }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{__('Channels')}</span>
              <a href="#/accounts" style={{ fontSize: 13, fontWeight: 600 }}>{__('Manage')}</a>
            </div>
            {accounts.length === 0 && (
              <div style={{ padding: '8px 6px', color: 'var(--muted)', fontSize: 13 }}>
                {__('No accounts yet.')} <a href="#/accounts">{__('Connect an account')}</a>
              </div>
            )}
            {accounts.map((a) => (
              <div key={a.id} className="sint-channel">
                <AccountAvatar account={a} network={network(a.network)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || a.username}</div>
                  {a.status === 'expired' ? (
                    <a href="#/accounts" style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>
                      {network(a.network)?.label} · {__('Reconnect')}
                    </a>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{network(a.network)?.label}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 6px' }}>
            <div className="sint-label" style={{ paddingBottom: 6 }}>{__('Post types')}</div>
            {postTypes.map((t) => (
              <label key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, minHeight: 32 }}>
                <input type="checkbox" checked={!hidden.includes(t.name)} onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((x) => x !== t.name) : [...h, t.name]))} />
                <span className="sint-type-dot" style={{ background: typeColor(types, t.name) }} />
                {t.label}
              </label>
            ))}
          </div>
        </aside>

        <section className="sint-cal-main">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)' }}>
              <button type="button" className="sint-icon-btn" style={{ border: 0, background: 'transparent', height: 42 }} aria-label={__('Previous week')} onClick={() => setOffset((o) => o - 1)}>
                <Icon name="left" size={16} stroke={2} />
              </button>
              <span style={{ padding: '0 12px', fontWeight: 600, borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', height: 42, display: 'flex', alignItems: 'center' }}>
                {fmtDate(days[0]!.toISOString())} – {fmtDate(days[6]!.toISOString())}
              </span>
              <button type="button" className="sint-icon-btn" style={{ border: 0, background: 'transparent', height: 42 }} aria-label={__('Next week')} onClick={() => setOffset((o) => o + 1)}>
                <Icon name="right" size={16} stroke={2} />
              </button>
            </div>
            <button type="button" className="sint-btn" onClick={() => setOffset(0)}>{__('Today')}</button>
            <div style={{ marginLeft: 'auto' }}>
              <Segmented label={__('View')} value={view} onChange={setView} options={[{ value: 'week', label: __('Week') }, { value: 'list', label: __('List') }]} />
            </div>
          </div>

          {items === null ? (
            <div className="sint-skeleton" style={{ height: 420 }} />
          ) : CustomView ? (
            <CustomView items={visible} days={days} reload={load} />
          ) : view === 'list' ? (
            visible.length === 0 ? (
              <Empty title={__('Nothing planned this week')}>
                <button type="button" className="sint-btn primary" onClick={() => openComposer()}>{__('Create post')}</button>
              </Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visible.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--raised)', borderRadius: 14 }}>
                    <div style={{ width: 120, color: 'var(--muted)', fontSize: 13 }}>{fmtDate(item.scheduled_at)} · {fmtTime(item.scheduled_at)}</div>
                    <NetBadge network={item.network} color={network(item.network)?.color} size={24} />
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.post?.title || item.caption}</div>
                    <StatusPill item={item} />
                    {item.status === 'failed' && <button type="button" className="sint-btn danger sm" onClick={() => retry(item)}>{__('Retry')}</button>}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div className="sint-week">
                <div />
                {days.map((d) => {
                  const key = d.toISOString().slice(0, 10)
                  const isToday = key === todayKey
                  return (
                    <div key={key} className={`th${isToday ? ' today' : ''}`}>
                      <b>
                        {isToday && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} />}
                        {isToday ? __('Today') : d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
                      </b>
                      <span>{d.getUTCDate()}</span>
                    </div>
                  )
                })}
                {HOURS.map((h) => (
                  <Row key={h} hour={h} days={days} items={visible} todayKey={todayKey} now={now} card={card} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Row({ hour, days, items, todayKey, now, card }: { hour: number; days: Date[]; items: QueueItem[]; todayKey: string; now: ReturnType<typeof siteParts>; card: (i: QueueItem) => JSX.Element }) {
  return (
    <>
      <div className="tm">{String(hour).padStart(2, '0')}:00</div>
      {days.map((d) => {
        const key = d.toISOString().slice(0, 10)
        const inCell = items.filter((i) => {
          const p = siteParts(new Date(i.scheduled_at))
          return p.key === key && p.h >= hour && p.h < hour + 3
        })
        const past = key < todayKey || (key === todayKey && now.h >= hour + 3)
        const isToday = key === todayKey
        const nowHere = isToday && now.h >= hour && now.h < hour + 3
        return (
          <div key={key} className={`cell${past ? ' past' : isToday ? ' today' : ''}`}>
            {nowHere && <div className="now" style={{ top: `${(((now.h - hour) * 60 + now.min) / 180) * 100}%` }} aria-hidden="true" />}
            {inCell.map(card)}
          </div>
        )
      })}
    </>
  )
}

function StatusPill({ item }: { item: QueueItem }) {
  switch (item.status) {
    case 'published':
      return <span className="sint-pill ok">{__('Published')}</span>
    case 'failed':
      return <span className="sint-pill bad">{__('Failed')}</span>
    case 'draft':
      return <span className="sint-pill muted">{__('Draft')}</span>
    case 'sending':
      return <span className="sint-pill accent">{__('Sending')}</span>
    default:
      return <span className="sint-pill accent">{fmtTime(item.scheduled_at)}</span>
  }
}
