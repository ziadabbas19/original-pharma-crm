import i18n from '@/lib/i18n'

function locale(): string {
  return i18n.resolvedLanguage === 'en' ? 'en' : 'ar-EG'
}

/** "3 minutes ago" in the current language. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour')
  return rtf.format(Math.round(seconds / 86_400), 'day')
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(iso))
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits }).format(value)
}

/** 85 -> "85 m", 1250 -> "1.3 km" (localized digits and units). */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return new Intl.NumberFormat(locale(), { style: 'unit', unit: 'meter', maximumFractionDigits: 0 }).format(
      meters,
    )
  }
  return new Intl.NumberFormat(locale(), {
    style: 'unit',
    unit: 'kilometer',
    maximumFractionDigits: 1,
  }).format(meters / 1000)
}

/** Duration between two instants, e.g. "1 h 05 min" style via Intl units. */
export function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000))
  const unit = (value: number, u: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale(), { style: 'unit', unit: u, unitDisplay: 'short' }).format(value)
  if (minutes < 60) return unit(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`
}

/** "A, B and C" in the current language. */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(items)
}

/** Picks the Arabic name in Arabic when there is one. */
export function localizedName(name: string | null | undefined, nameAr: string | null | undefined): string {
  if (i18n.resolvedLanguage !== 'en' && nameAr) return nameAr
  return name ?? nameAr ?? ''
}

/** yyyy-MM-dd of a local date (value format of <input type="date">). */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight of a yyyy-MM-dd value. */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}
