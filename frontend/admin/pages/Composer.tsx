import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, Modal, Segmented, Spinner, useToast } from '../components/ui'
import { PostFields, resolveFields } from '../components/PostFields'
import { api } from '../lib/api'
import { can, caps, config } from '../lib/config'
import { applyFilters } from '../lib/hooks'
import { localToUtc, utcToLocal } from '../lib/format'
import { __, sprintf } from '../lib/i18n'
import { pickMedia } from '../lib/media'
import { useStore } from '../lib/store'
import { AutoPost } from './AutoPost'
import { AccountPicker } from './composer/AccountPicker'
import { CaptionEditor } from './composer/CaptionEditor'
import { ContentPicker, useContentSearch } from './composer/ContentPicker'
import { defaultLocal, measure, type When } from './composer/helpers'
import { MediaPicker } from './composer/MediaPicker'
import { Preview } from './composer/Preview'
import { TimingFooter } from './composer/TimingFooter'
import type { Account, BuiltShare, ContentItem, FieldMap, MediaItem, MediaSource, PostField, QueueItem } from '../lib/types'

export interface ComposerSeed {
  postId?: number
  /** A draft, scheduled or failed share to edit. */
  item?: QueueItem
  /** A share to start a new one from. */
  copy?: QueueItem
  /** A time to schedule a new share for, as UTC ISO. */
  at?: string
  /** A campaign to edit, or to start a new one from (`copy`). */
  campaign?: CampaignRef
}

/** A campaign the composer opens: its `type` selects the tab. */
export interface CampaignRef {
  type: string
  id: number | string
  accounts?: string[]
  copy?: boolean
}

/** A single campaign, as GET campaigns/{id} returns it. */
interface SingleCampaign {
  id: number
  post_id: number
  caption: string
  captions: Record<string, string> | []
  accounts: string[]
  media: MediaItem[]
  /** Post field values: network => name => value. */
  fields?: FieldMap | []
  scheduled_at: string
  draft: boolean
  options: Record<string, unknown> | []
}

/** Props for a `sint.composer.options` control, shown next to the timing of a new share. */
export interface ComposerOptionProps {
  /** Every control's values; sent with the new share as `options`. */
  options: Record<string, unknown>
  setOption: (key: string, value: unknown) => void
  when: When
  /** Site-time datetime-local value of the selected time. */
  local: string
}

/** Props for a `sint.composer.modes` mode, which renders the modal's body and its own actions. */
export interface ComposerModeProps {
  accounts: Account[]
  selected: string[]
  onClose: () => void
  onSaved: () => void
  /** The campaign of this mode's type that the user edits or copies. */
  campaign?: CampaignRef
}

interface ComposerMode {
  value: string
  label: string
  component: (props: ComposerModeProps) => JSX.Element
}

type ShareResult = { network: string; status: string; message?: string }

/** Adds items whose URL is not in the list yet. */
const addNew = (list: MediaItem[], items: MediaItem[]) => [...list, ...items.filter((x) => !list.some((y) => y.url === x.url))]

const noArray = <T extends object>(value: T | []): T | Record<string, never> => (Array.isArray(value) ? {} : value)

