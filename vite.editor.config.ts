import { defineConfig } from 'vite'

// A release build names the files by their content (editor-[hash].js), so a browser or a cache
// that ignores the ?ver= query cannot keep an old file. A watch build keeps fixed names for
// scripts/live-reload.mjs.
const watch = process.argv.includes('--watch')
const name = watch ? 'editor' : 'editor-[hash]'

// The block editor bundle: one classic script plus its CSS, in build/editor/.
// backend/Editor/SidebarPanel.php reads the names from build/editor/.vite/manifest.json. React and the editor packages are not
// bundled: frontend/editor/wp.ts uses the ones WordPress loads (window.wp).
export default defineConfig({
  // Keep names such as __ in build/, so `wp i18n make-pot` finds the strings.
  esbuild: { jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment', minifyIdentifiers: false },
  build: {
    outDir: 'build/editor',
    // A watch build keeps the last good files, so a failed rebuild does not empty build/.
    emptyOutDir: !watch,
    manifest: true,
    lib: { entry: 'frontend/editor/index.tsx', formats: ['iife'], name: 'sintEditor', fileName: () => `${name}.js` },
    rollupOptions: { output: { assetFileNames: `${name}[extname]` } },
  },
})
