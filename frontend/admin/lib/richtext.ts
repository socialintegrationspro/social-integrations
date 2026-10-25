import type { CSSProperties } from 'react'

/** Text styles in captions, as backend/Templates/RichText.php reads them. */

export const MARKS = ['b', 'i', 'u', 's', 'm'] as const
export type Mark = (typeof MARKS)[number]

/** Text with one set of marks. A line break is a run of its own. */
export interface Run {
  text: string
  marks: Mark[]
}

const PATTERN = /\{\{(\/?[biusm])\}\}|\{(\/?)([biusm])\}/g
const KEEP = /(https?:\/\/\S+|www\.\S+|#[\p{L}\p{N}_]+|@[\w.-]+(?:@[\w.-]+)?)/u

/** Whether a text has a style mark, such as {b}. A mark in double braces is text. */
export function hasMarks(text: string): boolean {
  return /(?<!\{)\{\/?[biusm]\}(?!\})/.test(text)
}

/** The runs of a text with marks. A mark ends at the end of its line. */
export function parseRich(text: string): Run[] {
  const runs: Run[] = []
  const add = (t: string, open: Mark[]) => {
    if (!t) return
    const marks = MARKS.filter((m) => open.includes(m))
    const last = runs[runs.length - 1]
    if (last && last.text !== '\n' && last.marks.join() === marks.join()) last.text += t
    else runs.push({ text: t, marks })
  }
  text.split('\n').forEach((line, i) => {
    if (i > 0) runs.push({ text: '\n', marks: [] })
    let open: Mark[] = []
    let at = 0
    for (const m of line.matchAll(PATTERN)) {
      add(line.slice(at, m.index), open)
      at = m.index! + m[0].length
      if (m[1] !== undefined) add(`{${m[1]}}`, open)
      else if (m[2] === '/') open = open.filter((x) => x !== m[3])
      else if (!open.includes(m[3] as Mark)) open = [...open, m[3] as Mark]
    }
    add(line.slice(at), open)
  })
  return runs
}

/** The text without marks, as a person reads it. */
export function plainText(text: string): string {
  return parseRich(text).map((r) => r.text).join('')
}

/** Letters in a Unicode style, as most networks get them. Links, hashtags and mentions keep their letters. */
export function toUnicode(text: string): string {
  return parseRich(text)
    .map((run) => (run.marks.length ? run.text.split(KEEP).map((part, i) => (i % 2 ? part : letters(part, run.marks))).join('') : run.text))
    .join('')
}

function letters(text: string, marks: Mark[]): string {
  const bold = marks.includes('b')
  const italic = marks.includes('i')
  const base = marks.includes('m') ? [0x1d670, 0x1d68a, 0x1d7f6] : bold && italic ? [0x1d63c, 0x1d656, 0x1d7ec] : bold ? [0x1d5d4, 0x1d5ee, 0x1d7ec] : italic ? [0x1d608, 0x1d622, 0] : [0, 0, 0]
  const line = (marks.includes('u') ? '̲' : '') + (marks.includes('s') ? '̶' : '')
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0)!
    let c = char
    if (code >= 65 && code <= 90 && base[0]) c = String.fromCodePoint(base[0] + code - 65)
    else if (code >= 97 && code <= 122 && base[1]) c = String.fromCodePoint(base[1] + code - 97)
    else if (code >= 48 && code <= 57 && base[2]) c = String.fromCodePoint(base[2] + code - 48)
    out += c + (line && !/\s/.test(char) ? line : '')
  }
  return out
}

/** CSS for the marks of a run, for a preview that shows real styles. */
export function runStyle(marks: Mark[]): CSSProperties {
  const deco = [marks.includes('u') ? 'underline' : '', marks.includes('s') ? 'line-through' : ''].filter(Boolean).join(' ')
  return {
    fontWeight: marks.includes('b') ? 700 : undefined,
    fontStyle: marks.includes('i') ? 'italic' : undefined,
    textDecoration: deco || undefined,
    fontFamily: marks.includes('m') ? 'ui-monospace, Menlo, monospace' : undefined,
  }
}
