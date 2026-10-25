import { errorText, getPreview, getState, type EditorPreview, type EditorState } from './api'
import { CAPTION_ID, CaptionTools } from './CaptionTools'
import { delayText, networkName, ruleLabel, statusLabel } from './labels'
import { __, config, Fragment, h, sprintf, useEffect, useRef, useState, wp, type FieldMap, type PostField } from './wp'

const { PanelBody, ToggleControl, CheckboxControl, TextareaControl, TextControl, SelectControl, Button, Notice, Spinner, ExternalLink } = wp.components

interface Meta {
  _sint_disabled?: boolean
  _sint_caption?: string
  _sint_accounts?: string[]
  _sint_fields?: FieldMap | []
}

/** Fields with the same meaning on each network; the panel sets them for all networks of the post. */
const SHARED = ['format', 'title', 'description', 'first_comment']

/** The post's field values, without the empty JSON array that PHP sends for an empty map. */
const fieldsOf = (meta: Meta): FieldMap => (meta._sint_fields && !Array.isArray(meta._sint_fields) ? meta._sint_fields : {})

/** Networks that the post goes to: the chosen accounts, else the accounts of its campaigns. */
function postNetworks(state: EditorState, chosen: string[]): string[] {
  const ids = chosen.length ? chosen : state.campaigns.flatMap((c) => (c.accounts.length ? c.accounts : state.accounts.map((a) => a.id)))
  return Array.from(new Set(state.accounts.filter((a) => ids.includes(a.id)).map((a) => a.network)))
}

/** The values of the post in the editor, saved or not. */
function usePost() {
  return wp.data.useSelect((select) => {
    const editor = select('core/editor')
    return {
      id: editor.getCurrentPostId() as number,
      status: editor.getEditedPostAttribute('status') as string,
      title: (editor.getEditedPostAttribute('title') as string) ?? '',
      excerpt: (editor.getEditedPostAttribute('excerpt') as string) ?? '',
      content: editor.getEditedPostContent() as string,
      meta: ((editor.getEditedPostAttribute('meta') as Meta) ?? {}) as Meta,
      saving: (editor.isSavingPost() && !editor.isAutosavingPost()) as boolean,
    }
  }, [])
}

/** The content of the Social Integrations sidebar. */
export function SidebarContent() {
  const post = usePost()
  const { editPost } = wp.data.useDispatch('core/editor')
  const [state, setState] = useState<EditorState | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const wasSaving = useRef(false)

  const load = () => {
    setLoading(true)
    getState(post.id)
      .then((s) => {
        setState(s)
        setError('')
      })
      .catch((e: unknown) => setError(errorText(e, __('The share status did not load.', 'social-integrations'))))
      .finally(() => setLoading(false))
  }

  // Load on open, and again after each save, so new shares show.
  useEffect(() => {
    if (wasSaving.current && !post.saving) {
      load()
    }
    wasSaving.current = post.saving
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.saving])
  useEffect(load, [post.id])

  const setMeta = (meta: Meta) => editPost({ meta })

  if (error && !state) {
    return (
      <Notice status="error" isDismissible={false} actions={loading ? [] : [{ label: __('Try again', 'social-integrations'), onClick: load }]}>
        {error}
        {loading && <Spinner />}
      </Notice>
    )
  }
  if (!state) {
    return <div className="sint-ed-loading"><Spinner /></div>
  }

  return (
    <Fragment>
      <SharePanel state={state} published={post.status === 'publish' || post.status === 'future' ? post.status : ''} disabled={!!post.meta._sint_disabled} onChange={(on) => setMeta({ _sint_disabled: !on })} />
      {state.can_manage && (
        <Fragment>
          <AccountsPanel state={state} chosen={post.meta._sint_accounts ?? []} onChange={(ids) => setMeta({ _sint_accounts: ids })} />
          <FieldsPanel nets={postNetworks(state, post.meta._sint_accounts ?? [])} fields={fieldsOf(post.meta)} onChange={(fields) => setMeta({ _sint_fields: fields })} />
          <CaptionPanel post={post} nets={postNetworks(state, post.meta._sint_accounts ?? [])} onChange={(caption) => setMeta({ _sint_caption: caption })} />
        </Fragment>
      )}
      <SharesPanel state={state} loading={loading} error={error} onRefresh={load} />
    </Fragment>
  )
}

