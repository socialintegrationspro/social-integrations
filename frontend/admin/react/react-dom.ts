// The release build uses this module for 'react-dom' (vite.config.ts). It gives the ReactDOM
// that WordPress loads (the 'react-dom' script).
import type * as ReactDOMNS from 'react-dom'

const ReactDOM = (window as unknown as { ReactDOM: typeof ReactDOMNS }).ReactDOM

export default ReactDOM
export const { createPortal, findDOMNode, flushSync, unstable_batchedUpdates, version } = ReactDOM
