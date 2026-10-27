import { lazy, Suspense, useId, useRef } from 'react'
import { useFetch } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { pickMedia } from '../lib/media'
import { hasMarks } from '../lib/richtext'
import { checkTokens } from '../lib/tokens'
import { useStore } from '../lib/store'
import type { CustomField, FieldMap, MediaItem, MediaSource } from '../lib/types'
import { CaptionTools } from './CaptionTools'
import { FieldPicker } from './FieldPicker'
import { MediaWarning, PostFields } from './PostFields'
import { TokenIssues } from './TokenIssues'
import { Icon, NetBadge, useToast } from './ui'

// The editor library loads only when a screen shows a caption.
const CaptionInput = lazy(() => import('./caption/CaptionInput'))

/** What a campaign shares for each post: captions, link and post fields with tokens, and where the media comes from. */
export interface ShareTemplate {
  caption: string
  captions: Record<string, string>
  media: MediaSource
  custom_media: MediaItem[]
  /** The custom field with the images, when `media` is 'field'. */
  media_field?: string
  /** Link template; empty: the post's permalink. */
  link?: string
  /** Post field templates (see PostFields). */
  fields?: FieldMap | []
}

export const TOKENS = ['{title}', '{excerpt}', '{url}', '{tags}', '{author}', '{site}']

const SOURCES = (): { value: MediaSource; label: string }[] => [
  { value: 'auto', label: __('Featured image and post images', 'social-integrations') },
  { value: 'featured', label: __('Featured image', 'social-integrations') },
  { value: 'content', label: __('Images in the post', 'social-integrations') },
  { value: 'field', label: __('Images from a custom field', 'social-integrations') },
  { value: 'custom', label: __('Chosen images', 'social-integrations') },
  { value: 'none', label: __('No media', 'social-integrations') },
]

interface Props {
  value: ShareTemplate
  onChange: (patch: Partial<ShareTemplate>) => void
  /** Networks of the selected accounts; each gets a caption tab. */
  nets: string[]
  /** 'all' or a network key in `nets`. */
  tab: string
  setTab: (tab: string) => void
  /** Placeholder of the caption for all networks. */
  placeholder: string
  /** Help below the caption for all networks. */
  hint?: string
  /** The post type that the campaign shares. It gives the custom fields and the extra tokens, such as {price}. */
  postType?: string
}

