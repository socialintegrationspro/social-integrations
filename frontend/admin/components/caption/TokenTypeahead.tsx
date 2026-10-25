import { useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TextNode } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, MenuOption, type MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { __, sprintf } from '../../lib/i18n'
import { tokenLabel } from '../../lib/template'
import { $createTokenNode, CaptionChips } from './TokenNode'

/** A token in the list: its name, such as 'title' or 'field:venue', and its label. */
class TokenOption extends MenuOption {
  name: string
  label: string
  constructor(name: string, label: string) {
    super(name)
    this.name = name
    this.label = label
  }
}

/**
 * "{" and the start of a name, at the caret. Field names have "_", "-" and ":", so the default
 * pattern of the plugin, which stops at those, does not fit.
 */
function tokenTrigger(text: string): MenuTextMatch | null {
  const m = /(^|\s|\()(\{([A-Za-z0-9_:-]{0,40}))$/.exec(text)
  if (!m) return null
  return { leadOffset: m.index + m[1]!.length, matchingString: m[3]!, replaceableString: m[2]! }
}

/** A list of tokens and custom fields that opens when the user types "{". A selected item becomes a chip. */
export function TokenTypeahead({ tokens }: { tokens: string[] }) {
  const [editor] = useLexicalComposerContext()
  const { fields } = useContext(CaptionChips)
  const [query, setQuery] = useState<string | null>(null)

  const options = useMemo(() => {
    const all = [
      ...tokens.map((t) => t.slice(1, -1)).map((name) => new TokenOption(name, tokenLabel(name))),
      ...fields.map((f) => new TokenOption(`field:${f.key}`, f.label)),
    ]
    const q = (query ?? '').toLowerCase()
    return (q ? all.filter((o) => o.name.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)) : all).slice(0, 12)
  }, [tokens, fields, query])

  const select = (option: TokenOption, node: TextNode | null, close: () => void) => {
    editor.update(() => {
      const chip = $createTokenNode(option.name)
      if (node) node.replace(chip)
      chip.selectNext()
      close()
    })
  }

  return (
    <LexicalTypeaheadMenuPlugin<TokenOption>
      onQueryChange={setQuery}
      onSelectOption={select}
      triggerFn={tokenTrigger}
      options={options}
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        anchor.current && options.length
          ? createPortal(
              // The list is outside the app, so it takes the app's theme and colors.
              <div className="sint-root sint-typeahead" data-theme={document.getElementById('sint-app')?.getAttribute('data-theme') ?? undefined}>
                <span className="sint-typeahead-h">{__('Insert a token', 'social-integrations')}</span>
                <ul role="listbox" aria-label={__('Tokens', 'social-integrations')}>
                  {options.map((o, i) => (
                    <li
                      key={o.key}
                      ref={(el) => o.setRefElement(el)}
                      role="option"
                      aria-selected={selectedIndex === i}
                      tabIndex={-1}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setHighlightedIndex(i)
                        selectOptionAndCleanUp(o)
                      }}
                    >
                      <span className="t">{o.label}</span>
                      <code>{`{${o.name}}`}</code>
                    </li>
                  ))}
                </ul>
                <span className="sint-typeahead-foot">{sprintf(__('%s to select, Esc to close', 'social-integrations'), '↵')}</span>
              </div>,
              anchor.current,
            )
          : null
      }
    />
  )
}
