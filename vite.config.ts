import { fileURLToPath } from 'node:url'
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Library code has no translatable strings, so its chunk is minified in full.
const minifyVendor = (): Plugin => ({
  name: 'sint-minify-vendor',
  apply: 'build',
  async renderChunk(code, chunk) {
    if (chunk.name !== 'vendor' && chunk.name !== 'lexical') return null
    const out = await transformWithEsbuild(code, chunk.fileName, { minify: true, format: 'esm', legalComments: 'none' })
    return { code: out.code, map: null }
  },
})

// A release build uses the React that WordPress loads (the 'react', 'react-dom' and 'wp-element'
// scripts), so build/ does not contain a second copy. The dev server uses React from node_modules.
const wpReact = (file: string) => fileURLToPath(new URL(`frontend/admin/react/${file}`, import.meta.url))

// The admin app is loaded by backend/Admin/Assets.php from build/.vite/manifest.json.
export default defineConfig(({ command }) => ({
  plugins: [react(), minifyVendor()],
  base: './',
  resolve: {
    alias:
      command === 'build'
        ? [
            { find: /^react$/, replacement: wpReact('react.ts') },
            { find: /^react\/jsx-runtime$/, replacement: wpReact('jsx-runtime.ts') },
            { find: /^react-dom$/, replacement: wpReact('react-dom.ts') },
            { find: /^react-dom\/client$/, replacement: wpReact('react-dom-client.ts') },
          ]
        : [],
  },
  // Keep names such as __ in build/, so `wp i18n make-pot` and translate.wordpress.org
  // find the translatable strings in the shipped files.
  esbuild: { minifyIdentifiers: false },
  build: {
    outDir: 'build',
    // A full build starts from an empty build/. A watch build keeps it, so the editor
    // bundle in build/editor/ (vite.editor.config.ts) stays while both watch.
    emptyOutDir: !process.argv.includes('--watch'),
    manifest: true,
    rollupOptions: {
      input: 'frontend/admin/main.tsx',
      // Motion and the other libraries go in their own chunk, which minifyVendor() shrinks. The caption editor
      // library has a chunk of its own, which loads only when a screen shows a caption. CSS (the
      // bundled font) stays with the entry, because Assets.php enqueues the entry's CSS only.
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules') || id.endsWith('.css')) return undefined
          return /[\\/](lexical|@lexical)[\\/]/.test(id) ? 'lexical' : 'vendor'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5174',
  },
}))