function SharePanel({ state, published, disabled, onChange }: { state: EditorState; published: string; disabled: boolean; onChange: (on: boolean) => void }) {
  // A post shares once, when it is first published. A post that was published before
  // does not share on an update.
  const closed = state.shared || published === 'publish'
  let help: string
  if (state.shared) {
    help = __('The plugin shared this post when you published it. An update does not share it again.', 'social-integrations')
  } else if (published === 'publish') {
    help = __('This post is published. The plugin shares a post only when you publish it for the first time.', 'social-integrations')
  } else if (!state.campaigns.length) {
    help = __('No auto-post campaign shares this post type.', 'social-integrations')
  } else if (disabled) {
    help = __('The plugin does not share this post when you publish it.', 'social-integrations')
  } else {
    const delays = Array.from(new Set(state.campaigns.map((c) => delayText(c.delay))))
    help = sprintf(__('The plugin shares the post %1$s after you publish it. Campaigns: %2$s.', 'social-integrations'), delays.join(', '), state.campaigns.map((c) => c.name).join(', '))
  }
  return (
    <PanelBody>
      <ToggleControl
        __nextHasNoMarginBottom
        label={__('Share when I publish', 'social-integrations')}
        checked={!disabled && !closed && state.campaigns.length > 0}
        disabled={closed || !state.campaigns.length}
        onChange={onChange}
        help={help}
      />
      {!closed && !state.campaigns.length && state.can_manage && (
        <ExternalLink href={`${config.pageUrl}#/campaigns`}>{__('Create an auto-post campaign', 'social-integrations')}</ExternalLink>
      )}
    </PanelBody>
  )
}

function AccountsPanel({ state, chosen, onChange }: { state: EditorState; chosen: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string, on: boolean) => onChange(on ? [...chosen, id] : chosen.filter((c) => c !== id))
  return (
    <PanelBody title={__('Accounts', 'social-integrations')} initialOpen={chosen.length > 0}>
      <p className="sint-ed-help">
        {chosen.length
          ? __('The plugin shares this post only to the accounts that you select.', 'social-integrations')
          : __('Each campaign shares to its own accounts. Select accounts to use other accounts for this post.', 'social-integrations')}
      </p>
      {state.accounts.length === 0 && <p className="sint-ed-help">{__('No account is connected.', 'social-integrations')}</p>}
      {state.accounts.map((a) => (
        <CheckboxControl
          key={a.id}
          __nextHasNoMarginBottom
          label={`${a.name} · ${networkName(a.network)}`}
          help={a.status === 'expired' ? sprintf(__('%s sign-in expired. Reconnect the account.', 'social-integrations'), networkName(a.network)) : undefined}
          checked={chosen.includes(a.id)}
          onChange={(on: boolean) => toggle(a.id, on)}
        />
      ))}
      {chosen.length > 0 && (
        <Button variant="link" onClick={() => onChange([])}>{__('Use the campaign accounts', 'social-integrations')}</Button>
      )}
    </PanelBody>
  )
}

/** The shared post fields of the post's networks, once each. An empty value uses the campaign's. */
function FieldsPanel({ nets, fields, onChange }: { nets: string[]; fields: FieldMap; onChange: (fields: FieldMap) => void }) {
  const shown: { field: PostField; nets: string[] }[] = []
  for (const n of nets) {
    for (const field of config.postFields[n] ?? []) {
      if (!SHARED.includes(field.name)) continue
      const found = shown.find((x) => x.field.name === field.name)
      if (found) found.nets.push(n)
      else shown.push({ field, nets: [n] })
    }
  }
  if (shown.length === 0) return null

  const values = fields['*'] ?? {}
  const set = (name: string, value: string) => {
    const next = { ...values, [name]: value }
    if (value === '') delete next[name]
    const map: FieldMap = { ...fields, '*': next }
    if (Object.keys(next).length === 0) delete map['*']
    onChange(map)
  }

  return (
    <PanelBody title={__('Post options', 'social-integrations')} initialOpen={Object.keys(values).length > 0}>
      <p className="sint-ed-help">{__('These values replace the values of the campaign for this post. Leave a field empty to use the campaign value.', 'social-integrations')}</p>
      {shown.map(({ field, nets: on }) => {
        const help = `${sprintf(__('For %s.', 'social-integrations'), on.map(networkName).join(', '))}${field.tokens ? ` ${__('You can use {title}, {excerpt}, {url}, {tags} and {author}.', 'social-integrations')}` : ''}`
        const value = values[field.name] ?? ''
        if (field.type === 'select') {
          return (
            <SelectControl
              key={field.name}
              __nextHasNoMarginBottom
              label={field.label}
              value={value}
              options={[{ value: '', label: __('Campaign setting', 'social-integrations') }, ...(field.options ?? [])]}
              onChange={(v: string) => set(field.name, v)}
              help={help}
            />
          )
        }
        const Control = field.type === 'textarea' ? TextareaControl : TextControl
        return <Control key={field.name} __nextHasNoMarginBottom label={field.label} value={value} rows={field.type === 'textarea' ? 3 : undefined} onChange={(v: string) => set(field.name, v)} help={help} />
      })}
    </PanelBody>
  )
}

