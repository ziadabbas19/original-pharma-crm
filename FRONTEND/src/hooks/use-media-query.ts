import { useCallback, useSyncExternalStore } from 'react'

/** True while the media query matches (follows resizes and rotation). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Phone layout: below Tailwind's `md` breakpoint (768 px), where the sidebar becomes a bottom bar. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 767.98px)')
}
