import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { initials } from '../lib/format'
import { __, sprintf } from '../lib/i18n'
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
  down: <path d="M6 9l6 6 6-6" />,
  up: <path d="M6 15l6-6 6 6" />,
  code: <path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></>,
  sparkle: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  edit: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>,
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

/** A dialog. `drawer` slides it in from the right at full height, for long content next to a list. */
export function Modal({ title, onClose, children, footer, narrow, drawer, headerExtra }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; narrow?: boolean; drawer?: boolean; headerExtra?: ReactNode }) {
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
    <div className={`sint-overlay${drawer ? ' drawer' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`sint-modal${narrow ? ' narrow' : ''}${drawer ? ' drawer' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sint-modal-head">
          <h2>{title}</h2>
          {headerExtra}
          <button type="button" className="sint-icon-btn sm" style={{ marginLeft: 'auto' }} aria-label={__('Close', 'social-integrations')} onClick={onClose}>
            <Icon name="close" size={16} stroke={2} />
          </button>
        </div>
        <div className="sint-modal-body">{children}</div>
        {footer && <div className="sint-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* Read-only value with a Copy button. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

export function CopyField({ value, labelledBy }: { value: string; labelledBy?: string }) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()
  const copy = async () => {
    if (await copyText(value)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast(__('Select the URL and copy it.', 'social-integrations'), true)
    }
  }
  return (
    <div className="sint-copy">
      <input className="sint-input" readOnly value={value} aria-labelledby={labelledBy} onFocus={(e) => e.target.select()} />
      <button type="button" className={`sint-btn sm${copied ? ' copied' : ''}`} onClick={copy} aria-live="polite">
        <Icon name={copied ? 'check' : 'copy'} size={15} stroke={2} />
        {copied ? __('Copied', 'social-integrations') : __('Copy', 'social-integrations')}
      </button>
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

const PAGE_SIZES = [10, 20, 30]
const PAGE_SIZE_KEY = 'sint-page-size'

/** The rows per page of every table. It is a per-browser choice, so it lives in localStorage. */
export function usePageSize(): [number, (size: number) => void] {
  const [size, setSize] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY))
      return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0]!
    } catch {
      return PAGE_SIZES[0]! /* storage blocked */
    }
  })
  const change = (next: number) => {
    setSize(next)
    try {
      window.localStorage.setItem(PAGE_SIZE_KEY, String(next))
    } catch {
      /* storage blocked */
    }
  }
  return [size, change]
}

export interface Pager {
  page: number
  pages: number
  size: number
  total: number
  setPage: (page: number) => void
  setSize: (size: number) => void
}

/** Splits a list into pages. The page goes back to the first when `reset` changes. */
export function usePaged<T>(items: T[], reset = '') {
  const [size, setSize] = usePageSize()
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [reset])
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pages)
  const pager: Pager = { page: current, pages, size, total: items.length, setPage, setSize: (n) => { setSize(n); setPage(1) } }
  return { rows: items.slice((current - 1) * size, current * size), pager }
}

export function Pagination({ page, pages, size, total, setPage, setSize }: Pager) {
  if (total <= PAGE_SIZES[0]!) return null
  const from = (page - 1) * size + 1
  const to = Math.min(total, page * size)
  return (
    <nav className="sint-pager" aria-label={__('Pages', 'social-integrations')}>
      <label className="sint-pager-size">
        {__('Rows per page', 'social-integrations')}
        <select className="sint-select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <span className="sint-pager-range">{sprintf(__('%1$d–%2$d of %3$d', 'social-integrations'), from, to, total)}</span>
      <span className="sint-pager-btns">
        <button type="button" className="sint-icon-btn sm" aria-label={__('Previous page', 'social-integrations')} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <Icon name="left" size={16} stroke={2} />
        </button>
        <span className="sint-pager-page">{sprintf(__('Page %1$d of %2$d', 'social-integrations'), page, pages)}</span>
        <button type="button" className="sint-icon-btn sm" aria-label={__('Next page', 'social-integrations')} disabled={page >= pages} onClick={() => setPage(page + 1)}>
          <Icon name="right" size={16} stroke={2} />
        </button>
      </span>
    </nav>
  )
}

export const typeColors = ['#b69cff', '#5eead4', '#fdba74', '#f9a8d4', '#93c5fd', '#fde047', '#86efac', '#fca5a5']
export const typeColor = (types: string[], type: string) => typeColors[Math.max(0, types.indexOf(type)) % typeColors.length]
