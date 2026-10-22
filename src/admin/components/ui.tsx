import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { initials } from '../lib/format'
import type { Account, Network } from '../lib/types'

/* Icons: 24px stroke icons. */
const paths: Record<string, ReactNode> = {
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  content: <><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4M8 12h8M8 16h6" /></>,
  accounts: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.5 5.4" /></>,
  log: <path d="M4 6h16M4 12h16M4 18h10" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></>,
  sparkle: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  retry: <><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></>,
}

export function Icon({ name, size = 18, stroke = 1.8 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/* Network glyphs. Networks without a glyph show the first letter. */
const glyphs: Record<string, ReactNode> = {
  facebook: <path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V9c0-.6.4-1 1-1z" />,
  bluesky: <path d="M6 4c2.5 1.8 5 5.4 6 7.4 1-2 3.5-5.6 6-7.4 1.8-1.3 4-2.3 4 .9 0 .6-.4 5.3-.6 6-.8 2.6-3.5 3.3-5.9 2.9 4.2.7 5.3 3.1 3 5.4-4.4 4.5-6.3-1.1-6.8-2.6L12 16l-.2.6c-.5 1.5-2.4 7.1-6.8 2.6-2.3-2.3-1.2-4.7 3-5.4-2.4.4-5.1-.3-5.9-2.9C2.4 10.2 2 5.5 2 4.9 2 1.7 4.2 2.7 6 4z" />,
  telegram: <path d="M21.5 3.5L2.8 10.7c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.8-.8l3.2-15.1c.3-1.3-.5-1.9-1.6-1.7z" />,
}
const letters: Record<string, string> = { linkedin: 'in', threads: '@' }

export function NetBadge({ network, color, size }: { network: string; color?: string; size?: number }) {
  const style = { background: color ?? '#52525b', ...(size ? { width: size, height: size } : {}) }
  return (
    <span className="sint-net" style={style} aria-hidden="true">
      {glyphs[network] ? <svg viewBox="0 0 24 24" fill="currentColor">{glyphs[network]}</svg> : letters[network] ?? network.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function AccountAvatar({ account, network, large }: { account: Account; network?: Network; large?: boolean }) {
  const [broken, setBroken] = useState(false)
  const cls = ['sint-avatar', large ? 'lg' : '', account.status === 'expired' ? 'expired' : ''].join(' ')
  return (
    <span className={cls}>
      {account.avatar && !broken ? <img src={account.avatar} alt="" onError={() => setBroken(true)} /> : initials(account.name || account.username)}
      <NetBadge network={account.network} color={network?.color} />
    </span>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="sint-toggle" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="sint-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, narrow, headerExtra }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; narrow?: boolean; headerExtra?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    ref.current?.addEventListener('keydown', onKey)
    const el = ref.current
    return () => {
      el?.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [onClose])
  return (
    <div className="sint-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`sint-modal${narrow ? ' narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sint-modal-head">
          <h2>{title}</h2>
          {headerExtra}
          <button type="button" className="sint-icon-btn sm" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} stroke={2} />
          </button>
        </div>
        <div className="sint-modal-body">{children}</div>
        {footer && <div className="sint-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* Toasts */
type Toast = { id: number; text: string; bad?: boolean }
const ToastContext = createContext<(text: string, bad?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, bad }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite">
        {toasts.map((t, i) => (
          <div key={t.id} className={`sint-toast${t.bad ? ' bad' : ''}`} style={{ bottom: 24 + i * 56 }}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="sint-empty">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

export const typeColors = ['#b69cff', '#5eead4', '#fdba74', '#f9a8d4', '#93c5fd', '#fde047', '#86efac', '#fca5a5']
export const typeColor = (types: string[], type: string) => typeColors[Math.max(0, types.indexOf(type)) % typeColors.length]
