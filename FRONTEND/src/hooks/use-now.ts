import { useEffect, useState } from 'react'

/**
 * Current time as state, refreshed every `intervalMs`. Lets components show
 * "x minutes ago" or derive staleness without calling Date.now() while rendering.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