/** Caption tabs, the caption with token chips, the media source with selected images, the link and the post fields. */
export function TemplateEditor({ value, onChange, nets, tab, setTab, placeholder, hint, postType }: Props) {
  const { network, postTypes } = useStore()
  const toast = useToast()
  // The caption and the field select get their names by ID: their labels also hold chips and help.
  const id = useId()
  // Inserts a token at the caret of the caption.
  const insert = useRef<((text: string) => void) | null>(null)
  const all = tab === 'all'
  const fieldsFetch = useFetch<CustomField[]>(postType ? `post-types/${encodeURIComponent(postType)}/fields` : null)
  const fields = fieldsFetch.data ?? []
  const mediaFields = fields.filter((f) => f.media)
  const tokens = [...TOKENS, ...(postTypes.find((t) => t.name === postType)?.tokens ?? []).map((t) => `{${t}}`)]
  // Field names to check {field:key} against; null while they load or when the post type is not known.
  const fieldKeys = postType && fieldsFetch.data && !fieldsFetch.error ? fieldsFetch.data.map((f) => f.key) : null
  // 'Images from a custom field' shows when the post type has one, or when the campaign already uses it.
  const sources = SOURCES().filter((s) => s.value !== 'field' || mediaFields.length > 0 || value.media === 'field')

  const text = all ? value.caption : value.captions[tab] ?? ''
  // An empty network caption uses the caption for all networks instead.
  const setText = (v: string) => {
    if (all) return onChange({ caption: v })
    const captions = { ...value.captions }
    if (v.trim() === '') delete captions[tab]
    else captions[tab] = v
    onChange({ captions })
  }

  // A token goes in at the caret. An empty network caption starts from the caption for all networks.
  const addToken = (token: string) => {
    if (!all && text === '' && value.caption) setText(value.caption + token)
    else if (insert.current) insert.current(token)
    else setText(text + token)
  }

  const addMedia = () => {
    const opened = pickMedia((items) => onChange({ custom_media: [...value.custom_media, ...items.filter((x) => !value.custom_media.some((y) => y.id === x.id))] }))
    if (!opened) toast(__('The media library did not load. Reload the page and try again.', 'social-integrations'), true)
  }

  return (
    <>
      {nets.length > 0 && (
        <div className="sint-seg" role="tablist" aria-label={__('Caption for', 'social-integrations')} style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
          <button type="button" role="tab" aria-selected={all} className={all ? 'on' : ''} onClick={() => setTab('all')}>{__('All networks', 'social-integrations')}</button>
          {nets.map((n) => {
            const label = network(n)?.label ?? n
            // With many networks a tab shows its logo only, except the selected tab.
            const short = nets.length > 5 && tab !== n
            const fields = value.fields && !Array.isArray(value.fields) ? value.fields[n] : undefined
            const edited = value.captions[n] !== undefined || Object.keys(fields ?? {}).length > 0
            return (
              <button key={n} type="button" role="tab" aria-selected={tab === n} className={`${tab === n ? 'on' : ''}${short ? ' icon' : ''}`} aria-label={short ? (edited ? sprintf(__('%s, edited', 'social-integrations'), label) : label) : undefined} title={short ? label : undefined} onClick={() => setTab(n)}>
                <NetBadge network={n} color={network(n)?.color} size={18} />
                {!short && label}
                {edited && <span className="sint-tab-dot" aria-label={short ? undefined : __('Edited', 'social-integrations')} />}
              </button>
            )
          })}
        </div>
      )}
      <div className="sint-field">
        <span id={`${id}-caption`}>{all ? __('Caption', 'social-integrations') : sprintf(__('Caption for %s', 'social-integrations'), network(tab)?.label ?? tab)}</span>
        <Suspense fallback={<div className="sint-cap sint-skeleton" style={{ minHeight: 132 }} />}>
          <CaptionInput
            key={tab}
            value={text}
            onChange={setText}
            tokens={tokens}
            chips={{ fields, fieldKeys }}
            labelledBy={`${id}-caption`}
            placeholder={all ? placeholder : value.caption || placeholder}
            insertRef={insert}
            formats
            tools={<CaptionTools text={text} onApply={setText} template tokens={tokens} limit={Math.min(500, ...(all ? nets : [tab]).map((n) => network(n)?.char_limit ?? 500))} />}
          />
        </Suspense>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tokens.map((t) => <button key={t} type="button" className="sint-chip" onClick={() => addToken(t)}>{t}</button>)}
          {postType && <FieldPicker label={__('Custom field', 'social-integrations')} fields={fields} loading={fieldsFetch.loading} onPick={(f) => addToken(`{field:${f.key}}`)} />}
        </span>
        <TokenIssues issues={checkTokens(text, tokens, fieldKeys)} onFix={(from, to) => setText(text.split(from).join(to))} />
        {hasMarks(text) && <small>{__('Text styles use special characters on most networks. Screen readers can read them incorrectly. Use them for a small number of words. Telegram, Discord and Reddit show real styles.', 'social-integrations')}</small>}
        {all ? hint && <small>{hint}</small> : <small>{__('Leave empty to use the caption for all networks.', 'social-integrations')}</small>}
      </div>
      <label className="sint-field" style={{ maxWidth: 320 }}>
        <span>{__('Media', 'social-integrations')}</span>
        <select className="sint-select" value={value.media} onChange={(e) => onChange({ media: e.target.value as MediaSource, media_field: e.target.value === 'field' ? value.media_field || mediaFields[0]?.key || '' : '' })}>
          {sources.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      {value.media === 'field' && (
        <div className="sint-field" style={{ maxWidth: 320 }}>
          <span id={`${id}-field`}>{__('Field with the images', 'social-integrations')}</span>
          <select aria-labelledby={`${id}-field`} aria-describedby={`${id}-field-help`} className="sint-select" value={value.media_field ?? ''} onChange={(e) => onChange({ media_field: e.target.value })}>
            {/* A saved field that the latest posts do not have stays in the list. */}
            {value.media_field && !mediaFields.some((f) => f.key === value.media_field) && <option value={value.media_field}>{value.media_field}</option>}
            {mediaFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <small id={`${id}-field-help`}>{__('When a post has no images in this field, the share has no media.', 'social-integrations')}</small>
        </div>
      )}
      {value.media === 'none' && <MediaWarning nets={all ? nets : [tab]} media={[]} template />}
      {value.media === 'custom' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {value.custom_media.map((m, i) => (
            <button key={m.id} type="button" className="sint-media" aria-pressed="true" aria-label={sprintf(__('Remove image %d', 'social-integrations'), i + 1)} onClick={() => onChange({ custom_media: value.custom_media.filter((x) => x.id !== m.id) })}>
              {m.type === 'image' ? <img src={m.url} alt="" width={104} height={104} loading="lazy" decoding="async" /> : <Icon name="image" size={24} />}
              <span>{__('Remove', 'social-integrations')}</span>
            </button>
          ))}
          <button type="button" className="sint-media add" onClick={addMedia}>
            <Icon name="plus" size={22} stroke={2} />
            <span>{__('Add', 'social-integrations')}</span>
          </button>
        </div>
      )}
      {all && (
        <div className="sint-field">
          <span id={`${id}-link`}>{__('Link', 'social-integrations')}</span>
          <input aria-labelledby={`${id}-link`} aria-describedby={`${id}-link-help`} className="sint-input" value={value.link ?? ''} placeholder="{url}" onChange={(e) => onChange({ link: e.target.value })} />
          {postType && (
            <span>
              <FieldPicker label={__('Link from a custom field', 'social-integrations')} fields={fields} loading={fieldsFetch.loading} onPick={(f) => onChange({ link: `{field:${f.key}}` })} />
            </span>
          )}
          <TokenIssues issues={checkTokens(value.link ?? '', tokens, fieldKeys)} onFix={(from, to) => onChange({ link: (value.link ?? '').split(from).join(to) })} />
          <small id={`${id}-link-help`}>{postType ? __('Leave empty to use the link of the post. To use a link from the post, select a custom field.', 'social-integrations') : __('Leave empty to use the link of the post.', 'social-integrations')}</small>
        </div>
      )}
      <PostFields
        nets={nets}
        tab={tab}
        value={Array.isArray(value.fields) ? {} : value.fields ?? {}}
        onChange={(fields) => onChange({ fields })}
        base={(_net, field) => field.default}
        tokens={tokens}
        fieldKeys={fieldKeys}
        fieldList={fields}
        collapsible
      />
    </>
  )
}

