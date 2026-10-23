import { AccountAvatar, Icon, NetBadge } from '../../components/ui'
import { __, sprintf } from '../../lib/i18n'
import { useStore } from '../../lib/store'
import type { Account, MediaItem } from '../../lib/types'
import { hostOf, measure } from './helpers'

interface Props {
  /** Networks of the selected accounts. */
  nets: string[]
  /** The network to show; undefined when no account is selected. */
  preview?: string
  /** Show the network switcher (the "All networks" tab with more than one network). */
  canSwitch: boolean
  setPreview: (network: string) => void
  captionFor: (network: string) => string
  account?: Account
  chosenMedia: MediaItem[]
  /** Link card when no media is on. */
  link?: { url: string; title: string; description?: string; image?: string }
  /** The first comment below the post, if any. */
  comment?: string
}

/** The right column: a post card for one network, then a fit check for each network. */
export function Preview({ nets, preview, canSwitch, setPreview, captionFor, account, chosenMedia, link, comment }: Props) {
  const { network } = useStore()
  const net = preview ? network(preview) : undefined

  return (
    <aside style={{ flex: '1 1 330px', maxWidth: 380, borderLeft: '1px solid var(--line)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--side)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span className="sint-label" style={{ paddingTop: 6 }}>{__('Preview', 'social-integrations')}</span>
        {canSwitch && (
          <span style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, minWidth: 0 }} role="group" aria-label={__('Preview network', 'social-integrations')}>
            {nets.map((n) => (
              <button key={n} type="button" className="sint-prev-net" aria-pressed={n === preview} aria-label={network(n)?.label} onClick={() => setPreview(n)}>
                <NetBadge network={n} color={network(n)?.color} size={22} />
              </button>
            ))}
          </span>
        )}
      </div>
      {net ? (
        <div className="sint-preview" style={{ background: '#fff', color: '#1c1e21', borderRadius: 16, overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12 }}>
            {account && <AccountAvatar account={account} network={net} />}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{account?.name}</div>
              <div style={{ fontSize: 12, color: '#65676b' }}>{net.label}</div>
            </div>
          </div>
          <div style={{ padding: '0 12px 12px', fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {[...captionFor(net.key)].slice(0, net.char_limit).join('') || <span style={{ color: '#65676b' }}>{__('Your caption appears here.', 'social-integrations')}</span>}
          </div>
          {chosenMedia.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: chosenMedia.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 2 }}>
              {chosenMedia.slice(0, Math.min(4, net.max_images)).map((m) => (
                m.type === 'image' ? <img key={m.url} src={m.url} alt={m.alt} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} /> : <div key={m.url} style={{ height: 140, background: '#ddd' }} />
              ))}
            </div>
          )}
          {chosenMedia.length === 0 && link && (
            <div style={{ borderTop: '1px solid #e4e6eb', background: '#f0f2f5' }}>
              {link.image && <img src={link.image} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />}
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#65676b', textTransform: 'uppercase' }}>{hostOf(link.url)}</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{link.title}</div>
                {link.description && <div style={{ fontSize: 13, color: '#65676b', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{link.description}</div>}
              </div>
            </div>
          )}
          {comment && (
            <div style={{ borderTop: '1px solid #e4e6eb', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {account && <AccountAvatar account={account} network={net} />}
              <div style={{ background: '#f0f2f5', borderRadius: 14, padding: '8px 12px', fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{account?.name}</div>
                {comment}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="sint-sub">{__('Select an account to see a preview.', 'social-integrations')}</p>
      )}
      {net && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
          {nets.map((n) => <FitCheck key={n} network={n} caption={captionFor(n)} />)}
          {chosenMedia.length > 0 && nets.some((n) => (network(n)?.max_images ?? 1) < chosenMedia.length) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--warn-text)' }}><Icon name="alert" size={14} stroke={2.6} /></span>
              {__('Some networks accept fewer images. These networks get the first images.', 'social-integrations')}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

/** One line: the caption fits the network, or how many characters it is over. */
function FitCheck({ network: key, caption }: { network: string; caption: string }) {
  const { network } = useStore()
  const net = network(key)
  const len = measure(caption, net)
  const ok = net ? len <= net.char_limit : true
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: ok ? 'var(--ok)' : 'var(--bad)' }}><Icon name={ok ? 'check' : 'alert'} size={14} stroke={2.6} /></span>
      {ok ? sprintf(__('%s caption fits', 'social-integrations'), net?.label ?? key) : sprintf(__('%1$s caption is %2$d characters too long', 'social-integrations'), net?.label ?? key, len - (net?.char_limit ?? 0))}
    </div>
  )
}
