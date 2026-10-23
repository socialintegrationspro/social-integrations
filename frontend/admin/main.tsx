import * as React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/plus-jakarta-sans/300.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './styles.css'
import { App } from './App'
import { api, createApi } from './lib/api'
import * as baseUi from './components/ui'
import { FieldPreview } from './components/FieldPreview'
import { TemplateEditor } from './components/TemplateEditor'
import * as format from './lib/format'
import { useFetch } from './lib/hooks'
import { useStore } from './lib/store'
import { applyTheme, initialTheme } from './lib/theme'

// Shared with scripts that extend the app through `wp.hooks`, so their
// components use the same React instance.
const ui = { ...baseUi, TemplateEditor, FieldPreview }
;(window as unknown as { sintApp: unknown }).sintApp = { React, api, createApi, ui, format, useStore, useFetch }

const mount = () => {
  const el = document.getElementById('sint-app')
  applyTheme(initialTheme())
  if (el) createRoot(el).render(<App />)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
else mount()
