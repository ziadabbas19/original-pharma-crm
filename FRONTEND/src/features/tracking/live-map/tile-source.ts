/** Build-time settings of the base map; see "Map tiles" in docs/deployment.md. */
export interface TileEnv {
  readonly VITE_MAP_TILE_URL?: string
  readonly VITE_MAP_TILE_ATTRIBUTION?: string
  readonly VITE_MAP_TILE_SIZE?: string
  readonly VITE_MAP_TILE_MAX_ZOOM?: string
}

export interface TileSource {
  tiles: string[]
  tileSize: number
  maxzoom: number
  attribution: string
}

/** Public OpenStreetMap servers: no key needed, and only meant for development traffic. */
const DEVELOPMENT_SOURCE: TileSource = {
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  maxzoom: 19,
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/** The configured provider, or the development default. Several URLs may be separated by commas. */
export function resolveTileSource(env: TileEnv): TileSource {
  const tiles = (env.VITE_MAP_TILE_URL ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
  if (tiles.length === 0) return DEVELOPMENT_SOURCE

  return {
    tiles,
    tileSize: numberOr(env.VITE_MAP_TILE_SIZE, DEVELOPMENT_SOURCE.tileSize),
    maxzoom: numberOr(env.VITE_MAP_TILE_MAX_ZOOM, DEVELOPMENT_SOURCE.maxzoom),
    attribution: env.VITE_MAP_TILE_ATTRIBUTION ?? '',
  }
}
