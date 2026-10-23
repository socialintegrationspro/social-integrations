import { wp } from './wp'

export interface EditorAccount {
  id: string
  network: string
  name: string
  avatar: string
  status: string
}

export interface EditorShare {
  id: number
  network: string
  account: string
  status: string
  scheduled_at: string
  message: string
  remote_url: string
}

export interface EditorState {
  shared: boolean
  campaigns: { id: number; name: string; delay: number; accounts: string[] }[]
  shares: EditorShare[]
  can_manage: boolean
  accounts: EditorAccount[]
}

export interface EditorPreview {
  caption: string
  media: { id?: number; url: string; type?: string }[]
  blocks: { name: string; use: string }[]
}

export const getState = (postId: number) => wp.apiFetch<EditorState>({ path: `/sint/v1/editor/${postId}` })

export const getPreview = (postId: number, data: { title: string; content: string; excerpt: string; caption: string }) =>
  wp.apiFetch<EditorPreview>({ path: `/sint/v1/editor/${postId}/preview`, method: 'POST', data })

export const writeCaption = (postId: number) => wp.apiFetch<{ caption: string }>({ path: '/sint/v1/ai/caption', method: 'POST', data: { post_id: postId } })

/** The error text of a failed request. */
export const errorText = (e: unknown, fallback: string): string =>
  e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' ? (e as { message: string }).message : fallback
