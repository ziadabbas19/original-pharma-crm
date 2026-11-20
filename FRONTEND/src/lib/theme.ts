import { useSyncExternalStore } from 'react'
import { isNativePlatform } from '@/lib/platform'

/**
 * Light / dark / system theme. The choice is kept on the device (localStorage) and applied
 * before first paint by the inline script in index.html, which must use the same key and
 * colours as below. The class `dark` on <html> switches the CSS tokens in index.css.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'op.theme'

/** Browser / status bar colour per theme: the header (card) colour, so the bars blend in. */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#212835' }

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

let preference: ThemePreference = readPreference()

export function resolveTheme(pref: ThemePreference = preference): ResolvedTheme {
  if (pref === 'system') return media?.matches ? 'dark' : 'light'
  return pref
}

function apply(): void {
  const theme = resolveTheme()
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  void applyNativeStatusBar(theme)
  listeners.forEach((listener) => listener())
}

/** Android status bar: dark icons on the light header, light icons on the dark one. */
async function applyNativeStatusBar(theme: ResolvedTheme): Promise<void> {
  if (!isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: THEME_COLORS[theme] })
  } catch {
    // Not available (older WebView or plugin missing): the system default stays.
  }
}

export function setThemePreference(next: ThemePreference): void {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private mode: the choice lasts for this session only.
  }
  apply()
}

/** Call once at startup: syncs meta/status bar and follows OS changes while on "system". */
export function initTheme(): void {
  media?.addEventListener('change', () => {
    if (preference === 'system') apply()
  })
  apply()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): {
  preference: ThemePreference
  theme: ResolvedTheme
  setPreference: typeof setThemePreference
} {
  const pref = useSyncExternalStore(subscribe, () => preference)
  const theme = useSyncExternalStore(subscribe, () => resolveTheme())
  return { preference: pref, theme, setPreference: setThemePreference }
}
