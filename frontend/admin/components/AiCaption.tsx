import { lazy, Suspense, useId, useState } from 'react'
import { api } from '../lib/api'
import { config } from '../lib/config'
import { useFetch } from '../lib/hooks'
import { __, sprintf } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { ContentItem, CustomField } from '../lib/types'
import { TOKENS } from './TemplateEditor'
import { Icon, Segmented, useToast } from './ui'

const CaptionInput = lazy(() => import('./caption/CaptionInput'))

/** The AI settings of an auto-post campaign. */
export interface AiSettings {
  on: boolean
  /** Instructions for the AI, a template with tokens such as {title}. */
  prompt: string
  /** A tone from Settings' list, or '' for the tone in Settings. */
  tone: string
}

export const NO_AI: AiSettings = { on: false, prompt: '', tone: '' }

const TONES = (): [string, string][] => [
  ['', __('Tone from Settings', 'social-integrations')],
  ['friendly', __('Friendly', 'social-integrations')],
  ['professional', __('Professional', 'social-integrations')],
  ['playful', __('Playful', 'social-integrations')],
  ['informative', __('Informative', 'social-integrations')],
  ['bold', __('Bold', 'social-integrations')],
]

/**
 * Where the caption of an auto-post campaign comes from: the template, or the AI with the user's
 * instructions. The instructions use tokens, and a test writes a caption for the latest post.
 */
export function AiCaption({ value, onChange, postType, sample }: { value: AiSettings; onChange: (ai: AiSettings) => void; postType: string; sample: ContentItem | null | undefined }) {
  const { postTypes } = useStore()
  const toast = useToast()
  const id = useId()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState('')
  const fieldsFetch = useFetch<CustomField[]>(`post-types/${encodeURIComponent(postType)}/fields`)
  const fields = fieldsFetch.data ?? []
  const tokens = [...TOKENS, ...(postTypes.find((t) => t.name === postType)?.tokens ?? []).map((t) => `{${t}}`)]
  const set = (patch: Partial<AiSettings>) => onChange({ ...value, ...patch })

  if (!config.ai.ready && !value.on) return null

  const test = async () => {
    if (!sample) return
    setTesting(true)
    try {
      const r = await api.post<{ caption: string }>('ai/caption', { mode: 'prompt', post_id: sample.id, prompt: value.prompt, ...(value.tone ? { tone: value.tone } : {}), limit: 600 })
      setResult(r.data.caption)
    } catch (e) {
      toast((e as Error).message, true)
    }
    setTesting(false)
  }

  return (
    <div className="sint-ai-caption">
      <div className="sint-field">
        <span>{__('Caption', 'social-integrations')}</span>
        <Segmented<string>
          label={__('Caption', 'social-integrations')}
          value={value.on ? 'ai' : 'template'}
          onChange={(v) => set({ on: v === 'ai' })}
          options={[
            { value: 'template', label: __('Use the template', 'social-integrations') },
            { value: 'ai', label: __('Write with AI', 'social-integrations') },
          ]}
        />
      </div>
      {value.on && (
        <>
          {!config.ai.ready && <p className="sint-banner warn" role="note">{__('The AI is not set up. In Settings, select an AI provider and enter its API key. Until then, the plugin uses the template caption.', 'social-integrations')}</p>}
          <div className="sint-field">
            <span id={`${id}-prompt`}>{__('Instructions for the AI', 'social-integrations')}</span>
            <Suspense fallback={<div className="sint-cap sint-skeleton" style={{ minHeight: 110 }} />}>
              <CaptionInput
                value={value.prompt}
                onChange={(prompt) => set({ prompt })}
                tokens={tokens}
                chips={{ fields, fieldKeys: fieldsFetch.data && !fieldsFetch.error ? fields.map((f) => f.key) : null }}
                labelledBy={`${id}-prompt`}
                placeholder={__('For example: Write a short caption for {title}. Say the price {price}.', 'social-integrations')}
              />
            </Suspense>
            <small>{__('The plugin puts the values of the post into the tokens before it asks the AI. Type { and a token name, such as {title}.', 'social-integrations')}</small>
          </div>
          <label className="sint-field" style={{ maxWidth: 320 }}>
            <span>{__('Tone', 'social-integrations')}</span>
            <select className="sint-select" value={value.tone} onChange={(e) => set({ tone: e.target.value })}>
              {TONES().map(([v, label]) => <option key={v || 'settings'} value={v}>{label}</option>)}
            </select>
          </label>
          <p className="sint-ai-caption-note">
            <Icon name="sparkle" size={15} stroke={2} />
            <span>{__('The AI writes the caption one time for each new post, with your API key. The plugin makes it fit each network. When the AI fails, the plugin uses the template caption below.', 'social-integrations')}</span>
          </p>
          {config.ai.ready && (
            <div className="sint-ai-caption-test">
              <button type="button" className="sint-btn ai" disabled={testing || !sample || !value.prompt.trim()} onClick={test}>
                <Icon name="sparkle" size={15} stroke={2} />
                {testing ? __('Wait…', 'social-integrations') : __('Test with the latest post', 'social-integrations')}
              </button>
              {sample && <span className="sint-sub">{sprintf(__('Latest post: %s', 'social-integrations'), sample.title || __('(no title)', 'social-integrations'))}</span>}
            </div>
          )}
          {result && (
            <div className="sint-ai-caption-result" role="status">
              <span className="sint-label">{__('Test result', 'social-integrations')}</span>
              <p>{result}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
