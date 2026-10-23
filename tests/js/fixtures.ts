import type { Account, Network, PostField, PostType, QueueItem } from '../../frontend/admin/lib/types'

const commentField: PostField = { name: 'first_comment', label: 'First comment', type: 'textarea', default: '', tokens: true, max: 300 }
const formatField: PostField = {
  name: 'format',
  label: 'Post format',
  type: 'select',
  default: 'auto',
  options: [
    { value: 'auto', label: 'Automatic' },
    { value: 'link', label: 'Link card only' },
    { value: 'text', label: 'Text only' },
  ],
}

const base = {
  url_length: 0,
  max_images: 4,
  supports_video: false,
  media_required: '' as const,
  post_fields: [] as PostField[],
  connect_fields: [],
  app_fields: [],
  app_setup_url: '',
  app_configured: false,
  methods: [] as string[],
}

export const bluesky: Network = {
  ...base,
  key: 'bluesky',
  label: 'Bluesky',
  color: '#1185fe',
  auth_type: 'credentials',
  char_limit: 300,
  post_fields: [formatField, commentField],
  connect_fields: [
    { name: 'identifier', label: 'Handle', type: 'text' },
    { name: 'password', label: 'App password', type: 'password' },
  ],
}

export const facebook: Network = {
  ...base,
  key: 'facebook',
  label: 'Facebook Page',
  color: '#1877f2',
  auth_type: 'oauth2',
  char_limit: 5000,
  supports_video: true,
  methods: ['broker', 'app'],
  app_fields: [
    { name: 'client_id', label: 'App ID', type: 'text' },
    { name: 'client_secret', label: 'App secret', type: 'password' },
  ],
  app_setup_url: 'https://developers.example.com/apps',
}

export const threads: Network = {
  ...base,
  key: 'threads',
  label: 'Threads',
  color: '#000000',
  auth_type: 'oauth2',
  char_limit: 500,
  media_required: 'media',
  methods: ['broker'],
}

export const telegram: Network = {
  ...base,
  key: 'telegram',
  label: 'Telegram',
  color: '#26a5e4',
  auth_type: 'token',
  char_limit: 4096,
  connect_fields: [{ name: 'bot_token', label: 'Bot token', type: 'password' }],
}

export const networks = [bluesky, facebook, threads, telegram]

export const account = (over: Partial<Account> = {}): Account => ({
  id: 'bluesky',
  network: 'bluesky',
  remote_id: 'did:1',
  name: 'Shop News',
  username: 'shop.bsky.social',
  avatar: '',
  profile_url: 'https://bsky.app/profile/shop',
  status: 'connected',
  via: '',
  connected_at: '2026-10-01T08:00:00Z',
  expires_at: null,
  ...over,
})

export const postTypes: PostType[] = [
  { name: 'post', label: 'Posts', singular: 'Post', source: 'auto', builtin: true, count: 12 },
  { name: 'page', label: 'Pages', singular: 'Page', source: 'featured', builtin: true, count: 3 },
]

export const queueItem = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: 1,
  post_id: 10,
  network: 'bluesky',
  account_id: 'bluesky',
  caption: 'Hello world',
  media: [],
  link: 'https://example.com/hello',
  fields: [],
  status: 'scheduled',
  scheduled_at: '2026-10-27T04:00:00Z',
  attempts: 0,
  post: { title: 'Hello post', type: 'post', thumbnail: '', edit_link: '/wp-admin/post.php?post=10&action=edit' },
  message: '',
  remote_url: '',
  ...over,
})

/** Store routes that StoreProvider loads when the page gives no first data. */
export const storeRoutes = (accounts: Account[] = [account()], nets: Network[] = networks) => ({
  'GET networks': { networks: nets, redirect_uri: 'https://site.example/wp-admin/admin.php?page=social-integrations&sint_oauth=1' },
  'GET accounts': accounts,
  'GET post-types': postTypes,
})
