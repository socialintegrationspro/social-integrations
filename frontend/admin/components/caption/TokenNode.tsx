import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { $getNodeByKey, $setSelection, DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread, type TextFormatType } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { __, sprintf } from '../../lib/i18n'
import { modifierBadges, parseModifiers, stringifyToken, tokenLabel, type Modifier } from '../../lib/template'

/** What the chips of an editor need to know: the custom fields of the post type, for labels and checks. */
export interface ChipContext {
  fields: { key: string; label: string }[]
  /** Field names to check {field:key} against, or null when they are not known. */
  fieldKeys: string[] | null
}

export const CaptionChips = createContext<ChipContext>({ fields: [], fieldKeys: null })

type SerializedTokenNode = Spread<{ name: string; mods: string; styles?: TextFormatType[] }, SerializedLexicalNode>

/** A token in the caption, such as {title|upper}. It is one chip: the user cannot type inside it. */
export class TokenNode extends DecoratorNode<JSX.Element> {
  __token: string
  __mods: string
  /** Text styles of the value, such as 'bold'. The caption stores them as marks around the token. */
  __styles: TextFormatType[]

  static getType(): string {
    return 'sint-token'
  }

  static clone(node: TokenNode): TokenNode {
    return new TokenNode(node.__token, node.__mods, node.__key, node.__styles)
  }

  static importJSON(json: SerializedTokenNode): TokenNode {
    return $createTokenNode(json.name, json.mods, json.styles ?? [])
  }

  constructor(token: string, mods = '', key?: NodeKey, styles: TextFormatType[] = []) {
    super(key)
    this.__token = token
    this.__mods = mods
    this.__styles = styles
  }

  exportJSON(): SerializedTokenNode {
    return { type: 'sint-token', version: 1, name: this.__token, mods: this.__mods, styles: this.__styles }
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'sint-tok-wrap'
    span.contentEditable = 'false'
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): true {
    return true
  }

  /** The token as template text, such as '{title|upper}'. Copy and paste use it too. */
  token(): string {
    const self = this.getLatest()
    return `{${self.__token}${self.__mods}}`
  }

  getTextContent(): string {
    return this.token()
  }

  setMods(mods: string): void {
    this.getWritable().__mods = mods
  }

  hasStyle(style: TextFormatType): boolean {
    return this.getLatest().__styles.includes(style)
  }

  /** Turns a style on or off, as the style buttons do for text. */
  toggleStyle(style: TextFormatType, on?: boolean): void {
    const self = this.getWritable()
    const has = self.__styles.includes(style)
    const want = on ?? !has
    self.__styles = want ? (has ? self.__styles : [...self.__styles, style]) : self.__styles.filter((x) => x !== style)
  }

  decorate(): JSX.Element {
    return <TokenChip nodeKey={this.getKey()} name={this.__token} mods={this.__mods} styles={this.__styles} />
  }
}

export function $createTokenNode(name: string, mods = '', styles: TextFormatType[] = []): TokenNode {
  return new TokenNode(name, mods, undefined, styles)
}

export function $isTokenNode(node: LexicalNode | null | undefined): node is TokenNode {
  return node instanceof TokenNode
}

/** The name of a text style, for a screen reader. */
function styleName(style: TextFormatType): string {
  const names: Partial<Record<TextFormatType, string>> = {
    bold: __('bold', 'social-integrations'),
    italic: __('italic', 'social-integrations'),
    underline: __('underline', 'social-integrations'),
    strikethrough: __('strikethrough', 'social-integrations'),
    code: __('monospace', 'social-integrations'),
  }
  return names[style] ?? style
}

/** The class of each text style, as the editor theme has it. */
const STYLE_CLASS: Partial<Record<TextFormatType, string>> = { bold: 'b', italic: 'i', underline: 'u', strikethrough: 's', code: 'm' }

const CASES: [string, () => string][] = [
  ['', () => __('As written', 'social-integrations')],
  ['upper', () => __('UPPERCASE', 'social-integrations')],
  ['lower', () => __('lowercase', 'social-integrations')],
  ['title', () => __('Title Case', 'social-integrations')],
]

const LENGTHS: [string, string, () => string][] = [
  ['', '', () => __('No limit', 'social-integrations')],
  ['words', '10', () => __('10 words', 'social-integrations')],
  ['words', '20', () => __('20 words', 'social-integrations')],
  ['chars', '100', () => __('100 characters', 'social-integrations')],
]

