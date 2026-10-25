import { checkTokens } from '../admin/lib/tokens'
import { aiCaption, errorText } from './api'
import { __, config, Fragment, h, sprintf, useState, wp } from './wp'

const { Button, Dropdown, MenuGroup, MenuItem, Notice, TextControl } = wp.components

/** The ID of the caption field, so a token goes in at its caret. */
export const CAPTION_ID = 'sint-ed-caption'

const TONES = (): [string, string][] => [
  ['friendly', __('Friendly', 'social-integrations')],
  ['professional', __('Professional', 'social-integrations')],
  ['playful', __('Playful', 'social-integrations')],
  ['informative', __('Informative', 'social-integrations')],
  ['bold', __('Bold', 'social-integrations')],
]

/**
 * Below the caption of the post: token buttons, warnings for tokens with a typing error, and the
 * AI menu. The AI keeps the tokens of the caption, and Undo gives the caption before it back.
 */
export function CaptionTools({ postId, caption, onChange }: { postId: number; caption: string; onChange: (caption: string) => void }) {
  const tokens = config.tokens ?? ['{title}', '{excerpt}', '{url}', '{tags}', '{author}', '{site}']
  const [busy, setBusy] = useState(false)
  const [before, setBefore] = useState<string | null>(null)
  const [notes, setNotes] = useState<{ status: 'error' | 'warning'; text: string }[]>([])
  const [language, setLanguage] = useState('')
  const empty = caption.trim() === ''

  // A token goes in at the caret of the caption, or at the end when the caption has no focus.
  const insert = (token: string) => {
    const el = document.getElementById(CAPTION_ID) as HTMLTextAreaElement | null
    const start = el && document.activeElement === el ? el.selectionStart : caption.length
    const end = el && document.activeElement === el ? el.selectionEnd : caption.length
    onChange(caption.slice(0, start) + token + caption.slice(end))
    window.requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const run = (mode: string, close: () => void, extra: Record<string, string> = {}) => {
    close()
    setBusy(true)
    setNotes([])
    // Write makes a new caption from the post. The other actions change the caption and keep its tokens.
    const data = mode === 'write' ? { post_id: postId, mode } : { mode, text: caption, template: true, tokens, limit: 500, ...extra }
    aiCaption(data)
      .then((r) => {
        let text = r.caption
        if (mode === 'write') {
          // The AI adds the post link on the last line. {url} keeps it right when the address changes before publish.
          const lines = text.trimEnd().split('\n')
          if (/^https?:\/\/\S+$/.test((lines[lines.length - 1] ?? '').trim())) lines[lines.length - 1] = '{url}'
          text = lines.join('\n')
        }
        setBefore(caption)
        onChange(text)
        setNotes((r.warnings ?? []).map((w) => ({ status: 'warning' as const, text: w })))
      })
      .catch((e: unknown) => setNotes([{ status: 'error', text: errorText(e, __('The AI did not write a caption. Try again.', 'social-integrations')) }]))
      .finally(() => setBusy(false))
  }

  const issues = checkTokens(caption, tokens, null)

  return (
    <Fragment>
      <div className="sint-ed-tokens" role="group" aria-label={__('Insert a token', 'social-integrations')}>
        {tokens.map((t) => (
          <Button key={t} variant="secondary" size="small" className="sint-ed-token" onMouseDown={(e: MouseEvent) => e.preventDefault()} onClick={() => insert(t)}>{t}</Button>
        ))}
      </div>
      {issues.map((i) => (
        <Notice key={i.token} status="warning" isDismissible={false} className="sint-ed-issue">
          {sprintf(__('%s is not a token. The share shows it as text.', 'social-integrations'), i.token)}
          {i.suggestion && (
            <Button variant="link" onClick={() => onChange(caption.split(i.token).join(i.suggestion!))}>
              {sprintf(__('Use %s', 'social-integrations'), i.suggestion)}
            </Button>
          )}
        </Notice>
      ))}
      <div className="sint-ed-row">
        {config.aiReady !== false && (
          <Dropdown
            popoverProps={{ placement: 'bottom-start' }}
            renderToggle={({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) => (
              <Button variant="secondary" onClick={onToggle} aria-expanded={isOpen} isBusy={busy} disabled={busy}>
                {busy ? __('Wait…', 'social-integrations') : __('AI', 'social-integrations')}
              </Button>
            )}
            renderContent={({ onClose }: { onClose: () => void }) => (
              <div className="sint-ed-ai">
                <MenuGroup>
                  <MenuItem info={__('A new caption from the saved post', 'social-integrations')} onClick={() => run('write', onClose)}>{__('Write from post', 'social-integrations')}</MenuItem>
                  <MenuItem disabled={empty} info={__('Keep the meaning, make it clearer', 'social-integrations')} onClick={() => run('improve', onClose)}>{__('Improve', 'social-integrations')}</MenuItem>
                  <MenuItem disabled={empty} onClick={() => run('shorter', onClose)}>{__('Make shorter', 'social-integrations')}</MenuItem>
                  <MenuItem disabled={empty} onClick={() => run('longer', onClose)}>{__('Make longer', 'social-integrations')}</MenuItem>
                  <MenuItem disabled={empty} onClick={() => run('emojis', onClose)}>{__('Add emojis', 'social-integrations')}</MenuItem>
                  <MenuItem disabled={empty} onClick={() => run('hashtags', onClose)}>{__('Add hashtags', 'social-integrations')}</MenuItem>
                </MenuGroup>
                <MenuGroup label={__('Change the tone', 'social-integrations')}>
                  {TONES().map(([value, label]) => (
                    <MenuItem key={value} disabled={empty} onClick={() => run('tone', onClose, { tone: value })}>{label}</MenuItem>
                  ))}
                </MenuGroup>
                <MenuGroup label={__('Translate', 'social-integrations')}>
                  <div className="sint-ed-translate">
                    <TextControl __nextHasNoMarginBottom label={__('Language', 'social-integrations')} hideLabelFromVision placeholder={__('Language, such as Spanish', 'social-integrations')} value={language} onChange={setLanguage} />
                    <Button variant="secondary" disabled={empty || !language.trim()} onClick={() => run('translate', onClose, { language: language.trim() })}>{__('Translate', 'social-integrations')}</Button>
                  </div>
                </MenuGroup>
              </div>
            )}
          />
        )}
        {before !== null && !busy && <Button variant="tertiary" onClick={() => { onChange(before); setBefore(null) }}>{__('Undo', 'social-integrations')}</Button>}
        {caption !== '' && <Button variant="link" onClick={() => onChange('')}>{__('Use the campaign caption', 'social-integrations')}</Button>}
      </div>
      {notes.map((n, i) => <Notice key={i} status={n.status} isDismissible={false}>{n.text}</Notice>)}
    </Fragment>
  )
}
