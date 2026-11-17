import { setWorkerUrl, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre resolves its worker next to its own module by default, which breaks
// once Vite bundles it. Point it at the copy Vite emits as an asset instead.
setWorkerUrl(workerUrl)

/**
 * OpenStreetMap raster tiles: no API key, fine for a supervisor dashboard.
 * For heavy production traffic switch to a hosted tile service or own tile
 * server (see the OSM tile usage policy).
 */
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

/** Cairo, wide enough to show greater Cairo until real positions arrive. */
export const DEFAULT_CENTER: [number, number] = [31.2357, 30.0444]
export const DEFAULT_ZOOM = 9

export const ROUTE_COLOR = '#0063ad'
export const FLAGGED_COLOR = '#dc2626'
export const START_COLOR = '#16a34a'

type Theme = 'light' | 'dark'

/**
 * Dark map from the same free OSM tiles: the raster is hue-rotated by 180° and its lightness
 * inverted (brightness-min above brightness-max), which keeps water blue and parks green while
 * turning the white background dark. No paid provider or key needed.
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
  if (map.getLayer('osm')) {
    for (const [property, value] of Object.entries(RASTER_PAINT[theme])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setPaintProperty('osm', property as any, value)
    }
  }
  const colors = MAP_COLORS[theme]
  if (map.getLayer('route-casing')) map.setPaintProperty('route-casing', 'line-color', colors.casing)
  if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', colors.route)
  if (map.getLayer('route-points')) {
    map.setPaintProperty('route-points', 'circle-stroke-color', colors.casing)
    map.setPaintProperty('route-points', 'circle-color', [
      'match',
      ['get', 'kind'],
      'start',
      START_COLOR,
      'flagged',
      FLAGGED_COLOR,
      colors.route,
    ])
  }
}
