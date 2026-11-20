import { setWorkerUrl, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { resolveTileSource } from './tile-source'

// MapLibre resolves its worker next to its own module by default, which breaks
// once Vite bundles it. Point it at the copy Vite emits as an asset instead.
setWorkerUrl(workerUrl)

const TILE_LAYER = 'base-tiles'

/** Raster base map; the tile provider comes from the build environment (see tile-source.ts). */
export const BASE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    [TILE_LAYER]: { type: 'raster', ...resolveTileSource(import.meta.env) },
  },
  layers: [{ id: TILE_LAYER, type: 'raster', source: TILE_LAYER }],
}

/** Cairo, wide enough to show greater Cairo until real positions arrive. */
export const DEFAULT_CENTER: [number, number] = [31.2357, 30.0444]
export const DEFAULT_ZOOM = 9

export const ROUTE_COLOR = '#0063ad'
/** White outline of pins and clinics on the map. */
export const PIN_STROKE_COLOR = '#ffffff'
export const FLAGGED_COLOR = '#b42318'
export const START_COLOR = '#5e8c1f'
/** Clinics of the doctors layer: the brand green, darker so it reads on light tiles. */
export const DOCTOR_COLOR = '#3f6212'
/** Points left out of the route (physically impossible, or mock under the exclude policy). */
export const EXCLUDED_COLOR = '#64748b'

type Theme = 'light' | 'dark'

/**
 * Dark map from the same tiles: the raster is hue-rotated by 180° and its lightness inverted
 * (brightness-min above brightness-max), which keeps water blue and parks green while turning the
 * white background dark. Works with any light raster style.
 */
const RASTER_PAINT: Record<Theme, Record<string, number>> = {
  light: {
    'raster-hue-rotate': 0,
    'raster-brightness-min': 0,
    'raster-brightness-max': 1,
    'raster-saturation': 0,
    'raster-contrast': 0,
  },
  dark: {
    'raster-hue-rotate': 180,
    'raster-brightness-min': 0.9,
    'raster-brightness-max': 0.12,
    'raster-saturation': -0.3,
    'raster-contrast': 0.08,
  },
}

/** Route colours per theme: the brand blue, and the lighter logo blue on the dark map. */
export const MAP_COLORS: Record<Theme, { route: string; casing: string }> = {
  light: { route: ROUTE_COLOR, casing: '#ffffff' },
  dark: { route: '#3b9ae1', casing: '#1c1d21' },
}

/** Applies the theme to the tiles and the route layers (safe to call before they exist). */
export function applyMapTheme(map: MapLibreMap, theme: Theme): void {
  if (map.getLayer(TILE_LAYER)) {
    for (const [property, value] of Object.entries(RASTER_PAINT[theme])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setPaintProperty(TILE_LAYER, property as any, value)
    }
  }
  const colors = MAP_COLORS[theme]
  if (map.getLayer('route-casing')) map.setPaintProperty('route-casing', 'line-color', colors.casing)
  if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', colors.route)
  if (map.getLayer('route-points')) {
    map.setPaintProperty('route-points', 'circle-stroke-color', [
      'match',
      ['get', 'kind'],
      'focus',
      FLAGGED_COLOR,
      colors.casing,
    ])
    map.setPaintProperty('route-points', 'circle-color', [
      'match',
      ['get', 'kind'],
      'start',
      START_COLOR,
      'focus',
      FLAGGED_COLOR,
      'flagged',
      FLAGGED_COLOR,
      'excluded',
      EXCLUDED_COLOR,
      colors.route,
    ])
  }
}