function CaptionPanel({ post, nets, onChange }: { post: ReturnType<typeof usePost>; nets: string[]; onChange: (caption: string) => void }) {
  const caption = post.meta._sint_caption ?? ''
  const fields = fieldsOf(post.meta)
  const fieldsKey = JSON.stringify(fields)
  const [preview, setPreview] = useState<EditorPreview | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)

  // The preview follows the editor, one second after the last change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      getPreview(post.id, { title: post.title, content: post.content, excerpt: post.excerpt, caption, fields })
        .then((p) => {
          setPreview(p)
          setPreviewFailed(false)
        })
        .catch(() => {
          setPreview(null)
          setPreviewFailed(true)
        })
    }, 1000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, post.title, post.content, post.excerpt, caption, fieldsKey])

  return (
    <Fragment>
      <PanelBody title={__('Caption', 'social-integrations')} initialOpen={caption !== ''}>
        <TextareaControl
          __nextHasNoMarginBottom
          id={CAPTION_ID}
          label={__('Caption for this post', 'social-integrations')}
          value={caption}
          rows={5}
          onChange={onChange}
          help={__('Leave it empty to use the caption of the campaign. Select a token to put a value of the post in the caption.', 'social-integrations')}
        />
        <CaptionTools postId={post.id} caption={caption} onChange={onChange} />
        <p className="sint-ed-help">{__('The AI reads the last saved version of the post.', 'social-integrations')}</p>
      </PanelBody>
      <PanelBody title={__('Preview', 'social-integrations')} initialOpen={false}>
        {!preview && !previewFailed && <Spinner />}
        {previewFailed && <p className="sint-ed-help">{__('The preview did not load. Change the post to try again.', 'social-integrations')}</p>}
        {preview && (
          <Fragment>
            <div className="sint-ed-preview">{preview.caption || __('The caption is empty.', 'social-integrations')}</div>
            {preview.media.length > 0 && (
              <div className="sint-ed-media">
                {preview.media.slice(0, 4).map((m, i) => (m.type === 'video' ? <span key={i} className="sint-ed-video">{__('Video', 'social-integrations')}</span> : <img key={i} src={m.url} alt="" />))}
              </div>
            )}
            <FieldLines nets={nets} fields={Array.isArray(preview.fields) ? {} : preview.fields} />
            {preview.blocks.length > 0 && (
              <Fragment>
                <h3 className="sint-ed-sub">{__('Blocks in the post', 'social-integrations')}</h3>
                <ul className="sint-ed-blocks">
                  {preview.blocks.map((b, i) => (
                    <li key={i}>
                      <span>{wp.blocks.getBlockType(b.name)?.title ?? b.name}</span>
                      <span className={`sint-ed-use is-${b.use}`}>{ruleLabel(b.use)}</span>
                    </li>
                  ))}
                </ul>
              </Fragment>
            )}
          </Fragment>
        )}
      </PanelBody>
    </Fragment>
  )
}

/** The filled text fields of each network, such as the first comment, that are not empty. */
function FieldLines({ nets, fields }: { nets: string[]; fields: FieldMap }) {
  const rows = nets.flatMap((n) =>
    (config.postFields[n] ?? [])
      .filter((f) => (f.type === 'text' || f.type === 'textarea') && (fields[n]?.[f.name] ?? '') !== '')
      .map((f) => ({ key: `${n}-${f.name}`, label: `${networkName(n)} · ${f.label}`, value: fields[n]![f.name]! })),
  )
  if (rows.length === 0) return null
  return (
    <dl className="sint-ed-fields">
      {rows.map((r) => (
        <Fragment key={r.key}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function SharesPanel({ state, loading, error, onRefresh }: { state: EditorState; loading: boolean; error: string; onRefresh: () => void }) {
  const format = wp.date.getSettings().formats.datetime
  return (
    <PanelBody title={__('Shares', 'social-integrations')} initialOpen={state.shares.length > 0}>
      {state.shares.length === 0 && <p className="sint-ed-help">{__('This post has no shares yet.', 'social-integrations')}</p>}
      <ul className="sint-ed-shares">
        {state.shares.map((s) => (
          <li key={s.id}>
            <div className="sint-ed-share-head">
              <strong>{s.account || networkName(s.network)}</strong>
              <span className={`sint-ed-status is-${s.status}`}>{statusLabel(s.status)}</span>
            </div>
            <div className="sint-ed-help">
              {networkName(s.network)} · {wp.date.dateI18n(format, s.scheduled_at)}
            </div>
            {s.status === 'failed' && s.message && <div className="sint-ed-error">{s.message}</div>}
            {s.remote_url && <ExternalLink href={s.remote_url}>{__('Open the post', 'social-integrations')}</ExternalLink>}
          </li>
        ))}
      </ul>
      {error && <Notice status="error" isDismissible={false}>{error}</Notice>}
      <div className="sint-ed-row">
        <Button variant="secondary" size="compact" onClick={onRefresh} isBusy={loading} disabled={loading}>
          {__('Refresh', 'social-integrations')}
        </Button>
        {state.can_manage && state.shares.length > 0 && (
          <ExternalLink href={`${config.pageUrl}#/log`}>{__('Open the share log', 'social-integrations')}</ExternalLink>
        )}
      </div>
    </PanelBody>
  )
}
