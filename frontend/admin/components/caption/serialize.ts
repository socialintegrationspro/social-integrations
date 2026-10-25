import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot, $setSelection, $isElementNode, $isLineBreakNode, $isTextNode, type LexicalNode, type TextFormatType } from 'lexical'
import { MARKS, parseRich, type Mark } from '../../lib/richtext'
import { parseTemplate } from '../../lib/template'
import { $createTokenNode, $isTokenNode } from './TokenNode'

/** 'template': tokens are chips. 'text': final text, in which a token stays text. */
export type CaptionMode = 'template' | 'text'

/** Whether a token name becomes a chip. A name that the plugin does not know stays text, so its warning shows. */
export type IsKnown = (name: string) => boolean

/** The editor style of each mark: {b} bold, {i} italic, {u} underline, {s} strikethrough, {m} monospace. */
const FORMATS: Record<Mark, TextFormatType> = { b: 'bold', i: 'italic', u: 'underline', s: 'strikethrough', m: 'code' }

/** The editor content as the stored string: lines joined with "\n", each chip as its token, each style as marks. */
export function $toStored(): string {
  const text = (node: LexicalNode): string => {
    if ($isTokenNode(node)) {
      const marks = MARKS.filter((m) => node.hasStyle(FORMATS[m]))
      return marks.map((m) => `{${m}}`).join('') + node.token() + [...marks].reverse().map((m) => `{/${m}}`).join('')
    }
    if ($isLineBreakNode(node)) return '\n'
    if ($isElementNode(node)) return node.getChildren().map(text).join('')
    if (!$isTextNode(node)) return node.getTextContent()
    // Text that looks like a mark, such as "{b}", is stored in double braces so it stays text.
    const body = node.getTextContent().replace(/\{(\/?[biusm])\}/g, '{{$1}}')
    const marks = MARKS.filter((m) => node.hasFormat(FORMATS[m]))
    return marks.map((m) => `{${m}}`).join('') + body + [...marks].reverse().map((m) => `{/${m}}`).join('')
  }
  return $getRoot().getChildren().map(text).join('\n')
}

/**
 * The nodes of a stored string. Marks give the styles of the text. In template mode a known token
 * becomes a chip; a token in double braces, such as {{title}}, stays text as it is typed.
 */
export function $nodesOf(text: string, mode: CaptionMode, known: IsKnown = () => true): LexicalNode[] {
  const nodes: LexicalNode[] = []
  const textNode = (t: string, marks: Mark[]) => {
    const node = $createTextNode(t)
    marks.forEach((m) => node.toggleFormat(FORMATS[m]))
    return node
  }
  for (const run of parseRich(text)) {
    if (run.text === '\n') {
      nodes.push($createLineBreakNode())
      continue
    }
    if (mode === 'text') {
      nodes.push(textNode(run.text, run.marks))
      continue
    }
    for (const piece of parseTemplate(run.text, true)) {
      if (piece.type === 'token' && known(piece.name)) nodes.push($createTokenNode(piece.name, piece.raw.slice(piece.name.length + 1, -1), run.marks.map((m) => FORMATS[m])))
      else nodes.push(textNode(piece.type === 'text' ? piece.text : piece.raw, run.marks))
    }
  }
  return nodes
}

/** Replaces the editor content with a stored string. */
export function $fromStored(text: string, mode: CaptionMode, known?: IsKnown): void {
  const root = $getRoot()
  root.clear()
  const paragraph = $createParagraphNode()
  paragraph.append(...$nodesOf(text, mode, known))
  root.append(paragraph)
  // The old selection points to text that is gone. Without a selection, an insert goes to the end.
  $setSelection(null)
}
