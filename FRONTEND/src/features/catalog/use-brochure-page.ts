import { useEffect, useState } from 'react'
import { loadBrochurePage } from './brochure-cache'

/** A brochure page loaded with the viewer's session (or from the copy kept on the device). */
export function useBrochurePage(url: string): { src: string | null; failed: boolean } {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({ src: null, failed: false })
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    loadBrochurePage(url)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setState({ src: objectUrl, failed: false })
      })
      .catch(() => active && setState({ src: null, failed: true }))
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])
  return state
}
