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
  connect_fields: Field[]
  app_fields: Field[]
  app_setup_url: string
  app_configured: boolean
}

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
  status: QueueStatus
  scheduled_at: string
  attempts: number
  post: { title: string; type: string; thumbnail: string; edit_link: string } | null
  /** Last send attempt: the error, or the live post's URL. */
  message: string
  remote_url: string
}

export interface LogItem {
  id: string
  queue_id: string
  post_id: string
  network: string
  account_id: string
  status: 'published' | 'failed'
  message: string
  remote_url: string
  created_at: string
  post_title: string
}

export type BlockUse = 'text' | 'excerpt' | 'media' | 'link' | 'skip' | 'remove'

export type MediaSource = 'auto' | 'featured' | 'content' | 'custom' | 'none'

export interface Settings {
  blocks: Record<string, BlockUse>
  block_fallback: BlockUse
  allow_block_override: boolean
  max_images: number
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
