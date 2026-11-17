import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
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

export const ROUTE_COLOR = '#0f766e'
export const FLAGGED_COLOR = '#dc2626'
export const START_COLOR = '#16a34a'
