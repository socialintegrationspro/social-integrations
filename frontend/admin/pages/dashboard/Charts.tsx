import { m } from 'motion/react'
import { NetBadge } from '../../components/ui'
import { CountUp, easeOut } from '../../lib/motion'
import { __, sprintf } from '../../lib/i18n'
import type { DashboardData, Network } from '../../lib/types'

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0)

/** Site dates ('Y-m-d') are calendar days, so they format in UTC to keep the day. */
const dayLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

/** Shares by status as one labelled strip: shared, scheduled, failed, drafts. */
export function StatusStrip({ totals }: { totals: DashboardData['totals'] }) {
  const parts = [
    { key: 'shared', label: __('Shared', 'social-integrations'), n: totals.published },
    { key: 'scheduled', label: __('Scheduled', 'social-integrations'), n: totals.scheduled },
    { key: 'failed', label: __('Failed', 'social-integrations'), n: totals.failed },
    { key: 'drafts', label: __('Drafts', 'social-integrations'), n: totals.drafts },
  ]
  const total = parts.reduce((sum, p) => sum + p.n, 0)
  return (
    <ul className="sint-strip" aria-label={__('Shares by status', 'social-integrations')}>
      {parts.map((p) => (
        // Each part keeps a minimum width, so a small count still has room for its label.
        <li key={p.key} className={p.key} style={{ flexGrow: Math.max(p.n, total * 0.12, 1) }}>
          <span className="l">{p.label}</span>
          <span className="bar">
            <b>{p.n}</b>
            <span className="p">{pct(p.n, total)}%</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Shared and failed shares for each day: stacked bars, a legend and a table for screen readers. */
export function DayBars({ days }: { days: DashboardData['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.published + d.failed))
  const long = days.length > 10
  const today = days[days.length - 1]?.date
  // The whole row grows in about the same time for 7 or 30 days.
  const grow = 0.3 / days.length
  return (
    <figure className="sint-bars-fig">
      <div className={`sint-bars${long ? ' long' : ''}`} aria-hidden="true">
        {days.map((d, i) => {
          const tip = sprintf(__('%1$s: %2$d shared, %3$d failed', 'social-integrations'), dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' }), d.published, d.failed)
          // A long period labels every fifth day, counted back from today.
          const label = !long || (days.length - 1 - i) % 5 === 0
          return (
            <div key={d.date} className={`col${d.date === today ? ' today' : ''}`}>
              <span className="tip">{tip}</span>
              <span className="track">
                {/* Bars grow from the baseline, one day after another. */}
                {d.failed > 0 && <m.span className="seg failed" style={{ height: `${(d.failed / max) * 100}%`, originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, ease: easeOut, delay: 0.15 + i * grow }} />}
                {d.published > 0 && <m.span className="seg shared" style={{ height: `${(d.published / max) * 100}%`, originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, ease: easeOut, delay: 0.1 + i * grow }} />}
              </span>
              <span className="x">{label ? dayLabel(d.date, long ? { day: 'numeric' } : { weekday: 'narrow' }) : ''}</span>
            </div>
          )
        })}
      </div>
      <figcaption className="sint-legend">
        <span><i className="shared" />{__('Shared', 'social-integrations')}</span>
        <span><i className="failed" />{__('Failed', 'social-integrations')}</span>
      </figcaption>
      <table className="sint-sr">
        <caption>{__('Shares for each day', 'social-integrations')}</caption>
        <thead>
          <tr>
            <th scope="col">{__('Day', 'social-integrations')}</th>
            <th scope="col">{__('Shared', 'social-integrations')}</th>
            <th scope="col">{__('Failed', 'social-integrations')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{dayLabel(d.date, { day: 'numeric', month: 'long' })}</th>
              <td>{d.published}</td>
              <td>{d.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** The part of sent shares that the networks accepted, as a ring. */
export function SuccessRing({ shared, failed }: { shared: number; failed: number }) {
  const sent = shared + failed
  const rate = pct(shared, sent)
  const r = 64
  return (
    <div className="sint-ring">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle className="ticks" cx="80" cy="80" r={r + 12} />
        <circle className="track" cx="80" cy="80" r={r} />
        {sent > 0 && <m.circle className="arc" cx="80" cy="80" r={r} initial={{ pathLength: 0 }} animate={{ pathLength: rate / 100 }} transition={{ duration: 1, ease: easeOut, delay: 0.2 }} />}
      </svg>
      <div className="c">
        <b>{sent ? <><CountUp value={rate} />%</> : '–'}</b>
        <span>{__('Success rate', 'social-integrations')}</span>
      </div>
    </div>
  )
}

/** Shares in the period for each network, as bars on one scale. */
export function NetworkBars({ rows, network }: { rows: DashboardData['networks']; network: (key: string) => Network | undefined }) {
  const max = Math.max(1, ...rows.map((r) => r.published + r.failed))
  return (
    <ul className="sint-netbars">
      {rows.map((r) => {
        const n = r.published + r.failed
        return (
          <li key={r.network}>
            <div className="h">
              <NetBadge network={r.network} color={network(r.network)?.color} size={22} />
              <span className="n">{network(r.network)?.label ?? r.network}</span>
              <b>{n}</b>
            </div>
            <span className="track" title={sprintf(__('%1$d shared, %2$d failed', 'social-integrations'), r.published, r.failed)}>
              <m.span className="fill" style={{ width: `${(n / max) * 100}%`, originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: easeOut, delay: 0.25 }} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
