// Strings go through wp.i18n so translations load with wp_set_script_translations().
export const __ = (text: string): string => window.wp?.i18n?.__(text, 'social-integrations') ?? text

export const sprintf = (format: string, ...args: (string | number)[]): string => {
  let i = 0
  return format.replace(/%(\d+\$)?[sd]/g, (_m, pos?: string) => String(args[pos ? parseInt(pos, 10) - 1 : i++] ?? ''))
}
