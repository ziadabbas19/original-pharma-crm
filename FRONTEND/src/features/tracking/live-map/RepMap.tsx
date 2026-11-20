import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  type GeoJSONSource,
} from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LivePositionDto } from '@/api/generated/model'
import { LIVE_STATUS_COLOR, ON_VISIT_COLOR, type LiveStatus } from '../live-status'
import { useTheme } from '@/lib/theme'
import {
  applyMapTheme,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  EXCLUDED_COLOR,
  FLAGGED_COLOR,
  BASE_MAP_STYLE,
  DOCTOR_COLOR,
  PIN_STROKE_COLOR,
  ROUTE_COLOR,
  START_COLOR,
} from './map-setup'

export interface MapRep {
  userId: string
  fullName: string
  status: LiveStatus
  position: LivePositionDto | null
  /** Visit-only visibility: the doctor of the visit in progress (shown on the marker). */
  visitCustomer?: string | null
}

export interface RoutePoint {
  lat: number
  lng: number
  recordedAt: string
  /** Suspicious (mock, synthetic fix, device settings): drawn red. */
  flagged: boolean
  /** Left out of the line and the distance (physically impossible, or mock under the exclude policy). */
  excluded?: boolean
  /** The point a link pointed at (e.g. from the suspicious activity page). */
  focus?: boolean
}

/** A doctor with a saved clinic location (optional layer). */
export interface MapDoctor {
  id: string
  name: string
  lat: number
  lng: number
}

interface MarkerEntry {
  marker: Marker
  root: HTMLButtonElement
  label: HTMLSpanElement
  dot: HTMLSpanElement
}

const STATUS_Z: Record<LiveStatus, string> = {
  lost: '4',
  stale: '3',
  online: '2',
  notOnVisit: '1',
  offShift: '1',
}
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

function createMarkerElement(): Omit<MarkerEntry, 'marker'> {
  const root = document.createElement('button')
  root.type = 'button'
  root.className =
    'group flex cursor-pointer flex-col items-center gap-0.5 outline-none data-[status=offShift]:opacity-70 data-[selected=true]:opacity-100'
  const label = document.createElement('span')
  label.className =
    'max-w-36 truncate rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-foreground shadow ring-1 ring-black/10 group-focus-visible:ring-2 group-focus-visible:ring-ring group-data-[selected=true]:bg-primary group-data-[selected=true]:text-primary-foreground'
  const dot = document.createElement('span')
  dot.className =
    'size-4 rounded-full border-2 border-white shadow-md transition-transform group-data-[selected=true]:scale-125 group-data-[selected=true]:ring-4 group-data-[selected=true]:ring-primary/35'
  root.append(label, dot)
  return { root, label, dot }
}

/**
 * MapLibre map with one HTML marker per rep (HTML keeps Arabic names readable
 * without a glyph server) and the selected rep's route as GeoJSON layers.
 */
