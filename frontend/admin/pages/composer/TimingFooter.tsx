import type { ReactNode } from 'react'
import { Segmented } from '../../components/ui'
import { config } from '../../lib/config'
import { __ } from '../../lib/i18n'
import type { ComposerOptionProps } from '../Composer'
import { timePresets, type When } from './helpers'

interface Props {
  when: When
  setWhen: (when: When) => void
  /** Site-time datetime-local value of the selected time. */
  local: string
  setLocal: (local: string) => void
  /** Local time when the selected post is published, if it is scheduled. */
  live: string
  /** Controls from the `sint.composer.options` filter. */
  optionControls: { key: string; component: (props: ComposerOptionProps) => JSX.Element }[]
  options: Record<string, unknown>
  setOption: (key: string, value: unknown) => void
  /** Save buttons. */
  children: ReactNode
}

/** The modal footer: Now or a selected time, preset times, option controls and the save buttons. */
export function TimingFooter({ when, setWhen, local, setLocal, live, optionControls, options, setOption, children }: Props) {
  return (
    <>
      <Segmented<When> label={__('When', 'social-integrations')} value={when} onChange={setWhen} options={[{ value: 'now', label: __('Now', 'social-integrations') }, { value: 'pick', label: __('Select a time', 'social-integrations') }]} />
      {when === 'pick' && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="sint-sr">{__('Date and time', 'social-integrations')}</span>
            <input type="datetime-local" className="sint-input" style={{ width: 'auto', colorScheme: 'dark' }} value={local} onChange={(e) => setLocal(e.target.value)} />
          </label>
          {timePresets(live).map((p) => (
            <button key={p.label} type="button" className={`sint-chip${local === p.value ? ' on' : ''}`} onClick={() => setLocal(p.value)}>{p.label}</button>
          ))}
        </>
      )}
      {/* The time zone matters only for a selected time. */}
      {when === 'pick' && <span style={{ fontSize: 12, color: 'var(--faint)' }}>{config.timezone}</span>}
      {optionControls.map(({ key, component: Control }) => <Control key={key} options={options} setOption={setOption} when={when} local={local} />)}
      <div className="sint-foot-actions">{children}</div>
    </>
  )
}
