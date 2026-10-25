import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { __ } from '../lib/i18n'
import { Icon, useToast } from './ui'

interface Props {
  /** The caption now. */
  text: string
  /** Gives the caption from the AI. */
  onApply: (caption: string) => void
  /** True when the caption is a template: the AI keeps its tokens, and Write makes a template. */
  template?: boolean
  /** The post to write from. Without a post, Write makes a template, or is not shown. */
  postId?: number
  /** The most characters that the caption can have. */
  limit: number
  /** Tokens that a template can use, such as '{title}'. */
  tokens?: string[]
}

type Mode = 'write' | 'improve' | 'shorter' | 'longer' | 'emojis' | 'hashtags' | 'tone' | 'translate'

const TONES = (): [string, string][] => [
  ['friendly', __('Friendly', 'social-integrations')],
  ['professional', __('Professional', 'social-integrations')],
  ['playful', __('Playful', 'social-integrations')],
  ['informative', __('Informative', 'social-integrations')],
  ['bold', __('Bold', 'social-integrations')],
]

/**
 * The AI button and its menu: write, improve, shorter, longer, emojis, hashtags, tone and
 * translate. The answer replaces the caption, and Undo gives the caption before it back.
 */
export function AiMenu({ text, onApply, template = false, postId, limit, tokens = [] }: Props) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [before, setBefore] = useState<string | null>(null)
  const [language, setLanguage] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // Below the button, or above it when there is more room above. It scrolls when it is taller than the room.
  const [place, setPlace] = useState<{ up: boolean; maxHeight?: number }>({ up: false })
  const empty = text.trim() === ''
  const canWrite = template || !!postId

  useLayoutEffect(() => {
    if (!open) return setPlace({ up: false })
    const r = trigger.current?.getBoundingClientRect()
    const height = menu.current?.scrollHeight ?? 0
    if (!r || !height) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < height && above > below
    setPlace({ up, maxHeight: Math.max(200, up ? above : below) })
  }, [open])

  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true })
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    // Escape closes the menu only. The listener is on the menu, so a modal around it does not get the key.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    const el = box.current
    document.addEventListener('mousedown', away)
    el?.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      el?.removeEventListener('keydown', esc)
    }
  }, [open])

  const run = async (mode: Mode, extra: { tone?: string; language?: string } = {}) => {
    setOpen(false)
    setBusy(true)
    try {
      const r = await api.post<{ caption: string; warnings?: string[] }>('ai/caption', {
        mode,
        text: mode === 'write' ? '' : text,
        ...(postId ? { post_id: postId } : {}),
        limit,
        ...(template ? { template: true, tokens } : {}),
        ...extra,
      })
      setBefore(text)
      onApply(r.data.caption)
      for (const w of r.data.warnings ?? []) toast(w, true)
    } catch (e) {
      toast((e as Error).message, true)
    }
    setBusy(false)
  }

  const items: { mode: Mode; label: string; hint: string; needsText: boolean; shown: boolean }[] = [
    { mode: 'write', label: template ? __('Write a template', 'social-integrations') : __('Write from post', 'social-integrations'), hint: template ? __('A new caption with tokens', 'social-integrations') : __('A new caption from the post', 'social-integrations'), needsText: false, shown: canWrite },
    { mode: 'improve', label: __('Improve', 'social-integrations'), hint: __('Keep the meaning, make it clearer', 'social-integrations'), needsText: true, shown: true },
    { mode: 'shorter', label: __('Make shorter', 'social-integrations'), hint: __('For networks with a small limit', 'social-integrations'), needsText: true, shown: true },
    { mode: 'longer', label: __('Make longer', 'social-integrations'), hint: __('More detail, with no new facts', 'social-integrations'), needsText: true, shown: true },
    { mode: 'emojis', label: __('Add emojis', 'social-integrations'), hint: __('One to three, where they fit', 'social-integrations'), needsText: true, shown: true },
    { mode: 'hashtags', label: __('Add hashtags', 'social-integrations'), hint: __('Up to three, at the end', 'social-integrations'), needsText: true, shown: true },
  ]

  return (
    <div className="sint-ai" ref={box}>
      <button ref={trigger} type="button" className="sint-btn ai sm" aria-haspopup="menu" aria-expanded={open} disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        <Icon name="sparkle" size={15} stroke={2} />
        {busy ? __('Wait…', 'social-integrations') : __('AI', 'social-integrations')}
      </button>
      {before !== null && !busy && (
        <button type="button" className="sint-btn ghost sm" onClick={() => { onApply(before); setBefore(null) }}>{__('Undo', 'social-integrations')}</button>
      )}
      {open && (
        <div ref={menu} className={`sint-ai-menu${place.up ? ' up' : ''}`} style={{ maxHeight: place.maxHeight }} role="menu" aria-label={__('AI', 'social-integrations')}>
          {items.filter((i) => i.shown).map((i) => (
            <button key={i.mode} type="button" role="menuitem" disabled={i.needsText && empty} onClick={() => run(i.mode)}>
              <span className="t">{i.label}</span>
              <span className="h">{i.hint}</span>
            </button>
          ))}
          <span className="sint-ai-menu-h">{__('Change the tone', 'social-integrations')}</span>
          <span className="sint-ai-menu-row">
            {TONES().map(([value, label]) => (
              <button key={value} type="button" role="menuitem" className="sint-chip" disabled={empty} onClick={() => run('tone', { tone: value })}>{label}</button>
            ))}
          </span>
          <span className="sint-ai-menu-h">{__('Translate', 'social-integrations')}</span>
          <span className="sint-ai-menu-row">
            <input className="sint-input" value={language} placeholder={__('Language, such as Spanish', 'social-integrations')} aria-label={__('Language', 'social-integrations')} maxLength={40} onChange={(e) => setLanguage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && language.trim() && !empty) { e.preventDefault(); run('translate', { language: language.trim() }) } }} />
            <button type="button" role="menuitem" className="sint-btn ghost sm" disabled={empty || !language.trim()} onClick={() => run('translate', { language: language.trim() })}>
              {__('Translate', 'social-integrations')}
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
