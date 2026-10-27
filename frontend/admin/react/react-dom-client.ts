// The release build uses this module for 'react-dom/client' (vite.config.ts). WordPress gives
// createRoot in wp.element (the 'wp-element' script).
import type * as ClientNS from 'react-dom/client'

const element = (window as unknown as { wp: { element: typeof ClientNS } }).wp.element

export const createRoot = element.createRoot
export const hydrateRoot = element.hydrateRoot
export default { createRoot, hydrateRoot }
