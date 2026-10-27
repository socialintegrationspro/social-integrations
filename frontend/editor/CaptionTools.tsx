import { checkTokens } from '../admin/lib/tokens'
import { __, config, Fragment, h, sprintf, wp } from './wp'

const { Button, Notice } = wp.components

/** The ID of the caption field, so a token goes in at its caret. */
export const CAPTION_ID = 'sint-ed-caption'

/** What a `sint.editor.caption.tools` control gets: the caption of the post, and a way to replace it. */
export interface EditorCaptionToolProps {
  postId: number
  caption: string
  onChange: (caption: string) => void
  /** Tokens that the caption can use, such as '{title}'. */
  tokens: string[]
}

/** A `sint.editor.caption.tools` entry. */
interface EditorCaptionTool {
  key: string
  component: (props: EditorCaptionToolProps) => JSX.Element | null
}

/**
 * Below the caption of the post: token buttons, warnings for tokens with a typing error, and the
 * controls of other plugins (filter `sint.editor.caption.tools`).
 */
export function CaptionTools({ postId, caption, onChange }: { postId: number; caption: string; onChange: (caption: string) => void }) {
  const tokens = config.tokens ?? ['{title}', '{excerpt}', '{url}', '{tags}', '{author}', '{site}']
  const tools = wp.hooks.applyFilters('sint.editor.caption.tools', []) as EditorCaptionTool[]

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
      {tools.map(({ key, component: Tool }) => <Tool key={key} postId={postId} caption={caption} onChange={onChange} tokens={tokens} />)}
      {caption !== '' && (
        <div className="sint-ed-row">
          <Button variant="link" onClick={() => onChange('')}>{__('Use the campaign caption', 'social-integrations')}</Button>
        </div>
      )}
    </Fragment>
  )
}
