export interface Network {
  key: string
  label: string
  color: string
  auth_type: 'oauth2' | 'token' | 'credentials'
  char_limit: number
  /** Characters a link counts as; 0 counts it as typed. */
  url_length: number
  max_images: number
  supports_video: boolean
  /** The media that a post needs: '' (none), 'media' (an image or a video) or 'video'. */
  media_required?: '' | 'media' | 'video'
  /** Fields of a post in addition to the caption, the link and the media. */
  post_fields: PostField[]
  connect_fields: Field[]
  app_fields: Field[]
  app_setup_url: string
  app_configured: boolean
  /** OAuth sign-in methods: 'broker' is the Social Integrations app, 'app' the user's own app. Empty for other networks. */
  methods: string[]
}

/** A post field of a network, such as 'first_comment'. The same name has the same meaning on each network. */
export interface PostField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'toggle'
  default: string
  /** The value is a template with tokens, such as '{title}'. */
  tokens?: boolean
  max?: number
  options?: { value: string; label: string }[]
  help?: string
}

/** Post field values: '*' for all networks that have the field, or a network key; then field name => value. */
export type FieldMap = Record<string, Record<string, string>>

export interface Field {
  name: string
  label: string
  type: 'text' | 'password' | 'url'
  help?: string
  placeholder?: string
}

export interface Account {
  id: string
  network: string
  remote_id: string
  name: string
  username: string
  avatar: string
  profile_url: string
  status: 'connected' | 'expired'
  /** How the account signed in: 'app' is the user's own developer app. */
  via: string
  connected_at: string
  expires_at: string | null
}

export interface PostType {
  name: string
  label: string
  singular: string
  source: string
  builtin: boolean
  count: number
}

export interface Share {
  account_id: string
  network: string
  status: 'published' | 'failed'
  message: string
  remote_url: string
  date: string
}

export interface ContentItem {
  id: number
  title: string
  type: string
  status: string
  date: string
  link: string
  edit_link: string
  author: string
  thumbnail: string
  auto: boolean
  shares: Share[]
}

export interface MediaItem {
  type: 'image' | 'video'
  id: number
  url: string
  alt: string
  featured?: boolean
  first?: boolean
}

export interface BuiltShare {
  caption: string
  /** Captions from network templates, keyed by network. */
  captions: Record<string, string>
  link: string
  media: MediaItem[]
  /** Filled post fields of each network: network => name => value. */
  fields: FieldMap
  tokens: Record<string, string>
  blocks: { name: string; use: string }[]
  links: string[]
}

export type QueueStatus = 'draft' | 'scheduled' | 'sending' | 'published' | 'failed'

export interface QueueItem {
  id: number
  post_id: number
  network: string
  account_id: string
  caption: string
  media: MediaItem[]
  link: string
  /** Post field values of the share's network. */
  fields: Record<string, string> | []
  status: QueueStatus
  scheduled_at: string
  attempts: number
  post: { title: string; type: string; thumbnail: string; edit_link: string } | null
  /** Last send attempt: the error, or the URL of the published post. */
  message: string
  remote_url: string
}

/** One account's share in a log entry: its newest try. */
export interface LogShare {
  id: number
  queue_id: number
  network: string
  account_id: string
  status: 'published' | 'failed'
  message: string
  remote_url: string
  created_at: string
  tries: number
  /** The sign-in expired, or the network refused the first comment: a new sign-in fixes it. */
  reconnect?: boolean
}

/** One post that one campaign shared to its accounts, from one batch. */
export interface LogEntry {
  key: string
  /** "{type}-{id}", or '' for shares from before campaigns. */
  campaign_key: string
  post_id: number
  post_title: string
  edit_url: string
  /** The start of the caption, for shares without a post. */
  excerpt: string
  at: string
  shares: LogShare[]
}

/** One request that a share made, without secrets. */
export interface LogRequest {
  method: string
  url: string
  /** 0 when the request did not reach the server. */
  status: number
  ms: number
  response?: unknown
  error?: string
}

/** One try of a share, with what the network answered. */
export interface LogTry {
  id: number
  status: 'published' | 'failed'
  message: string
  remote_url: string
  created_at: string
  /** null for tries that were sent before the plugin saved details. */
  details: {
    code?: string
    status?: number
    exception?: { class: string; message: string; file: string }
    requests?: LogRequest[]
  } | null
}

export interface LogPage {
  total: number
  /** Entries with a failed share, with the same filters except the result. */
  failed: number
  items: LogEntry[]
  campaigns: { key: string; name: string; type: string }[]
}

export type BlockUse = 'text' | 'excerpt' | 'media' | 'link' | 'skip' | 'remove'

export type MediaSource = 'auto' | 'featured' | 'content' | 'custom' | 'none'

export interface Settings {
  blocks: Record<string, BlockUse>
  block_fallback: BlockUse
  allow_block_override: boolean
  max_images: number
  log_days: number
  ai: { provider: string; tone: string; model: string }
  ai_providers: AIProvider[]
}

export interface AIProvider {
  key: string
  label: string
  needs_key: boolean
  has_key: boolean
  default_model: string
}

export interface BlockType {
  name: string
  title: string
  category: string
  core: boolean
  use: BlockUse | null
}

/** The Dashboard screen's summary of sharing activity. */
export interface DashboardData {
  /** One entry for each day of the period, oldest first, as site dates ('Y-m-d'). */
  days: { date: string; published: number; failed: number }[]
  totals: { published: number; failed: number; previous_published: number; previous_failed: number; scheduled: number; drafts: number }
  /** Shares in the period, by network, the largest count first. */
  networks: { network: string; published: number; failed: number }[]
  campaigns: { active: number; total: number }
  upcoming: { id: number | string; network: string; account_id: string; title: string; scheduled_at: string }[]
  recent: { id: number; network: string; account_id: string; status: 'published' | 'failed'; message: string; remote_url: string; title: string; created_at: string }[]
}
