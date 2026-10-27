import type { ComponentType } from 'react'
import { applyFilters } from '../lib/hooks'

/** What a `sint.caption.tools` control gets: the caption next to it, and a way to replace it. */
export interface CaptionToolProps {
  /** The caption now. */
  text: string
  /** Replaces the caption. */
  onApply: (caption: string) => void
  /** True when the caption is a template with tokens, such as an auto-post campaign's. */
  template?: boolean
  /** The post that the caption is for, when there is one. */
  postId?: number
  /** The most characters that the caption can have on the networks of the tab. */
  limit: number
  /** Tokens that the caption can use, such as '{title}'. */
  tokens?: string[]
}

/** A `sint.caption.tools` entry. */
interface CaptionTool {
  key: string
  component: ComponentType<CaptionToolProps>
}

/** Filter `sint.caption.tools`: controls of other plugins in the toolbar of a caption. Nothing when there are none. */
export function CaptionTools(props: CaptionToolProps) {
  const tools = applyFilters<CaptionTool[]>('sint.caption.tools', [])
  if (!tools.length) return null
  return (
    <>
      {tools.map(({ key, component: Tool }) => <Tool key={key} {...props} />)}
    </>
  )
}
