// The editor bundle uses the packages that WordPress loads (window.wp), not its own
// copies. includes/Editor/SidebarPanel.php lists them as script dependencies, so they
// are ready when this script runs.
import type * as ReactNS from 'react'

type R = typeof ReactNS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface Wp {
  element: R & { createElement: R['createElement'] }
  i18n: { __: (text: string, domain: string) => string; _n: (single: string, plural: string, count: number, domain: string) => string; sprintf: (format: string, ...args: (string | number)[]) => string }
  date: { dateI18n: (format: string, date: string) => string; getSettings: () => { formats: { datetime: string } } }
  blocks: { getBlockType: (name: string) => { title?: string } | undefined }
  apiFetch: <T>(options: { path: string; method?: string; data?: unknown }) => Promise<T>
  data: { useSelect: <T>(map: (select: Any) => T, deps?: unknown[]) => T; useDispatch: (store: string) => Any }
  plugins: { registerPlugin: (name: string, settings: { render: () => ReactNS.ReactElement | null; icon?: ReactNS.ReactElement }) => void }
  editor?: { PluginSidebar?: Any; PluginSidebarMoreMenuItem?: Any }
  editPost?: { PluginSidebar?: Any; PluginSidebarMoreMenuItem?: Any }
  components: Any
  blockEditor: Any
  compose: { createHigherOrderComponent: (inner: Any, name: string) => Any }
  hooks: { addFilter: (hook: string, namespace: string, callback: Any) => void }
}

declare global {
  interface Window {
    wp: Wp
    sintEditor?: EditorConfig
  }
}

export type BlockUse = 'text' | 'excerpt' | 'media' | 'link' | 'skip' | 'remove'

export interface EditorConfig {
  canManage: boolean
  pageUrl: string
  blockOverride: boolean
  blockRules: Record<string, BlockUse>
  blockFallback: BlockUse
}

export const wp = window.wp
export const config: EditorConfig = window.sintEditor ?? {
  canManage: false,
  pageUrl: '',
  blockOverride: false,
  blockRules: {},
  blockFallback: 'text',
}

export const h = wp.element.createElement
export const Fragment = wp.element.Fragment
export const { useState, useEffect, useRef } = wp.element
export const { __, _n, sprintf } = wp.i18n
// WordPress 6.6 moved the sidebar slots from wp.editPost to wp.editor.
export const PluginSidebar = wp.editor?.PluginSidebar ?? wp.editPost?.PluginSidebar
export const PluginSidebarMoreMenuItem = wp.editor?.PluginSidebarMoreMenuItem ?? wp.editPost?.PluginSidebarMoreMenuItem
