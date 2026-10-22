import * as React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './styles.css'
import { App } from './App'
import { api } from './lib/api'
import * as ui from './components/ui'
import * as format from './lib/format'
import { useStore } from './lib/store'
import { applyTheme, initialTheme } from './lib/theme'

// Shared with scripts that extend the app through `wp.hooks`, so their
// components use the same React instance.
;(window as unknown as { sintApp: unknown }).sintApp = { React, api, ui, format, useStore }

const mount = () => {
  const el = document.getElementById('sint-app')
  applyTheme(initialTheme())
  if (el) createRoot(el).render(<App />)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
else mount()