export function Composer({ seed, onClose, onSaved }: { seed: ComposerSeed; onClose: () => void; onSaved: () => void }) {
  const { accounts, network } = useStore()
  const toast = useToast()
  const connected = accounts.filter((a) => a.status === 'connected')
  // An edited share belongs to one account and one post; only its text, media and time change.
  const item = seed.item
  const upcoming = item?.status === 'scheduled' && Date.parse(item.scheduled_at) > Date.now()
  // A duplicate starts from another share's text, media and post, as a new share.
  const from = item ?? seed.copy

  const campaign = seed.campaign
  const editing = campaign && !campaign.copy ? campaign : undefined
  const [selected, setSelected] = useState<string[]>(() => {
    if (item) return [item.account_id]
    if (campaign?.accounts?.length) return campaign.accounts.filter((id) => connected.some((a) => a.id === id))
    const all = connected.map((a) => a.id)
    return seed.copy && all.includes(seed.copy.account_id) ? [seed.copy.account_id] : all
  })
  const contentSearch = useContentSearch()
  const [postId, setPostId] = useState<number | undefined>(seed.postId ?? (from?.post_id || undefined))
  const [picked, setPicked] = useState<ContentItem | null>(null)
  const [built, setBuilt] = useState<BuiltShare | null>(null)
  const [caption, setCaption] = useState(from?.caption ?? '')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [tab, setTab] = useState('all')
  const [previewPick, setPreviewPick] = useState('')
  const [media, setMedia] = useState<MediaItem[]>(from?.media ?? [])
  const [mediaOn, setMediaOn] = useState<string[]>(from?.media.map((m) => m.url) ?? [])
  // Post field values that the user set; other fields use the values built from the post.
  const [fields, setFields] = useState<FieldMap>(() => (from && !Array.isArray(from.fields) && from.fields ? { [from.network]: from.fields } : {}))
  const [when, setWhen] = useState<When>(upcoming || seed.at ? 'pick' : 'now')
  const [local, setLocal] = useState(() => (upcoming ? utcToLocal(item!.scheduled_at) : seed.at ? utcToLocal(seed.at) : defaultLocal()))
  const [busy, setBusy] = useState(false)
  // A saved single campaign loads before its form shows, so the answer cannot replace what the user types.
  const [opening, setOpening] = useState(campaign?.type === 'single')
  // True while the caption and media of the selected post load.
  const [building, setBuilding] = useState(false)
  const [writing, setWriting] = useState(false)
  // The text before the last AI answer, for Undo.
  const [beforeAI, setBeforeAI] = useState<string | null>(null)
  const [mediaFrom, setMediaFrom] = useState<MediaSource | ''>('')
  const [mode, setMode] = useState(campaign ? campaign.type : 'single')
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const keepSaved = useRef(!!from)

  // Filter `sint.composer.modes`: other ways to share from this modal, such as many posts at the same time.
  const modes = item ? [] : [...applyFilters<ComposerMode[]>('sint.composer.modes', []), { value: 'auto', label: __('Auto-post', 'social-integrations'), component: AutoPost }]
  const Mode = modes.find((m) => m.value === mode)?.component
  // Filter `sint.composer.options`: controls next to the timing of a new share, such as a control that repeats it.
  const optionControls = item ? [] : applyFilters<{ key: string; component: (props: ComposerOptionProps) => JSX.Element }[]>('sint.composer.options', [])
  const setOption = (key: string, value: unknown) => setOptions((o) => ({ ...o, [key]: value }))

  /** Shows the post's built caption and media. */
  const applyBuilt = (share: BuiltShare) => {
    setCaption(share.caption)
    setOverrides(noArray(share.captions))
    setMedia(share.media)
    setMediaOn(share.media.map((m) => m.url))
    setFields({})
  }

  // A single campaign opens with what it was saved with.
  useEffect(() => {
    if (campaign?.type !== 'single') return
    api.get<SingleCampaign>(`campaigns/${campaign.id}`).then((r) => {
      const c = r.data
      keepSaved.current = !!c.post_id
      setCaption(c.caption)
      setOverrides(noArray(c.captions))
      setMedia(c.media)
      setMediaOn(c.media.map((m) => m.url))
      setFields(c.fields ? noArray(c.fields) : {})
      setSelected(c.accounts.filter((id) => connected.some((a) => a.id === id)))
      setOptions(noArray(c.options))
      if (c.scheduled_at && Date.parse(c.scheduled_at) > Date.now()) {
        setWhen('pick')
        setLocal(utcToLocal(c.scheduled_at))
      }
      if (c.post_id) setPostId(c.post_id)
    }, (e) => toast((e as Error).message, true)).finally(() => setOpening(false))
  }, [])

  useEffect(() => {
    if (!postId) return
    setMediaFrom('')
    setBuilding(true)
    api.get<BuiltShare>(`content/${postId}/share`).then((r) => {
      setBuilt(r.data)
      if (keepSaved.current) {
        // Keep the saved caption and media choice; still offer the post's other media.
        keepSaved.current = false
        setMedia((m) => addNew(m, r.data.media))
        return
      }
      applyBuilt(r.data)
    }, (e) => toast((e as Error).message, true)).finally(() => setBuilding(false))
  }, [postId])

  /** Media from another source; images added by hand stay. */
  const changeMediaFrom = (source: MediaSource | '') => {
    setMediaFrom(source)
    if (!postId) return
    setBuilding(true)
    api.get<BuiltShare>(`content/${postId}/share${source ? `?media=${source}` : ''}`).then((r) => {
      const fromPost = new Set(built?.media.map((m) => m.url) ?? [])
      const added = media.filter((m) => !fromPost.has(m.url))
      setBuilt((b) => (b ? { ...b, media: r.data.media } : r.data))
      setMedia(addNew(r.data.media, added))
      setMediaOn([...r.data.media.map((m) => m.url), ...added.filter((m) => mediaOn.includes(m.url)).map((m) => m.url)])
    }, (e) => toast((e as Error).message, true)).finally(() => setBuilding(false))
  }

  const pickPost = (r: ContentItem) => {
    setPostId(r.id)
    setPicked(r)
  }

  const clearPost = () => {
    setPostId(undefined)
    setPicked(null)
    setBuilt(null)
    setMedia([])
    setMediaOn([])
  }

  const nets = useMemo(() => Array.from(new Set(connected.filter((a) => selected.includes(a.id)).map((a) => a.network))), [connected, selected])
  const captionFor = (n: string) => overrides[n] ?? caption
  const text = tab === 'all' ? caption : captionFor(tab)
  const setText = (v: string) => (tab === 'all' ? setCaption(v) : setOverrides((o) => ({ ...o, [tab]: v })))
  const chosenMedia = media.filter((m) => mediaOn.includes(m.url))
  // A field without a value uses the value built from the post; without a post, a template field is empty.
  const fieldBase = (n: string, field: PostField) => built?.fields?.[n]?.[field.name] ?? (field.tokens ? '' : field.default)
  const fieldsFor = (list: string[]) => resolveFields(fields, list, network, fieldBase)
  const title = contentSearch.results.find((r) => r.id === postId)?.title ?? built?.tokens.title ?? ''
  const over = nets.filter((n) => measure(captionFor(n), network(n)) > (network(n)?.char_limit ?? Infinity))
  const canSend = !busy && !building && !opening && selected.length > 0 && caption.trim() !== '' && over.length === 0
  const live = picked?.id === postId && picked?.status === 'future' ? picked.date : ''
  // With a post selected and its built caption unchanged, AI writes a new caption; otherwise it improves the text.
  const fresh = !!postId && text === (built?.caption ?? '')

  /** Writes a draft of the current tab's caption from the post, or improves the current text. */
  const writeWithAI = async () => {
    const limits = (tab === 'all' ? nets : [tab]).map((n) => network(n)?.char_limit ?? 500)
    setWriting(true)
    try {
      const r = await api.post<{ caption: string }>('ai/caption', { post_id: postId, text: fresh ? '' : text, limit: Math.min(500, ...limits) })
      setBeforeAI(text)
      setText(r.data.caption)
    } catch (e) {
      toast((e as Error).message, true)
    }
    setWriting(false)
  }

  const addMedia = () => {
    const opened = pickMedia((items) => {
      setMedia((m) => addNew(m, items))
      setMediaOn((on) => [...on, ...items.map((x) => x.url).filter((u) => !on.includes(u))])
    })
    if (!opened) toast(__('The media library did not load. Reload the page and try again.', 'social-integrations'), true)
  }

  const toggleMedia = (url: string) => setMediaOn((s) => (s.includes(url) ? s.filter((x) => x !== url) : [...s, url]))

  const rejected = (r: ShareResult) => r.message || sprintf(__('%s did not accept the post.', 'social-integrations'), network(r.network)?.label ?? r.network)

  /** Saves an edited share; shares it now when the time is "Now". Returns false to keep the modal open. */
  const saveItem = async (queued: QueueItem, draft: boolean): Promise<boolean> => {
    const r = await api.post<{ result?: { status: string; message?: string } }>(`queue/${queued.id}`, {
      caption: captionFor(queued.network),
      media: chosenMedia,
      fields: fieldsFor([queued.network])[queued.network],
      scheduled_at: when === 'pick' ? localToUtc(local) : '',
      draft,
    })
    const result = r.data.result
    if (result && result.status !== 'published') {
      toast(rejected({ network: queued.network, ...result }), true)
      return false
    }
    toast(draft ? __('Draft saved.', 'social-integrations') : result ? __('Shared.', 'social-integrations') : __('Saved to the calendar.', 'social-integrations'))
    return true
  }

  /** Saves a new share, or an edited single campaign. Returns false to keep the modal open. */
  const saveNew = async (draft: boolean): Promise<boolean> => {
    const captions: Record<string, string> = {}
    nets.forEach((n) => { if (overrides[n] !== undefined) captions[n] = overrides[n]! })
    const r = await api.post<{ created: number[]; results?: ShareResult[] }>(editing?.type === 'single' ? `campaigns/${editing.id}` : 'queue', {
      post_id: postId,
      caption,
      captions,
      accounts: selected,
      media: chosenMedia,
      link: built?.link,
      fields,
      field_values: fieldsFor(nets),
      scheduled_at: when === 'pick' ? localToUtc(local) : '',
      draft,
      options,
    })
    const failed = (r.data.results ?? []).filter((x) => x.status !== 'published')
    if (failed.length) {
      // Keep the composer open so the user can fix the caption or reconnect and try again.
      toast(failed.map(rejected).join(' '), true)
      return false
    }
    toast(draft ? __('Draft saved.', 'social-integrations') : r.data.results ? sprintf(__('Shared to %d accounts.', 'social-integrations'), r.data.results.length) : editing ? __('Saved to the calendar.', 'social-integrations') : __('Added to the calendar.', 'social-integrations'))
    return true
  }

  const save = async (draft: boolean) => {
    setBusy(true)
    try {
      const done = item ? await saveItem(item, draft) : await saveNew(draft)
      if (done) return onSaved()
    } catch (e) {
      toast((e as Error).message, true)
    }
    setBusy(false)
  }

  const preview = tab !== 'all' ? tab : nets.includes(previewPick) ? previewPick : nets[0]
  const linkImage = picked?.thumbnail || media[0]?.url
  // The preview shows what the post format sends: media, a link card, or the text only.
  const shown = preview ? fieldsFor([preview])[preview] ?? {} : {}
  const format = shown.format ?? 'auto'

  return (
    <Modal
      title={item ? __('Edit post', 'social-integrations') : editing ? __('Edit campaign', 'social-integrations') : __('New campaign', 'social-integrations')}
      onClose={onClose}
      footer={Mode ? undefined : (
        <TimingFooter when={when} setWhen={setWhen} local={local} setLocal={setLocal} live={live ? utcToLocal(live) : ''} optionControls={optionControls} options={options} setOption={setOption}>
          <button type="button" className="sint-btn ghost" disabled={busy || building || opening || !selected.length} onClick={() => save(true)}>{__('Save draft', 'social-integrations')}</button>
          {!can(caps.publish) && <span className="sint-sub" style={{ margin: 0, fontSize: 12 }}>{__('You save drafts only. A user who can publish schedules them.', 'social-integrations')}</span>}
          {can(caps.publish) && <button type="button" className="sint-btn primary" disabled={!canSend} title={over.length ? sprintf(__('Shorten the %s caption first.', 'social-integrations'), over.map((n) => network(n)?.label ?? n).join(', ')) : undefined} onClick={() => save(false)}>
            {when === 'now' ? __('Share now', 'social-integrations') : upcoming || editing ? __('Save', 'social-integrations') : __('Add to calendar', 'social-integrations')}
          </button>}
        </TimingFooter>
      )}
      headerExtra={
        <>
          {modes.length > 0 && !editing && (
            <Segmented<string> label={__('What to share', 'social-integrations')} value={mode} onChange={setMode} options={[{ value: 'single', label: __('Single post', 'social-integrations') }, ...modes.map((m) => ({ value: m.value, label: m.label }))]} />
          )}
          {!Mode && <span style={{ fontSize: 12, color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{building && <Spinner size={12} />}{title}</span>}
        </>
      }
    >
      {mode !== 'auto' && (
        <AccountPicker accounts={accounts.filter((a) => !item || a.id === item.account_id)} connected={connected} selected={selected} setSelected={setSelected} locked={!!item} onClose={onClose} />
      )}

      {Mode ? <Mode accounts={connected} selected={selected} onClose={onClose} onSaved={onSaved} campaign={campaign?.type === mode ? campaign : undefined} /> : (
        <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 0 }}>
          {!item && <ContentPicker search={contentSearch} postId={postId} onPick={pickPost} onClear={clearPost} />}

          <section className={building ? 'sint-loading' : undefined} aria-busy={building || opening} style={{ flex: '999 1 440px', minWidth: 0, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {opening ? (
              <>
                <span className="sint-sr">{__('Loading', 'social-integrations')}</span>
                <div className="sint-skeleton" style={{ height: 44 }} />
                <div className="sint-skeleton" style={{ height: 200 }} />
                <div className="sint-skeleton" style={{ height: 88 }} />
              </>
            ) : (
            <>
            <CaptionEditor
              nets={nets}
              tab={tab}
              setTab={setTab}
              edited={(n) => overrides[n] !== undefined}
              text={text}
              setText={setText}
              captionFor={captionFor}
              tokens={built?.tokens}
              onSubmit={() => { if (canSend) save(false) }}
              actions={
                <>
                  {config.ai.ready && (postId || text.trim()) && (
                    <button type="button" className="sint-btn ai sm" disabled={writing} onClick={writeWithAI}>
                      <Icon name="sparkle" size={15} stroke={2} />
                      {writing ? __('Wait…', 'social-integrations') : fresh ? __('Write with AI', 'social-integrations') : __('Improve with AI', 'social-integrations')}
                    </button>
                  )}
                  {beforeAI !== null && !writing && (
                    <button type="button" className="sint-btn ghost sm" onClick={() => { setText(beforeAI); setBeforeAI(null) }}>{__('Undo', 'social-integrations')}</button>
                  )}
                  <button type="button" className="sint-btn ghost sm" onClick={addMedia}>
                    <Icon name="image" size={15} stroke={2} />
                    {__('Add media', 'social-integrations')}
                  </button>
                  {built && tab === 'all' && caption !== built.caption && (
                    <button type="button" className="sint-btn ghost sm" onClick={() => setCaption(built.caption)}>
                      <Icon name="retry" size={15} stroke={2} />
                      {__('Rebuild from post', 'social-integrations')}
                    </button>
                  )}
                  {tab !== 'all' && overrides[tab] !== undefined && (
                    <button type="button" className="sint-btn ghost sm" onClick={() => setOverrides((o) => { const n = { ...o }; delete n[tab]; return n })}>{__('Use the shared caption', 'social-integrations')}</button>
                  )}
                </>
              }
            />

            {(media.length > 0 || !!postId) && (
              <MediaPicker media={media} chosen={chosenMedia} toggle={toggleMedia} onAdd={addMedia} mediaFrom={postId ? { value: mediaFrom, onChange: changeMediaFrom } : undefined} />
            )}

            <PostFields nets={nets} tab={tab} value={fields} onChange={setFields} base={fieldBase} />
            </>
            )}
          </section>

          <Preview
            nets={nets}
            preview={preview}
            canSwitch={tab === 'all' && nets.length > 1}
            setPreview={setPreviewPick}
            captionFor={captionFor}
            account={connected.find((a) => a.network === preview)}
            chosenMedia={format === 'auto' ? chosenMedia : []}
            link={built?.link && format !== 'text' ? { url: built.link, title: shown.title || built.tokens.title || '', description: shown.description, image: linkImage } : undefined}
            comment={shown.first_comment}
          />
        </div>
      )}
    </Modal>
  )
}
