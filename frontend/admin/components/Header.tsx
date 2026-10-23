import type { ReactNode } from 'react'
import type { ComposerSeed } from '../pages/Composer'

/** Props that the app shell gives to each screen. */
export interface PageProps {
  openComposer: (seed?: ComposerSeed) => void
  params: URLSearchParams
  go: (to: string) => void
}

export function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="sint-head">
      <h1>{title}</h1>
      {children && <div className="actions">{children}</div>}
    </header>
  )
}
