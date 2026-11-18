import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/** True while the page is on screen (false when the app is in the background). */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, () => document.visibilityState === 'visible')
}
