import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { createPortal } from 'react-dom'
import { initials } from '../lib/format'
import { easeOut, pillSpring } from '../lib/motion'
import { applyFilters } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import type { Account, Network } from '../lib/types'

/* Icons: 24px stroke icons. */
const paths: Record<string, ReactNode> = {
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  campaign: <><path d="M3 9.5L18 4.5v15L3 14.5z" /><path d="M11.5 17a3.2 3.2 0 1 1-6.1-1.9" /><path d="M21.5 9.5v5" /></>,
  accounts: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.5 5.4" /></>,
  log: <path d="M4 6h16M4 12h16M4 18h10" />,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
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
  dashboard: <><rect x="3.5" y="3.5" width="7" height="9" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="15.5" width="7" height="5" rx="2" /></>,
  arrow: <path d="M7 17L17 7M9 7h8v8" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  more: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  retry: <><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></>,
}

export function Icon({ name, size = 18, stroke = 1.8 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/* Network glyphs: SVG path data on a 24px grid, drawn with the even-odd fill rule.
   Networks without a glyph show the first letter. */
const baseGlyphs: Record<string, string> = {
  facebook: 'M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V9c0-.6.4-1 1-1z',
  linkedin: 'M3.5 8.5h3.2V20H3.5zM5.1 3a1.85 1.85 0 1 1 0 3.7 1.85 1.85 0 0 1 0-3.7zM9.3 8.5h3.1v1.6c.5-.9 1.6-1.9 3.4-1.9 3.4 0 4.2 2.2 4.2 5.1V20h-3.2v-5.9c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1v6H9.3z',
}

// Filter `sint.networks.glyphs`: other plugins add path data for the networks they register.
// The app reads it on first use, so filters added before the app renders are in place.
let glyphs: Record<string, string> | null = null
const glyphFor = (network: string) => (glyphs ??= applyFilters('sint.networks.glyphs', { ...baseGlyphs }))[network]

export function NetBadge({ network, color, size }: { network: string; color?: string; size?: number }) {
  const style = { background: color ?? '#52525b', ...(size ? { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) } : {}) }
  const glyph = glyphFor(network)
  return (
    <span className="sint-net" style={style} aria-hidden="true">
      {glyph ? <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd"><path d={glyph} /></svg> : network.slice(0, 1).toUpperCase()}
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

/** A round account avatar that turns on or off, with the network badge. */
export function AccountToggle({ account, network, on, disabled, onToggle }: { account: Account; network?: Network; on: boolean; disabled?: boolean; onToggle: () => void }) {
  const label = network?.label ?? account.network
  return (
    <button type="button" className={account.status === 'expired' ? 'sint-pick expired' : 'sint-pick'} aria-pressed={on} disabled={disabled} title={`${account.name} · ${label}`} aria-label={`${account.name}, ${label}`} onClick={onToggle}>
      {account.avatar ? <img src={account.avatar} alt="" /> : initials(account.name)}
      <NetBadge network={account.network} color={network?.color} />
    </button>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="sint-toggle" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  // Each group has its own pill, which slides to the selected option.
  const pill = useId()
  return (
    <div className="sint-seg sliding" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <m.span className="sint-pill-bg" layoutId={pill} transition={pillSpring} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface MenuItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  /** Return true to keep the menu open, such as for a second click that confirms. */
  onSelect: () => boolean | void
}

/**
 * A "more actions" button with a menu. The menu renders at the app root and is fixed to the window,
 * so a table that scrolls does not hide part of it and a blurred panel does not move it. It opens above
 * the button when there is no room below. Arrow keys move between items; Escape closes it.
 */
export function Menu({ label, items, onClose }: { label: string; items: MenuItem[]; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 })
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const closed = useRef(onClose)
  closed.current = onClose
  const close = useCallback((refocus = false) => {
    setOpen(false)
    closed.current?.()
    if (refocus) button.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const outside = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close()
    }
    const away = () => close()
    // A scroll closes the menu only when it moves the button, so the menu always stays next to it.
    const start = button.current?.getBoundingClientRect().top ?? 0
    const moved = () => Math.abs((button.current?.getBoundingClientRect().top ?? 0) - start) > 2 && close()
    document.addEventListener('mousedown', outside)
    window.addEventListener('resize', away)
    window.addEventListener('scroll', moved, true)
    return () => {
      document.removeEventListener('mousedown', outside)
      window.removeEventListener('resize', away)
      window.removeEventListener('scroll', moved, true)
    }
  }, [open, close])

  const toggle = () => {
    const r = button.current?.getBoundingClientRect()
    if (r) {
      const height = items.length * 42 + 14
      const right = window.innerWidth - r.right
      setPos(r.bottom + 6 + height > window.innerHeight && r.top > height ? { bottom: window.innerHeight - r.top + 6, right } : { top: r.bottom + 6, right })
    }
    setOpen((o) => !o)
  }

  const onKey = (e: ReactKeyboardEvent) => {
    const all = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])
    const i = all.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      all[e.key === 'Home' ? 0 : all.length - 1]?.focus()
    }
  }

  return (
    <>
      <button ref={button} type="button" className="sint-pc-tool" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <Icon name="more" size={16} stroke={2.4} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
        <m.div
          ref={list}
          className="sint-menu"
          role="menu"
          aria-label={label}
          style={{ ...pos, transformOrigin: pos.bottom !== undefined ? 'bottom right' : 'top right' }}
          onKeyDown={onKey}
          initial={{ opacity: 0, scale: 0.94, y: pos.bottom !== undefined ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18, ease: easeOut }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={item.danger ? 'danger' : undefined}
              disabled={item.disabled}
              onClick={() => {
                if (!item.onSelect()) close(true)
              }}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              {item.label}
            </button>
          ))}
        </m.div>
          )}
        </AnimatePresence>,
        document.getElementById('sint-app') ?? document.body,
      )}
    </>
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
  // It renders at the app root: a screen's animated panel has a transform, which puts
  // a fixed overlay inside that panel instead of over the page.
  return createPortal(
    <m.div
      className={`sint-overlay${drawer ? ' drawer' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.2 }}
    >
      <m.div
        ref={ref}
        className={`sint-modal${narrow ? ' narrow' : ''}${drawer ? ' drawer' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={drawer ? { x: 48, opacity: 0 } : { y: 18, scale: 0.97, opacity: 0 }}
        animate={drawer ? { x: 0, opacity: 1 } : { y: 0, scale: 1, opacity: 1 }}
        exit={drawer ? { x: 48, opacity: 0 } : { y: 10, scale: 0.98, opacity: 0 }}
        transition={{ duration: 0.3, ease: easeOut }}
      >
        <div className="sint-modal-head">
          <h2>{title}</h2>
          {headerExtra}
          <button type="button" className="sint-icon-btn sm" style={{ marginLeft: 'auto' }} aria-label={__('Close', 'social-integrations')} onClick={onClose}>
            <Icon name="close" size={16} stroke={2} />
          </button>
        </div>
        <div className="sint-modal-body">{children}</div>
        {footer && <div className="sint-modal-foot">{footer}</div>}
      </m.div>
    </m.div>,
    document.getElementById('sint-app') ?? document.body,
  )
}

/** Asks before an action that cannot be undone. The dialog shows a spinner until `onConfirm` ends; the caller closes it. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onClose }: { title: string; children: ReactNode; confirmLabel: string; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const close = useCallback(() => !busy && onClose(), [busy, onClose])
  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }
  const footer = (
    <>
      <button type="button" className="sint-btn sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={close}>{__('Cancel', 'social-integrations')}</button>
      <button type="button" className="sint-btn danger solid sm" disabled={busy} onClick={confirm}>
        {busy && <Spinner size={14} />}
        {confirmLabel}
      </button>
    </>
  )
  return (
    <Modal title={title} onClose={close} footer={footer} narrow>
      <div className="sint-confirm">{children}</div>
    </Modal>
  )
}

/* Read-only value with a Copy button. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // The Clipboard API needs a secure context; without it, use a hidden textarea.
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
      <div className="sint-toasts" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <m.div
              key={t.id}
              layout
              className={`sint-toast${t.bad ? ' bad' : ''}`}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ duration: 0.28, ease: easeOut }}
            >
              {t.text}
            </m.div>
          ))}
        </AnimatePresence>
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

/** A small turning ring for work that has no place to show a skeleton. */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="sint-spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-hidden={label ? undefined : true}>
      {label && <span className="sint-sr">{label}</span>}
    </span>
  )
}

