// Strings use wp.i18n so translations load with wp_set_script_translations().
// Each call names the text domain, and the build keeps the name __, so
// `wp i18n make-pot` finds the strings in build/ as well as in frontend/.
export const __ = (text: string, domain: string): string => window.wp?.i18n?.__(text, domain) ?? text
export const _n = (single: string, plural: string, count: number, domain: string): string =>
  window.wp?.i18n?._n?.(single, plural, count, domain) ?? (count === 1 ? single : plural)

export const sprintf = (format: string, ...args: (string | number)[]): string => {
  let i = 0
  return format.replace(/%(\d+\$)?[sd]/g, (_m, pos?: string) => String(args[pos ? parseInt(pos, 10) - 1 : i++] ?? ''))
}
