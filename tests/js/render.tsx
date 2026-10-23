import { render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { expect, vi } from 'vitest'
import type { PageProps } from '../../frontend/admin/components/Header'
import { ToastProvider } from '../../frontend/admin/components/ui'
import { MotionProvider } from '../../frontend/admin/lib/motion'
import { StoreProvider, useStore } from '../../frontend/admin/lib/store'

/** Sets the plugin capabilities of the current user. */
export function setCaps(...caps: string[]) {
  window.sintConfig!.user.caps = Object.fromEntries(caps.map((c) => [c, true]))
}

export const ALL_CAPS = ['sint_view', 'sint_share', 'sint_publish', 'sint_manage_accounts', 'sint_manage_settings']

/** The providers of the app, as App.tsx sets them. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <StoreProvider>
        <ToastProvider>{children}</ToastProvider>
      </StoreProvider>
    </MotionProvider>
  )
}

/**
 * Renders a screen in the app's providers. The store loads from the fake server, so a test
 * uses findBy… queries for what the store data shows.
 */
export function renderPage(Page: ComponentType<PageProps>, opts: { params?: string } = {}) {
  const go = vi.fn()
  const openComposer = vi.fn()
  const params = new URLSearchParams(opts.params ?? '')
  const view = render(
    <Providers>
      <Page params={params} go={go} openComposer={openComposer} />
    </Providers>,
  )
  return { ...view, go, openComposer }
}

/**
 * Renders a screen after the store has its data, as when the page gives the first data.
 * Use it for a screen that reads the store only when it mounts.
 */
export function renderReady(Page: ComponentType<PageProps>, opts: { params?: string } = {}) {
  const go = vi.fn()
  const openComposer = vi.fn()
  const params = new URLSearchParams(opts.params ?? '')
  function WhenReady() {
    const { loading } = useStore()
    return loading ? null : <Page params={params} go={go} openComposer={openComposer} />
  }
  const view = render(
    <Providers>
      <WhenReady />
    </Providers>,
  )
  return { ...view, go, openComposer }
}

/** The text of the toasts on screen. */
export const toasts = () => Array.from(document.querySelectorAll('.sint-toast')).map((t) => t.textContent)

/** Waits for a toast with this text. */
export async function findToast(text: string | RegExp) {
  await waitFor(() => expect(toasts().some((t) => (typeof text === 'string' ? t === text : text.test(t ?? '')))).toBe(true))
}

export { screen }
