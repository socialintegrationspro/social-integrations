// The release build uses this module for 'react/jsx-runtime' (vite.config.ts). WordPress 6.3 to
// 6.5 has no 'react-jsx-runtime' script, so the JSX functions use createElement of the React that
// WordPress loads.
import type * as ReactNS from 'react'

const React = (window as unknown as { React: typeof ReactNS }).React

export const Fragment = React.Fragment

export function jsx(type: ReactNS.ElementType, props: Record<string, unknown>, key?: ReactNS.Key) {
  return React.createElement(type, key === undefined ? props : { ...props, key })
}

export const jsxs = jsx