/** The chip of a token, and its menu: letter case, a length limit, a text for an empty value, and Remove. */
function TokenChip({ nodeKey, name, mods, styles }: { nodeKey: NodeKey; name: string; mods: string; styles: TextFormatType[] }) {
  const [editor] = useLexicalComposerContext()
  const { fields, fieldKeys } = useContext(CaptionChips)
  const [open, setOpen] = useState(false)
  const chip = useRef<HTMLButtonElement>(null)
  const list = parseModifiers(mods)
  const label = tokenLabel(name, fields)
  const badges = modifierBadges(list)
  const missing = name.startsWith('field:') && fieldKeys !== null && !fieldKeys.includes(name.slice(6))
  const kase = list.find(([n]) => ['upper', 'lower', 'title'].includes(n))?.[0] ?? ''
  const length = list.find(([n]) => n === 'words' || n === 'chars') ?? ['', '']
  const fallback = list.find(([n]) => n === 'default')?.[1] ?? ''

  // The modifiers in a fixed order: letter case, length, then the text for an empty value.
  const save = (next: { kase?: string; length?: Modifier | ['', ''] ; fallback?: string }) => {
    const k = next.kase ?? kase
    const l = next.length ?? length
    const f = next.fallback ?? fallback
    const out: Modifier[] = []
    if (k) out.push([k, ''])
    if (l[0]) out.push([l[0], l[1]])
    if (f) out.push(['default', f])
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isTokenNode(node)) node.setMods(stringifyToken('', out).slice(1, -1))
      // Without a text selection, the editor does not take the focus from the menu.
      $setSelection(null)
    })
  }
  const remove = () => {
    setOpen(false)
    editor.update(() => $getNodeByKey(nodeKey)?.remove())
    editor.focus()
  }

  return (
    <>
      <button
        ref={chip}
        type="button"
        className={`sint-tokchip${missing ? ' missing' : ''}${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-label={sprintf(__('%s token. Select to change.', 'social-integrations'), [label, ...badges, ...styles.map(styleName)].join(', '))}
        title={stringifyToken(name, list)}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true" className="b">{'{ }'}</span>
        <span className={styles.map((st) => `sint-t-${STYLE_CLASS[st] ?? ''}`).join(' ')}>{label}</span>
        {badges.map((b) => <span key={b} className="badge">{b}</span>)}
      </button>
      {open && (
        <TokenMenu anchor={chip} label={label} code={stringifyToken(name, [])} missing={missing} onClose={() => { setOpen(false); chip.current?.focus() }}>
          <span className="sint-tok-menu-h">{__('Letter case', 'social-integrations')}</span>
          <span className="sint-tok-menu-row">
            {CASES.map(([value, text]) => (
              <button key={value || 'none'} type="button" className="sint-chip" aria-pressed={kase === value} onClick={() => save({ kase: value })}>{text()}</button>
            ))}
          </span>
          <span className="sint-tok-menu-h">{__('Shorten', 'social-integrations')}</span>
          <span className="sint-tok-menu-row">
            {LENGTHS.map(([n, arg, text]) => (
              <button key={n + arg} type="button" className="sint-chip" aria-pressed={length[0] === n && length[1] === arg} onClick={() => save({ length: [n, arg] as Modifier })}>{text()}</button>
            ))}
          </span>
          <label className="sint-tok-menu-field">
            <span className="sint-tok-menu-h">{__('Text if empty', 'social-integrations')}</span>
            <input className="sint-input" value={fallback} placeholder={__('For example: Ask us', 'social-integrations')} maxLength={200} onChange={(e) => save({ fallback: e.target.value.replace(/[{}|\n]/g, '') })} />
          </label>
          <span className="sint-tok-menu-foot">
            <button type="button" className="sint-btn ghost sm" onClick={remove}>{__('Remove token', 'social-integrations')}</button>
          </span>
        </TokenMenu>
      )}
    </>
  )
}

/**
 * The menu of a chip, in a layer on top of the page and next to the chip. It is outside the
 * editable text, so the keys typed in its field do not go into the caption.
 */
function TokenMenu({ anchor, label, code, missing, onClose, children }: { anchor: React.RefObject<HTMLButtonElement>; label: string; code: string; missing: boolean; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  // Off screen until the menu knows its size, so it does not show at a wrong place first.
  const [pos, setPos] = useState({ top: -9999, left: -9999, maxHeight: 0 })

  // Below the chip, or above it when there is more room above. It moves with the chip when the
  // page or the modal scrolls, and it scrolls by itself when it is taller than the room.
  const place = () => {
    const r = anchor.current?.getBoundingClientRect()
    if (!r || !panel.current) return
    const height = panel.current.scrollHeight
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const down = below >= height || below >= above
    const room = Math.max(160, down ? below : above)
    const shown = Math.min(height, room)
    setPos({
      top: down ? r.bottom + 6 : Math.max(8, r.top - 6 - shown),
      left: Math.max(8, Math.min(r.left, window.innerWidth - panel.current.offsetWidth - 8)),
      maxHeight: room,
    })
  }
  useLayoutEffect(place, [])

  useEffect(() => {
    // The focus goes into the menu without a scroll of the page.
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const away = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose()
    }
    // Escape closes the menu only, wherever the focus is. The listener runs first, on the window,
    // so the modal around the editor does not get the key and keeps the form.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onClose()
    }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [])

  return createPortal(
    <div ref={panel} className="sint-tok-menu" role="group" aria-label={sprintf(__('Change the %s token', 'social-integrations'), label)} style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight || undefined }}>
      <span className="sint-tok-menu-title">
        <strong>{label}</strong>
        <code>{code}</code>
      </span>
      {missing && <span className="sint-tok-menu-warn">{__('No recent post of this type has this field. When a post does not have it, the share leaves it empty.', 'social-integrations')}</span>}
      {children}
    </div>,
    // The app root has the colors of the theme, as for the other menus.
    document.getElementById('sint-app') ?? document.body,
  )
}
