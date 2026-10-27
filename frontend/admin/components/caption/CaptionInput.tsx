import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { $getRoot, $getSelection, $isRangeSelection, $isTextNode, COMMAND_PRIORITY_HIGH, FORMAT_TEXT_COMMAND, KEY_ENTER_COMMAND, TextNode, type TextFormatType } from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { __ } from '../../lib/i18n'
import { parseTemplate } from '../../lib/template'
import { $fromStored, $nodesOf, $toStored, type CaptionMode, type IsKnown } from './serialize'
import { $createTokenNode, $isTokenNode, CaptionChips, TokenNode, type ChipContext } from './TokenNode'
import { TokenTypeahead } from './TokenTypeahead'

export interface CaptionInputProps {
  value: string
  onChange: (value: string) => void
  /** 'template': tokens are chips. 'text': final text. */
  mode?: CaptionMode
  /** The tokens that a typed token becomes a chip for, such as '{title}'. {field:key} always does. */
  tokens?: string[]
  /** Custom fields of the post type, for chip labels and checks. */
  chips?: ChipContext
  /** One line only: Enter does nothing, as in a text input. */
  singleLine?: boolean
  labelledBy?: string
  describedBy?: string
  placeholder?: string
  /** Set to a function that inserts text at the caret, such as a token from a chip button. */
  insertRef?: MutableRefObject<((text: string) => void) | null>
  /** Text styles: bold, italic, underline, strikethrough and monospace, with a toolbar. */
  formats?: boolean
  /** More controls at the end of the toolbar, such as the controls of other plugins. */
  tools?: ReactNode
  /** Ctrl or Cmd + Enter. */
  onSubmit?: () => void
  /** No frame: the screen around the field draws it. */
  bare?: boolean
  /** The ID of the editable text, for a link that puts the focus there. */
  id?: string
}

const STYLES: { format: TextFormatType; label: () => string; glyph: string; className: string }[] = [
  { format: 'bold', label: () => __('Bold', 'social-integrations'), glyph: 'B', className: 'b' },
  { format: 'italic', label: () => __('Italic', 'social-integrations'), glyph: 'I', className: 'i' },
  { format: 'underline', label: () => __('Underline', 'social-integrations'), glyph: 'U', className: 'u' },
  { format: 'strikethrough', label: () => __('Strikethrough', 'social-integrations'), glyph: 'S', className: 's' },
  { format: 'code', label: () => __('Monospace', 'social-integrations'), glyph: 'M', className: 'm' },
]

/**
 * The style buttons also style the chips in the selection: the editor styles text only. A
 * selection of chips only, such as a click on one chip, gets the style of each chip.
 */
function ChipStylePlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        (format) => {
          const selection = $getSelection()
          if (!selection) return false
          const chips = selection.getNodes().filter($isTokenNode)
          if (!chips.length) return false
          // All chips get the style, unless all of them have it already.
          const on = !chips.every((c) => c.hasStyle(format))
          chips.forEach((c) => c.toggleStyle(format, on))
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  )
  return null
}

/** The style buttons. Each shows whether the selected text has its style. */
function StyleToolbar({ tools }: { tools?: ReactNode }) {
  const [editor] = useLexicalComposerContext()
  const [active, setActive] = useState<TextFormatType[]>([])
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(() => {
          const selection = $getSelection()
          setActive($isRangeSelection(selection) ? STYLES.filter((st) => selection.hasFormat(st.format)).map((st) => st.format) : [])
        }),
      ),
    [editor],
  )
  return (
    <div className="sint-cap-tools" role="toolbar" aria-label={__('Text styles', 'social-integrations')}>
      {STYLES.map((st) => (
        <button
          key={st.format}
          type="button"
          className={`sint-cap-style ${st.className}`}
          aria-label={st.label()}
          title={st.label()}
          aria-pressed={active.includes(st.format)}
          // The selection in the text stays: a click on the button does not take the focus.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, st.format)}
        >
          {st.glyph}
        </button>
      ))}
      {tools && <span className="sint-cap-tools-end">{tools}</span>}
    </div>
  )
}

/** Turns a typed or pasted token with a known name into a chip. A token in double braces stays text. */
function TokenTransformPlugin({ known }: { known: MutableRefObject<IsKnown> }) {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerNodeTransform(TextNode, (node) => {
        if (!node.isSimpleText()) return
        const text = node.getTextContent()
        let at = 0
        for (const piece of parseTemplate(text, true)) {
          const length = piece.type === 'text' ? piece.text.length : piece.raw.length
          if (piece.type === 'token' && known.current(piece.name)) {
            const parts = node.splitText(at, at + length)
            const target = at === 0 ? parts[0] : parts[1]
            if (!target) return
            // A token typed in styled text, such as bold, gets the same style.
            const styles = (['bold', 'italic', 'underline', 'strikethrough', 'code'] as TextFormatType[]).filter((f) => target.hasFormat(f))
            const chip = $createTokenNode(piece.name, piece.raw.slice(piece.name.length + 1, -1), styles)
            target.replace(chip)
            const next = chip.getNextSibling()
            if ($isTextNode(next)) next.select(0, 0)
            else chip.selectNext()
            return
          }
          at += length
        }
      }),
    [editor],
  )
  return null
}