/** Loads the data of a screen again. The icon turns while the request runs. */
export function RefreshButton({ loading, onClick, label = __('Refresh', 'social-integrations') }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className={`sint-icon-btn sint-refresh${loading ? ' spinning' : ''}`} onClick={onClick} disabled={loading} aria-label={label} title={label} aria-busy={loading}>
      <Icon name="retry" size={17} stroke={2} />
    </button>
  )
}

/** Data that did not load: the problem, then a button that loads it again. */
export function LoadError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className="sint-banner bad" role="alert">
      {/* In a narrow column the button goes below the message. */}
      <span style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 'none', display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
        <span style={{ minWidth: 0 }}>{message}</span>
      </span>
      <button type="button" className="sint-btn sm" onClick={onRetry} disabled={busy}>
        {busy ? <Spinner size={14} /> : <Icon name="retry" size={14} stroke={2} />}
        {__('Try again', 'social-integrations')}
      </button>
    </div>
  )
}

/** A table shape while the first rows load. */
export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="sint-table-wrap sint-skel-table" aria-busy="true">
      <span className="sint-sr">{__('Loading', 'social-integrations')}</span>
      {Array.from({ length: rows + 1 }, (_, r) => (
        <div key={r} className={`sint-skel-row${r === 0 ? ' head' : ''}`} style={{ gridTemplateColumns: `2fr repeat(${cols - 1}, 1fr)` }}>
          {Array.from({ length: cols }, (_, c) => <span key={c} className="sint-skeleton" />)}
        </div>
      ))}
    </div>
  )
}

/** A list shape (avatar, two lines) while the first items load. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="sint-skel-list" aria-busy="true">
      <span className="sint-sr">{__('Loading', 'social-integrations')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sint-skel-item">
          <span className="sint-skeleton dot" />
          <span className="lines"><span className="sint-skeleton" /><span className="sint-skeleton short" /></span>
        </div>
      ))}
    </div>
  )
}

const PAGE_SIZES = [10, 20, 30]
const PAGE_SIZE_KEY = 'sint-page-size'

/** The rows per page of every table. It is a per-browser choice, so the app keeps it in localStorage. */
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

/** Splits a list into pages. The page changes to the first page when `reset` changes. */
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

export const typeColors = ['#f6cd3f', '#5eead4', '#fdba74', '#f9a8d4', '#93c5fd', '#fde047', '#86efac', '#fca5a5']
export const typeColor = (types: string[], type: string) => typeColors[Math.max(0, types.indexOf(type)) % typeColors.length]
