import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/lib/i18n'
import { App } from '@/app/App'
import { router } from '@/app/router'
import { isNativePlatform, loadPlatform } from '@/lib/platform'
import { connectApiClient } from '@/lib/session'
import { initTheme } from '@/lib/theme'

const CHUNK_RELOAD_KEY = 'op.chunkReloadAt'

/**
 * A tab left open across a release asks for route files the new build no longer has. Reload once to
 * pick up the new version; the time check stops a loop if the files are missing for another reason.
 */
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

async function start() {
  await loadPlatform()
  initTheme()
  connectApiClient(
    () => void router.navigate({ to: '/login' }),
    () => void router.navigate({ to: '/change-password' }),
  )

  // Service worker only for the browser/PWA build; the native app ships its files locally.
  if (!isNativePlatform() && import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register')
    registerSW({ immediate: true })
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
