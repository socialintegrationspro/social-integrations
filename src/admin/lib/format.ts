import { config } from './config'

// Dates from the API are UTC ISO strings. The UI shows them in the site's time zone.
const tz = (() => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: config.timezone })
    return config.timezone
  } catch {
    return undefined
  }
})()

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso))

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(new Date(iso))

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso))

/** Parts of a date in the site's time zone. */
export function siteParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { y: +get('year'), m: +get('month'), d: +get('day'), h: +get('hour'), min: +get('minute'), key: `${get('year')}-${get('month')}-${get('day')}` }
}

export const initials = (name: string) =>
  name.replace(/[@.]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
