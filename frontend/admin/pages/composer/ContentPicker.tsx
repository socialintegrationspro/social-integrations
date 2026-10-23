import { useEffect, useState } from 'react'
import { Icon, typeColor } from '../../components/ui'
import { api, query } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import { __, sprintf } from '../../lib/i18n'
import { useStore } from '../../lib/store'
import type { ContentItem } from '../../lib/types'

/** Search state for the content list; results load 250 ms after the last change. */
export function useContentSearch() {
  const [type, setType] = useState('any')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ContentItem[]>([])
  // False until the first answer, so the list does not show "no posts" while it loads.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<ContentItem[]>(`content?${query({ type, search, per_page: 8 })}`)
        .then((r) => setResults(r.data), () => setResults([]))
        .finally(() => setLoaded(true))
    }, 250)
    return () => clearTimeout(t)
  }, [type, search])

  return { type, setType, search, setSearch, results, loaded }
}

interface Props {
  search: ReturnType<typeof useContentSearch>
  postId?: number
  onPick: (item: ContentItem) => void
  onClear: () => void
}

/** The "From your site" column: search posts of any type and select one to share. */
export function ContentPicker({ search: { type, setType, search, setSearch, results, loaded }, postId, onPick, onClear }: Props) {
  const { postTypes } = useStore()
  const types = postTypes.map((t) => t.name)

  return (
    <aside style={{ flex: '1 1 280px', borderRight: '1px solid var(--line)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div className="sint-label">{__('From your site', 'social-integrations')}</div>
      <label className="sint-search" style={{ minWidth: 0 }}>
        <Icon name="search" size={16} stroke={2} />
        <span className="sint-sr">{__('Search content', 'social-integrations')}</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={__('Search any post type', 'social-integrations')} />
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className={`sint-chip${type === 'any' ? ' on' : ''}`} onClick={() => setType('any')}>{__('All', 'social-integrations')}</button>
        {postTypes.map((t) => (
          <button key={t.name} type="button" className={`sint-chip${type === t.name ? ' on' : ''}`} onClick={() => setType(t.name)}>{t.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {results.map((r) => (
          <button key={r.id} type="button" className={`sint-item${r.id === postId ? ' on' : ''}`} onClick={() => onPick(r)}>
            {r.thumbnail ? <img className="sint-thumb" src={r.thumbnail} alt="" style={{ width: 48, height: 48 }} /> : <span className="sint-thumb" style={{ width: 48, height: 48 }} />}
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{r.title || __('(no title)', 'social-integrations')}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="sint-type-dot" style={{ background: typeColor(types, r.type) }} />
                {postTypes.find((t) => t.name === r.type)?.singular ?? r.type}
                <span aria-hidden="true">·</span>
                {itemDate(r)}
              </span>
              <ShareState item={r} />
            </span>
          </button>
        ))}
        {loaded && results.length === 0 && (
          <p className="sint-sub" style={{ fontSize: 13, padding: '8px 4px' }}>
            {search.trim() ? __('No posts match the search.', 'social-integrations') : __('There are no posts yet.', 'social-integrations')}
          </p>
        )}
      </div>
      {postId && (
        <button type="button" className="sint-btn ghost sm" onClick={onClear}>
          {__('Write without a post', 'social-integrations')}
        </button>
      )}
    </aside>
  )
}

function itemDate(item: ContentItem): string {
  if (item.status === 'future') return sprintf(__('Scheduled for %s', 'social-integrations'), fmtDate(item.date))
  if (item.status === 'draft') return __('Draft', 'social-integrations')
  return fmtDate(item.date)
}

/** The share status of an item from the site. */
function ShareState({ item }: { item: ContentItem }) {
  const sent = item.shares.filter((x) => x.status === 'published').length
  const failed = item.shares.length - sent
  if (failed) return <span className="sint-pill bad" style={{ alignSelf: 'flex-start' }}>{sprintf(__('%d failed', 'social-integrations'), failed)}</span>
  if (sent) return <span className="sint-pill ok" style={{ alignSelf: 'flex-start' }}>{sprintf(__('Shared to %d', 'social-integrations'), sent)}</span>
  if (item.status === 'publish') return <span className="sint-pill muted" style={{ alignSelf: 'flex-start' }}>{__('Not shared yet', 'social-integrations')}</span>
  return null
}
