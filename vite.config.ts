import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The admin app is loaded by backend/Admin/Assets.php from build/.vite/manifest.json,
// or from this dev server when wp-config.php defines SINT_DEV_SERVER.
export default defineConfig({
  plugins: [react()],
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
    rollupOptions: { input: 'frontend/admin/main.tsx' },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5174',
  },
})
