import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/lib/i18n'
import { App } from '@/app/App'
import { router } from '@/app/router'
import { isNativePlatform, loadPlatform } from '@/lib/platform'
import { connectApiClient } from '@/lib/session'

async function start() {
  await loadPlatform()
  connectApiClient(() => void router.navigate({ to: '/login' }))

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
