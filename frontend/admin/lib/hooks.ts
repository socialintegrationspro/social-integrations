// Extension points for other plugins, through wp.hooks. A plugin adds its script
// to the `sint/admin_script_dependencies` PHP filter so its filters are in place
// before this app renders.
export function applyFilters<T>(name: string, value: T, ...args: unknown[]): T {
  const hooks = window.wp?.hooks
  return hooks ? (hooks.applyFilters(name, value, ...args) as T) : value
}
