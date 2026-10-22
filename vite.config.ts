import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The admin app is loaded by includes/Admin/Assets.php from build/.vite/manifest.json,
// or from this dev server when wp-config.php defines SINT_DEV_SERVER.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: 'src/admin/main.tsx' },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5174',
  },
})