export function RepMap({
  reps,
  doctors = [],
  selectedId,
  following,
  route,
  fitRouteKey,
  onSelect,
  onUserPan,
}: {
  reps: MapRep[]
  /** Clinics drawn under the reps (empty = layer off). */
  doctors?: MapDoctor[]
  selectedId: string | null
  following: boolean
  route: RoutePoint[] | null
  /** The route is framed whenever this changes to a non-empty value. */
  fitRouteKey: string
  onSelect: (userId: string) => void
  /** The user dragged the map: following should stop. */
  onUserPan: () => void
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, MarkerEntry>())
  const fittedRef = useRef(false)
  const callbacks = useRef({ onSelect, onUserPan })
  const [ready, setReady] = useState(false)
  const { theme } = useTheme()
  const themeRef = useRef(theme)

  useEffect(() => {
    callbacks.current = { onSelect, onUserPan }
  }, [onSelect, onUserPan])

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rtl = document.documentElement.dir === 'rtl'
    const map = new MapLibreMap({
      container,
      style: BASE_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), rtl ? 'top-left' : 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), rtl ? 'bottom-right' : 'bottom-left')

    map.on('load', () => {
      map.addSource('doctors', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'doctors',
        type: 'circle',
        source: 'doctors',
        paint: {
          'circle-radius': 5,
          'circle-color': DOCTOR_COLOR,
          'circle-stroke-color': PIN_STROKE_COLOR,
          'circle-stroke-width': 1.5,
        },
      })
      map.on('click', 'doctors', (event) => {
        const feature = event.features?.[0]
        const coordinates = feature?.geometry.type === 'Point' ? feature.geometry.coordinates : null
        if (!feature || !coordinates) return
        const label = document.createElement('span')
        label.className = 'text-sm font-medium'
        label.textContent = String(feature.properties?.name ?? '')
        new Popup({ closeButton: false, offset: 8 })
          .setLngLat([coordinates[0], coordinates[1]])
          .setDOMContent(label)
          .addTo(map)
      })
      map.on('mouseenter', 'doctors', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'doctors', () => (map.getCanvas().style.cursor = ''))
      map.addSource('route-line', { type: 'geojson', data: EMPTY })
      map.addSource('route-points', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': PIN_STROKE_COLOR, 'line-width': 7, 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_COLOR, 'line-width': 4 },
      })
      map.addLayer({
        id: 'route-points',
        type: 'circle',
        source: 'route-points',
        paint: {
          'circle-radius': [
            'match',
            ['get', 'kind'],
            'start',
            6,
            'focus',
            9,
            'flagged',
            5,
            'excluded',
            5,
            2.5,
          ],
          'circle-color': [
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
            ROUTE_COLOR,
          ],
          'circle-stroke-color': ['match', ['get', 'kind'], 'focus', FLAGGED_COLOR, PIN_STROKE_COLOR],
          'circle-stroke-opacity': ['match', ['get', 'kind'], 'focus', 0.35, 1],
          'circle-stroke-width': ['match', ['get', 'kind'], 'point', 0.5, 'focus', 8, 2],
        },
      })
      applyMapTheme(map, themeRef.current)
      setReady(true)
    })
    map.on('dragstart', () => callbacks.current.onUserPan())

    const resize = new ResizeObserver(() => map.resize())
    resize.observe(container)
    mapRef.current = map
    const markers = markersRef.current

    return () => {
      resize.disconnect()
      for (const entry of markers.values()) entry.marker.remove()
      markers.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Follow light / dark.
  useEffect(() => {
    themeRef.current = theme
    const map = mapRef.current
    if (map && ready) applyMapTheme(map, theme)
  }, [theme, ready])

  // Keep markers in sync with the reps.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    const seen = new Set<string>()

    for (const rep of reps) {
      if (!rep.position) continue
      seen.add(rep.userId)
      let entry = markers.get(rep.userId)
      if (!entry) {
        const parts = createMarkerElement()
        const userId = rep.userId
        parts.root.addEventListener('click', (event) => {
          event.stopPropagation()
          callbacks.current.onSelect(userId)
        })
        entry = { ...parts, marker: new Marker({ element: parts.root, anchor: 'bottom' }) }
        entry.marker.setLngLat([rep.position.lng, rep.position.lat]).addTo(map)
        markers.set(rep.userId, entry)
      } else {
        entry.marker.setLngLat([rep.position.lng, rep.position.lat])
      }
      const selected = rep.userId === selectedId
      entry.label.textContent = rep.visitCustomer ? `${rep.fullName} · ${rep.visitCustomer}` : rep.fullName
      entry.dot.style.backgroundColor =
        rep.visitCustomer && rep.status === 'online' ? ON_VISIT_COLOR : LIVE_STATUS_COLOR[rep.status]
      entry.root.dataset.status = rep.status
      entry.root.dataset.selected = String(selected)
      entry.root.style.zIndex = selected ? '10' : STATUS_Z[rep.status]
      entry.root.setAttribute(
        'aria-label',
        rep.visitCustomer
          ? `${rep.fullName}: ${t('liveMap.onVisitWith', { name: rep.visitCustomer })}`
          : `${rep.fullName}: ${t(`liveMap.status.${rep.status}`)}`,
      )
    }

    for (const [id, entry] of markers) {
      if (!seen.has(id)) {
        entry.marker.remove()
        markers.delete(id)
      }
    }

    // First data: frame everyone (unless a rep is already selected from the URL).
    if (!fittedRef.current && seen.size > 0 && !selectedId) {
      fittedRef.current = true
      const bounds = new LngLatBounds()
      for (const rep of reps) if (rep.position) bounds.extend([rep.position.lng, rep.position.lat])
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 })
    }
  }, [reps, selectedId, t])

  // Clinic layer.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    void map.getSource<GeoJSONSource>('doctors')?.setData({
      type: 'FeatureCollection',
      features: doctors.map((d) => ({
        type: 'Feature',
        properties: { name: d.name },
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      })),
    })
  }, [ready, doctors])

  // Follow the selected rep while following is on.
  const selected = reps.find((r) => r.userId === selectedId)
  const followLat = following ? selected?.position?.lat : undefined
  const followLng = following ? selected?.position?.lng : undefined
  useEffect(() => {
    const map = mapRef.current
    if (!map || followLat == null || followLng == null) return
    fittedRef.current = true
    map.easeTo({ center: [followLng, followLat], zoom: Math.max(map.getZoom(), 15), duration: 700 })
  }, [followLat, followLng])

  // Route layers.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const line = map.getSource<GeoJSONSource>('route-line')
    const points = map.getSource<GeoJSONSource>('route-points')
    if (!line || !points) return
    if (!route || route.length === 0) {
      void line.setData(EMPTY)
      void points.setData(EMPTY)
      return
    }
    void line.setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route.filter((p) => !p.excluded).map((p) => [p.lng, p.lat]),
      },
    })
    void points.setData({
      type: 'FeatureCollection',
      features: route.map((p, i) => ({
        type: 'Feature',
        properties: {
          kind: p.focus
            ? 'focus'
            : i === 0
              ? 'start'
              : p.excluded
                ? 'excluded'
                : p.flagged
                  ? 'flagged'
                  : 'point',
          at: p.recordedAt,
        },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    })
  }, [ready, route])

  // Frame the whole route on request.
  const routeRef = useRef(route)
  useEffect(() => {
    routeRef.current = route
  }, [route])
  useEffect(() => {
    const map = mapRef.current
    const current = routeRef.current
    if (!map || !fitRouteKey || !current || current.length === 0) return
    const bounds = new LngLatBounds()
    for (const p of current) bounds.extend([p.lng, p.lat])
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 700 })
  }, [fitRouteKey])

  // MapLibre gives its container `position: relative`, so the absolute sizing lives on a wrapper.
  return (
    <div className="absolute inset-0" dir="ltr">
      <div ref={containerRef} className="size-full" role="region" aria-label={t('liveMap.mapLabel')} />
    </div>
  )
}
