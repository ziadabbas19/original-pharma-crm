import { Capacitor } from '@capacitor/core'
import type { Platform } from './types'

export type * from './types'

let instance: Platform | null = null
let loading: Promise<Platform> | null = null

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform()

/**
 * Loads the platform implementation once. Imported dynamically so the web
 * bundle never ships the native plugins' JS, and vice versa.
 */
export function loadPlatform(): Promise<Platform> {
  if (instance) return Promise.resolve(instance)
  loading ??= (
    isNativePlatform()
      ? import('./capacitor').then((m) => m.createCapacitorPlatform())
      : import('./web').then((m) => m.createWebPlatform())
  ).then((p) => (instance = p))
  return loading
}

/** Synchronous access after loadPlatform() resolved (it runs before the app renders). */
export function platform(): Platform {
  if (!instance) throw new Error('Platform not loaded yet; await loadPlatform() first.')
  return instance
}
