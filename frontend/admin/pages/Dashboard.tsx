import { useState } from 'react'
import { m } from 'motion/react'
import { Header, type PageProps } from '../components/Header'
import { AccountAvatar, Icon, NetBadge, Segmented } from '../components/ui'
import { config } from '../lib/config'
import { fmtStamp } from '../lib/format'
import { useFetch } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { DashboardData } from '../lib/types'
import { CountUp, rise, stagger } from '../lib/motion'
import { DayBars, NetworkBars, StatusStrip, SuccessRing } from './dashboard/Charts'

type Period = '7' | '30'

/** All sharing activity on one screen: counts, shares for each day, the next shares and the newest results. */
export function DashboardPage({ openComposer, go }: PageProps) {
  const { accounts, network } = useStore()
  const [period, setPeriod] = useState<Period>('7')
  const fetched = useFetch<DashboardData>(`dashboard?days=${period}`)
  const data = fetched.data
  const error = !!fetched.error

  const account = (id: string) => accounts.find((a) => a.id === id)
  const expired = accounts.filter((a) => a.status === 'expired')
  const who = (id: string, net: string) => {
    const a = account(id)
    return a ? (
      <AccountAvatar account={a} network={network(a.network)} />
    ) : (
      <span className="sint-avatar"><NetBadge network={net} color={network(net)?.color} /></span>
    )
  }

  const title = config.user.name ? sprintf(__('Welcome, %s', 'social-integrations'), config.user.name) : __('Dashboard', 'social-integrations')
  const t = data?.totals
  const change = t ? t.published - t.previous_published : 0

  return (
    <>
      <Header title={title}>
        <Segmented
          label={__('Period', 'social-integrations')}
          value={period}
          onChange={setPeriod}
          options={[
            { value: '7', label: __('7 days', 'social-integrations') },
            { value: '30', label: __('30 days', 'social-integrations') },
          ]}
        />
        <button type="button" className="sint-btn primary" onClick={() => openComposer()}>
          <Icon name="plus" size={16} stroke={2.2} />
          {__('New campaign', 'social-integrations')}
        </button>
      </Header>
      <div className="sint-body">
        {expired.map((a) => (
          <div key={a.id} className="sint-banner warn" role="status">
            <Icon name="alert" size={20} />
            <span style={{ flex: 1 }}>
              {sprintf(__('%1$s sign-in expired for %2$s. Reconnect the account.', 'social-integrations'), network(a.network)?.label ?? a.network, a.name)}
            </span>
            <button type="button" className="sint-btn warn sm" onClick={() => go('accounts')}>{__('Reconnect', 'social-integrations')}</button>
          </div>
        ))}

        {error && (
          <div className="sint-banner bad" role="alert">
            <Icon name="alert" size={20} />
            {__('The dashboard did not load. Refresh the page.', 'social-integrations')}
          </div>
        )}

        {!data && !error && (
          <div className="sint-dash" aria-busy="true" aria-label={__('Wait', 'social-integrations')}>
            {[0, 1, 2, 3].map((i) => <div key={i} className="sint-skeleton" style={{ height: 220 }} />)}
          </div>
        )}

        {data && t && (
          <>
            <m.section className="sint-dash-top" variants={stagger} initial="hidden" animate="show">
              <m.div variants={rise} className="sint-strip-wrap"><StatusStrip totals={t} /></m.div>
              <m.dl className="sint-stats" variants={rise}>
                <div>
                  <dt><Icon name="campaign" size={16} />{__('Active campaigns', 'social-integrations')}</dt>
                  <dd><CountUp value={data.campaigns.active} /></dd>
                </div>
                <div>
                  <dt><Icon name="accounts" size={16} />{__('Accounts', 'social-integrations')}</dt>
                  <dd><CountUp value={accounts.length} /></dd>
                </div>
                <div>
                  <dt><Icon name="share" size={16} />{__('Networks', 'social-integrations')}</dt>
                  <dd><CountUp value={new Set(accounts.map((a) => a.network)).size} /></dd>
                </div>
              </m.dl>
            </m.section>

            <m.div className="sint-dash" variants={stagger} initial="hidden" animate="show">
              <m.section className="sint-tile chart" variants={rise}>
                <div className="sint-tile-head">
                  <h2>{__('Shares', 'social-integrations')}</h2>
                  <a className="sint-round" href="#/log" aria-label={__('Open the share log', 'social-integrations')}><Icon name="arrow" size={18} /></a>
                </div>
                <p className="sint-hero">
                  <b><CountUp value={t.published + t.failed} /></b>
                  <span>
                    {sprintf(__('sent in %d days', 'social-integrations'), data.days.length)}
                    <br />
                    {change === 0
                      ? __('Same as the period before', 'social-integrations')
                      : sprintf(change > 0 ? __('%d more than the period before', 'social-integrations') : __('%d less than the period before', 'social-integrations'), Math.abs(change))}
                  </span>
                </p>
                <DayBars key={period} days={data.days} />
              </m.section>

              <m.section className="sint-tile ring" variants={rise}>
                <div className="sint-tile-head">
                  <h2>{__('Results', 'social-integrations')}</h2>
                </div>
                <SuccessRing shared={t.published} failed={t.failed} />
                <dl className="sint-kv-list">
                  <div className="sint-kv"><span>{__('Shared', 'social-integrations')}</span><span>{t.published}</span></div>
                  <div className="sint-kv"><span>{__('Failed', 'social-integrations')}</span><span>{t.failed}</span></div>
                </dl>
              </m.section>

              <m.section className="sint-tile feature" variants={rise}>
                <div className="sint-tile-head">
                  <h2>{__('Next shares', 'social-integrations')}</h2>
                  <span className="sint-count"><CountUp value={t.scheduled} /></span>
                </div>
                {data.upcoming.length ? (
                  <m.ul className="sint-next" variants={stagger} initial="hidden" animate="show">
                    {data.upcoming.map((u) => (
                      <m.li key={u.id} variants={rise}>
                        {who(u.account_id, u.network)}
                        <div className="b">
                          <span className="n">{u.title || __('(no caption)', 'social-integrations')}</span>
                          <span className="m"><Icon name="clock" size={13} />{fmtStamp(u.scheduled_at)}</span>
                        </div>
                      </m.li>
                    ))}
                  </m.ul>
                ) : (
                  <div className="sint-next-empty">
                    <p>{__('No shares are scheduled.', 'social-integrations')}</p>
                    <button type="button" className="sint-btn primary sm" onClick={() => openComposer()}>{__('Schedule a post', 'social-integrations')}</button>
                  </div>
                )}
                <a className="sint-next-all" href="#/calendar">{__('Open the calendar', 'social-integrations')}<Icon name="arrow" size={16} /></a>
              </m.section>

              <m.section className="sint-tile recent" variants={rise}>
                <div className="sint-tile-head">
                  <h2>{__('Recent activity', 'social-integrations')}</h2>
                  <a className="sint-round" href="#/log" aria-label={__('Open the share log', 'social-integrations')}><Icon name="arrow" size={18} /></a>
                </div>
                {data.recent.length ? (
                  <m.ul className="sint-recent" variants={stagger} initial="hidden" animate="show">
                    {data.recent.map((r) => (
                      <m.li key={r.id} variants={rise}>
                        {who(r.account_id, r.network)}
                        <div className="b">
                          <span className="n">{r.title || __('(no caption)', 'social-integrations')}</span>
                          <span className="m">{account(r.account_id)?.name ?? network(r.network)?.label ?? r.network} · {fmtStamp(r.created_at)}</span>
                        </div>
                        <span className={`sint-log-result ${r.status === 'published' ? 'ok' : 'bad'}`}>
                          {r.status === 'published' ? __('Shared', 'social-integrations') : __('Failed', 'social-integrations')}
                        </span>
                        {r.remote_url ? (
                          <a className="sint-pc-tool" href={r.remote_url} target="_blank" rel="noreferrer" aria-label={__('Open the post on the network', 'social-integrations')}><Icon name="external" size={14} /></a>
                        ) : (
                          <span className="sint-pc-tool-space" />
                        )}
                      </m.li>
                    ))}
                  </m.ul>
                ) : (
                  <p className="sint-sub">{__('Shares show here after the plugin sends them.', 'social-integrations')}</p>
                )}
              </m.section>

              <m.section className="sint-tile nets" variants={rise}>
                <div className="sint-tile-head">
                  <h2>{__('Networks', 'social-integrations')}</h2>
                </div>
                {data.networks.length ? <NetworkBars rows={data.networks} network={network} /> : <p className="sint-sub">{__('No shares in this period.', 'social-integrations')}</p>}
              </m.section>
            </m.div>
          </>
        )}
      </div>
    </>
  )
}
