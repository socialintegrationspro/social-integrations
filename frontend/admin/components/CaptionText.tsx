import { parseRich, runStyle, toUnicode } from '../lib/richtext'

/**
 * A caption as a network shows it. A network that shows plain text gets the styles as Unicode
 * letters; a network with real styles, or no network, shows bold, italic and the other styles.
 */
export function CaptionText({ text, format }: { text: string; format?: string }) {
  if (format === 'unicode') return <>{toUnicode(text)}</>
  return (
    <>
      {parseRich(text).map((run, i) => (run.marks.length ? <span key={i} style={runStyle(run.marks)}>{run.text}</span> : run.text))}
    </>
  )
}
