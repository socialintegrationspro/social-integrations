import { defineConfig } from 'vite'

// The block editor bundle: one classic script, build/editor/editor.js, plus editor.css.
// includes/Editor/SidebarPanel.php loads it. React and the editor packages are not
// bundled: src/editor/wp.ts uses the ones WordPress loads (window.wp).
export default defineConfig({
  // Keep names such as __ in build/, so `wp i18n make-pot` finds the strings.
  esbuild: { jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment', minifyIdentifiers: false },
  build: {
    outDir: 'build/editor',
    emptyOutDir: true,
    lib: { entry: 'src/editor/index.tsx', formats: ['iife'], name: 'sintEditor', fileName: () => 'editor.js', cssFileName: 'editor' },
  },
})
