import * as React from 'react'
import { lazy, Suspense, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/plus-jakarta-sans/300.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './styles.css'
import { App } from './App'
import { api, createApi } from './lib/api'
import { can } from './lib/config'
import * as baseUi from './components/ui'
import { CaptionText } from './components/CaptionText'
import { FieldPreview } from './components/FieldPreview'
import { TemplatePreview } from './components/TemplatePreview'
import { TemplateEditor } from './components/TemplateEditor'
import * as format from './lib/format'
import { useFetch } from './lib/hooks'
import { useStore } from './lib/store'
import { applyTheme, initialTheme } from './lib/theme'

// The caption editor, with its tokens as chips. Its library loads when a screen shows it.
const LazyCaptionInput = lazy(() => import('./components/caption/CaptionInput'))
type CaptionInputProps = ComponentProps<typeof LazyCaptionInput>
const CaptionInput = (props: CaptionInputProps) => (
  <Suspense fallback={<div className="sint-cap sint-skeleton" style={{ minHeight: 110 }} />}>
    <LazyCaptionInput {...props} />
  </Suspense>
)

// Shared with scripts that extend the app through `wp.hooks`, so their
// components use the same React instance.
const ui = { ...baseUi, TemplateEditor, FieldPreview, TemplatePreview, CaptionText, CaptionInput }
;(window as unknown as { sintApp: unknown }).sintApp = { React, api, createApi, ui, format, useStore, useFetch, can }

const mount = () => {
  const el = document.getElementById('sint-app')
  applyTheme(initialTheme())
  if (el) createRoot(el).render(<App />)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
else mount()
