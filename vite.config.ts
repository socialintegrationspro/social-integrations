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

// The admin app is loaded by backend/Admin/Assets.php from build/.vite/manifest.json,
// or from this dev server when wp-config.php defines SINT_DEV_SERVER.
export default defineConfig({
  plugins: [react(), minifyVendor()],
  base: './',
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
      // React and Motion go in their own chunk, which minifyVendor() shrinks. The caption editor
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
})