/** Keeps the editor and the `value` prop the same, and gives `insertRef`. */
function SyncPlugin({ value, onChange, mode, insertRef, singleLine, known, onSubmit }: Pick<CaptionInputProps, 'value' | 'onChange' | 'insertRef' | 'singleLine' | 'onSubmit'> & { mode: CaptionMode; known: MutableRefObject<IsKnown> }) {
  const [editor] = useLexicalComposerContext()
  // The last value that the editor gave or got, so a change from outside (another control, Undo, a fix) replaces the content.
  const last = useRef(value)
  const change = useRef(onChange)
  change.current = onChange

  useEffect(() => {
    if (value === last.current) return
    last.current = value
    editor.update(() => $fromStored(value, mode, known.current))
  }, [value])

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
        const next = editorState.read($toStored)
        if (next === last.current) return
        last.current = next
        change.current(next)
      }),
    [editor],
  )

  const submit = useRef(onSubmit)
  submit.current = onSubmit
  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (e) => {
          if (e && (e.ctrlKey || e.metaKey) && submit.current) {
            e.preventDefault()
            submit.current()
            return true
          }
          if (!singleLine) return false
          e?.preventDefault()
          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, singleLine],
  )

  useEffect(() => {
    if (!insertRef) return
    insertRef.current = (text: string) => {
      editor.update(() => {
        let selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          $getRoot().selectEnd()
          selection = $getSelection()
        }
        if (!$isRangeSelection(selection)) return
        // Final text has no chips, so it goes in as text, with its line breaks.
        if (mode === 'text') selection.insertRawText(text)
        else selection.insertNodes($nodesOf(text, mode, known.current))
      })
      editor.focus()
    }
    return () => {
      insertRef.current = null
    }
  }, [editor, insertRef, mode])

  return null
}

/**
 * A caption field in which each token is a chip. Typed and pasted tokens become chips, and a
 * chip opens a menu for its letter case, length and a text for an empty value. The value is the
 * template text, such as "{title|upper}\n\n{excerpt|words:20}".
 */
export function CaptionInput({ value, onChange, mode = 'template', tokens = [], chips = { fields: [], fieldKeys: null }, singleLine, labelledBy, describedBy, placeholder, insertRef, formats, tools, onSubmit, bare, id }: CaptionInputProps) {
  // A custom field is always a chip: a missing one shows as an amber chip.
  const known = useRef<IsKnown>(() => true)
  known.current = (name) => name.startsWith('field:') || tokens.includes(`{${name}}`)
  const editable = <ContentEditable id={id} className="sint-cap-input" role="textbox" ariaMultiline={!singleLine} ariaLabelledBy={labelledBy} ariaDescribedBy={describedBy} />
  const hint = placeholder ? <div className="sint-cap-ph" aria-hidden="true">{placeholder}</div> : null
  const config = {
    namespace: 'sint-caption',
    nodes: [TokenNode],
    theme: { text: { bold: 'sint-t-b', italic: 'sint-t-i', underline: 'sint-t-u', strikethrough: 'sint-t-s', underlineStrikethrough: 'sint-t-us', code: 'sint-t-m' } },
    onError: (error: Error) => {
      throw error
    },
    editorState: () => $fromStored(value, mode, known.current),
  }
  return (
    <CaptionChips.Provider value={chips}>
      <LexicalComposer initialConfig={config}>
        <div className={`sint-cap${singleLine ? ' single' : ''}${formats ? ' styled' : ''}${bare ? ' bare' : ''}`}>
          {(formats || tools) && <StyleToolbar tools={tools} />}
          <div className="sint-cap-body">
            {formats ? (
              <RichTextPlugin contentEditable={editable} placeholder={hint} ErrorBoundary={LexicalErrorBoundary} />
            ) : (
              <PlainTextPlugin contentEditable={editable} placeholder={hint} ErrorBoundary={LexicalErrorBoundary} />
            )}
          </div>
        </div>
        <HistoryPlugin />
        {mode === 'template' && <TokenTransformPlugin known={known} />}
        {mode === 'template' && <TokenTypeahead tokens={tokens} />}
        {mode === 'template' && formats && <ChipStylePlugin />}
        <SyncPlugin value={value} onChange={onChange} mode={mode} insertRef={insertRef} singleLine={singleLine} known={known} onSubmit={onSubmit} />
      </LexicalComposer>
    </CaptionChips.Provider>
  )
}

export default CaptionInput
