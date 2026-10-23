import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { m } from 'motion/react'
import { easeOut } from '../lib/motion'
import { Header, type PageProps } from '../components/Header'
import { AccountAvatar, Empty, Icon, NetBadge, Segmented, typeColor, useToast } from '../components/ui'
import { api, query } from '../lib/api'
import { config } from '../lib/config'
import { fmtDate, fmtTime, siteParts } from '../lib/format'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { QueueItem } from '../lib/types'
import type { ComposerSeed } from './Composer'

/**
 * A calendar view. Filter `sint.calendar.views` adds views to the switcher; filter
 * `sint.calendar.view` supplies the body for a view free does not draw itself.
 */
export interface CalendarViewDef {
  value: string
  label: string
  /**
   * The days the view shows, `offset` steps from the current period. `start` is a
   * site-time day at 00:00 UTC, like the week's days. Without it the view shows a week.
   */
  period?: (offset: number) => { start: Date; days: number; title?: string }
}

export interface CalendarViewProps {
  items: QueueItem[]
  days: Date[]
  reload: () => void
  openComposer: (seed?: ComposerSeed) => void
  /** Free's card for one share. */
  card: (item: QueueItem) => JSX.Element
}

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
  const [view, setView] = useState('week')
  const [offset, setOffset] = useState(0)
  // -1 or 1: the period slides in from that side. 0: it fades in.
  const [dir, setDir] = useState(0)
  const move = (to: number) => {
    setDir(Math.sign(to - offset))
    setOffset(to)
  }
  const [items, setItems] = useState<QueueItem[] | null>(null)
  const [hidden, setHidden] = useState<string[]>([])

  // Filter `sint.calendar.views`: other plugins add views to the switcher.
  const views = applyFilters<CalendarViewDef[]>('sint.calendar.views', [
    { value: 'week', label: __('Week', 'social-integrations') },
    { value: 'list', label: __('List', 'social-integrations') },
  ])
  const def = views.find((v) => v.value === view) ?? views[0]!
  // A view's period depends only on the view and the offset.
  const period = useMemo(() => def.period?.(offset) ?? { start: weekStart(offset), days: 7 }, [def.value, offset])
  const start = period.start
  const days = useMemo(() => Array.from({ length: period.days }, (_, i) => new Date(start.getTime() + i * DAY_MS)), [start, period.days])

  const load = useCallback(() => {
    // Request one more day on each side, because the site's time zone moves the edges of the period.
    const from = new Date(start.getTime() - DAY_MS).toISOString()
    const to = new Date(start.getTime() + (period.days + 1) * DAY_MS).toISOString()
    setItems(null)
    api.get<QueueItem[]>(`queue?${query({ from, to })}`).then((r) => setItems(r.data), () => setItems([]))
  }, [start, period.days])
  useEffect(load, [load])

  // The week grid scrolls in its own box. When it shows today, it opens at the current time.
  const body = useRef<HTMLDivElement>(null)
  const loaded = items !== null
  useEffect(() => {
    const box = body.current
    if (!loaded || !box) return
    const row = box.querySelector<HTMLElement>('.sint-week .cell.today:has(.now)')
    const head = box.querySelector<HTMLElement>('.sint-week.head')
    // Measure from the box itself: the row's offsetParent is an outer panel.
    const top = row ? row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop : 0
    box.scrollTop = row ? Math.max(0, top - (head?.offsetHeight ?? 0) - 12) : 0
  }, [loaded, view, offset])

  const types = postTypes.map((t) => t.name)
  const todayKey = siteParts(new Date()).key
  const now = siteParts(new Date())
  const visible = (items ?? []).filter((i) => !hidden.includes(i.post?.type ?? ''))

  const retry = async (item: QueueItem) => {
    try {
      const r = await api.post<{ status: string; message: string }>(`queue/${item.id}/retry`)
      toast(r.data.status === 'published' ? __('Shared.', 'social-integrations') : r.data.message, r.data.status !== 'published')
      load()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const publish = async (item: QueueItem) => {
    try {
      const r = await api.post<{ result?: { status: string; message: string } }>(`queue/${item.id}`, { draft: false, scheduled_at: '' })
      const ok = r.data.result?.status === 'published'
      toast(ok ? __('Shared.', 'social-integrations') : r.data.result?.message ?? '', !ok)
      load()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const remove = async (item: QueueItem) => {
    try {
      await api.del(`queue/${item.id}`)
      toast(__('Share deleted.', 'social-integrations'))
      load()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const label = (item: QueueItem) => item.post?.title || item.caption.slice(0, 80) || __('Post', 'social-integrations')
  // The caption adds something only when the card's title is the post's.
  const snippet = (item: QueueItem) => (item.post?.title && item.caption.trim() !== item.post.title ? item.caption.trim() : '')
  const account = (item: QueueItem) => accounts.find((a) => a.id === item.account_id)

  // Shares that the plugin did not send yet open in the composer; sent shares are a record.
  const title = (item: QueueItem) =>
    editable(item) ? (
      <button type="button" className="sint-pc-open" title={item.caption} onClick={() => openComposer({ item })}>
        <span className="t">{label(item)}</span>
      </button>
    ) : (
      <div className="t">{label(item)}</div>
    )

  const actions = (item: QueueItem, height?: number) => (
    <>
      {item.status === 'draft' && (
        <button type="button" className="sint-btn primary sm" style={{ height }} onClick={() => publish(item)}>
          {__('Publish', 'social-integrations')}
        </button>
      )}
      {item.status === 'failed' && (
        <button type="button" className="sint-btn danger sm" style={{ height }} onClick={() => retry(item)}>
          {__('Retry', 'social-integrations')}
        </button>
      )}
      <span className="sint-pc-tools">
        {item.remote_url && (
          <a className="sint-pc-tool" href={item.remote_url} target="_blank" rel="noreferrer" aria-label={__('Open the post on the network', 'social-integrations')} title={__('Open the post on the network', 'social-integrations')}>
            <Icon name="external" size={14} stroke={2} />
          </a>
        )}
        <button type="button" className="sint-pc-tool" aria-label={__('Duplicate', 'social-integrations')} title={__('Duplicate', 'social-integrations')} onClick={() => openComposer({ copy: item })}>
          <Icon name="copy" size={14} stroke={2} />
        </button>
        {item.status !== 'sending' && item.status !== 'published' && <DeleteButton onConfirm={() => remove(item)} />}
      </span>
    </>
  )

  const card = (item: QueueItem) => {
    const net = network(item.network)
    const acct = account(item)
    const thumb = item.media.find((m) => m.type === 'image')?.url || item.post?.thumbnail
    const text = snippet(item)
    return (
      <div key={item.id} className={`sint-pc ${item.status}`}>
        <div className="sint-pc-who">
          {acct ? <AccountAvatar account={acct} network={net} /> : <NetBadge network={item.network} color={net?.color} />}
          <span className="n">{acct?.name || acct?.username || net?.label}</span>
          {thumb && <img className="sint-pc-thumb" src={thumb} alt="" />}
        </div>
        {title(item)}
        {text && <div className="c">{text}</div>}
        <div className="m">
          <StatusPill item={item} />
          {item.status !== 'scheduled' && <span>{fmtTime(item.scheduled_at)}</span>}
          {item.media.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} aria-label={`${item.media.length} ${__('media', 'social-integrations')}`}>
              <Icon name="image" size={12} stroke={2} />
              {item.media.length}
            </span>
          )}
          {item.post && (
            <span className="sint-type-dot" style={{ background: typeColor(types, item.post.type) }} title={postTypes.find((t) => t.name === item.post!.type)?.singular ?? item.post.type} />
          )}
        </div>
        {item.status === 'failed' && item.message && <div className="e">{item.message}</div>}
        <div className="sint-pc-act">{actions(item, 30)}</div>
      </div>
    )
  }

  // Filter `sint.calendar.view`: another plugin can supply a different calendar body.
  const CustomView = applyFilters<null | ((p: CalendarViewProps) => JSX.Element)>('sint.calendar.view', null, view)

  return (
    <>
      <Header title={__('Calendar', 'social-integrations')}>
        <button type="button" className="sint-btn primary" onClick={() => openComposer()}>
          <Icon name="plus" size={16} stroke={2.4} />
          {__('New campaign', 'social-integrations')}
        </button>
      </Header>
      <div className="sint-cal-layout">
        <aside className="sint-cal-side">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 6px' }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{__('Accounts', 'social-integrations')}</span>
              <a href="#/accounts" style={{ fontSize: 13, fontWeight: 600 }}>{__('Manage', 'social-integrations')}</a>
            </div>
            {accounts.length === 0 && (
              <div style={{ padding: '8px 6px', color: 'var(--muted)', fontSize: 13 }}>
                {__('No accounts yet.', 'social-integrations')} <a href="#/accounts">{__('Connect an account', 'social-integrations')}</a>
              </div>
            )}
            {accounts.map((a) => (
              <div key={a.id} className="sint-channel">
                <AccountAvatar account={a} network={network(a.network)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || a.username}</div>
                  {a.status === 'expired' ? (
                    <a href="#/accounts" style={{ fontSize: 12, color: 'var(--warn-text)', fontWeight: 600 }}>
                      {network(a.network)?.label} · {__('Reconnect', 'social-integrations')}
                    </a>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{network(a.network)?.label}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 6px' }}>
            <div className="sint-label" style={{ paddingBottom: 6 }}>{__('Post types', 'social-integrations')}</div>
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
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--field-border)', borderRadius: 999, background: 'var(--field)' }}>
              <button type="button" className="sint-icon-btn" style={{ border: 0, background: 'transparent', height: 42 }} aria-label={__('Previous', 'social-integrations')} onClick={() => move(offset - 1)}>
                <Icon name="left" size={16} stroke={2} />
              </button>
              <span style={{ padding: '0 12px', fontWeight: 600, borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', height: 42, display: 'flex', alignItems: 'center' }}>
                {period.title ?? `${fmtDate(days[0]!.toISOString())} – ${fmtDate(days[days.length - 1]!.toISOString())}`}
              </span>
              <button type="button" className="sint-icon-btn" style={{ border: 0, background: 'transparent', height: 42 }} aria-label={__('Next', 'social-integrations')} onClick={() => move(offset + 1)}>
                <Icon name="right" size={16} stroke={2} />
              </button>
            </div>
            <button type="button" className="sint-btn" onClick={() => move(0)}>{__('Today', 'social-integrations')}</button>
            <div style={{ marginLeft: 'auto' }}>
              <Segmented label={__('View', 'social-integrations')} value={def.value} onChange={(v) => { setView(v); setDir(0); setOffset(0) }} options={views.map((v) => ({ value: v.value, label: v.label }))} />
            </div>
          </div>

          <div className="sint-cal-body" ref={body}>
          <m.div key={`${view}-${offset}`} initial={{ opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: easeOut }}>
          {items === null ? (
            <div className="sint-skeleton" style={{ height: 420 }} />
          ) : CustomView ? (
            <CustomView items={visible} days={days} reload={load} openComposer={openComposer} card={card} />
          ) : view === 'list' ? (
            visible.length === 0 ? (
              <Empty title={__('No shares this week', 'social-integrations')}>
                <button type="button" className="sint-btn primary" onClick={() => openComposer()}>{__('New campaign', 'social-integrations')}</button>
              </Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visible.map((item) => (
                  <div key={item.id} className="sint-pc-row sint-list-row">
                    <div className="sint-list-when">{fmtDate(item.scheduled_at)} · {fmtTime(item.scheduled_at)}</div>
                    {account(item) ? <AccountAvatar account={account(item)!} network={network(item.network)} /> : <NetBadge network={item.network} color={network(item.network)?.color} size={24} />}
                    <div className="sint-list-body">
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title(item)}</div>
                      <div style={{ fontSize: 12, color: item.status === 'failed' && item.message ? 'var(--bad-text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.status === 'failed' && item.message ? item.message : [account(item)?.name, snippet(item)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {item.media.length > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                        <Icon name="image" size={14} stroke={2} />
                        {item.media.length}
                      </span>
                    )}
                    <StatusPill item={item} />
                    {actions(item)}
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <div className="sint-week head">
                <div />
                {days.map((d) => {
                  const key = d.toISOString().slice(0, 10)
                  const isToday = key === todayKey
                  return (
                    <div key={key} className={`th${isToday ? ' today' : ''}`}>
                      <b>
                        {isToday && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--today)' }} />}
                        {isToday ? __('Today', 'social-integrations') : d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
                      </b>
                      <span>{d.getUTCDate()}</span>
                    </div>
                  )
                })}
              </div>
              <div className="sint-week">
                {HOURS.map((h) => (
                  <Row key={h} hour={h} days={days} items={visible} todayKey={todayKey} now={now} card={card} />
                ))}
              </div>
            </>
          )}
          </m.div>
          </div>
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
            <CellCards items={inCell} card={card} />
          </div>
        )
      })}
    </>
  )
}

// A busy cell shows the first few shares and a button for the rest, so one day does not stretch the week.
const CELL_MAX = 3

function CellCards({ items, card }: { items: QueueItem[]; card: (i: QueueItem) => JSX.Element }) {
  const [all, setAll] = useState(false)
  if (all || items.length <= CELL_MAX + 1) return <>{items.map(card)}</>
  return (
    <>
      {items.slice(0, CELL_MAX).map(card)}
      <button type="button" className="sint-more" onClick={() => setAll(true)}>
        {sprintf(__('%d more', 'social-integrations'), items.length - CELL_MAX)}
      </button>
    </>
  )
}

function editable(item: QueueItem): boolean {
  return item.status === 'draft' || item.status === 'scheduled' || item.status === 'failed'
}

function StatusPill({ item }: { item: QueueItem }) {
  switch (item.status) {
    case 'published':
      return <span className="sint-pill ok">{__('Published', 'social-integrations')}</span>
    case 'failed':
      return <span className="sint-pill bad">{__('Failed', 'social-integrations')}</span>
    case 'draft':
      return <span className="sint-pill muted">{__('Draft', 'social-integrations')}</span>
    case 'sending':
      return <span className="sint-pill accent">{__('In progress', 'social-integrations')}</span>
    default:
      return <span className="sint-pill accent">{fmtTime(item.scheduled_at)}</span>
  }
}

/** Deletes on a second click, so one accidental tap does not delete a share. */
function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button type="button" className={`sint-pc-tool${armed ? ' armed' : ''}`} aria-label={armed ? __('Click again to delete', 'social-integrations') : __('Delete', 'social-integrations')} title={armed ? __('Click again to delete', 'social-integrations') : __('Delete', 'social-integrations')} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      <Icon name={armed ? 'check' : 'trash'} size={14} stroke={2} />
    </button>
  )
}
