import { useState, type ReactNode } from 'react'
import { Preview } from '../pages/composer/Preview'
import type { Account, FieldMap, MediaItem } from '../lib/types'

/** A share that the server built from a template and a post. */
export interface TemplateShare {
  caption: string
  captions: Record<string, string> | []
  media: MediaItem[]
  link?: string
  fields?: FieldMap | []
  /** Token values of the post; the link card uses the title when the network has no title field. */
  tokens?: Record<string, string>
}

interface Props {
  /** The built share; null while it loads or when there is none. */
  share: TemplateShare | null
  /** The selected accounts. The preview shows one account for each network. */
  accounts: Account[]
  /** The network tab of the caption editor, or 'all'. */
  tab: string
  label?: string
  /** A message in place of the post card, such as an error. */
  notice?: ReactNode
  busy?: boolean
}

/** The post card of the composer for a share that a template makes: one network, its caption, media or link card, and first comment. */
export function TemplatePreview({ share, accounts, tab, label, notice, busy }: Props) {
  const [pick, setPick] = useState('')
  const nets = Array.from(new Set(accounts.map((a) => a.network)))
  const preview = tab !== 'all' ? tab : nets.includes(pick) ? pick : nets[0]
  const captions = share && !Array.isArray(share.captions) ? share.captions : {}
  const captionFor = (n: string) => captions[n] || share?.caption || ''
  const fields = (share?.fields && !Array.isArray(share.fields) && preview ? share.fields[preview] : undefined) ?? {}
  const format = fields.format ?? 'auto'
  const media = share && format === 'auto' ? share.media : []
  const image = share?.media.find((m) => m.type === 'image')?.url

  return (
    <Preview
      nets={nets}
      preview={preview}
      canSwitch={tab === 'all' && nets.length > 1}
      setPreview={setPick}
      captionFor={captionFor}
      account={accounts.find((a) => a.network === preview)}
      chosenMedia={media}
      link={share?.link && format !== 'text' ? { url: share.link, title: fields.title || share.tokens?.title || '', description: fields.description, image } : undefined}
      comment={fields.first_comment}
      label={label}
      notice={notice ?? (share ? undefined : <div className="sint-skeleton" style={{ height: 160 }} />)}
      busy={busy}
    />
  )
}
