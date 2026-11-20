import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, type GeoJSONSource } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/lib/theme'
import {
  applyMapTheme,
  BASE_MAP_STYLE,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  ROUTE_COLOR,
} from '../tracking/live-map/map-setup'

export interface MapPoint {
  id: string
  lat: number
  lng: number
  /** clinic: the saved location; visit: a check-in (numbered); checkOut: where the visit closed; median: of the visits. */
  kind: 'clinic' | 'visit' | 'checkOut' | 'median'
  /** Short text on the marker (the visit number). */
  label?: string
  /** Accessible name and tooltip. */
  title: string
  /** Drawn in the warning colour (drift, flagged). */
  flagged?: boolean
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] }

/** A circle of `meters` around a point as a polygon (the geofence of the clinic). */
function circle(lat: number, lng: number, meters: number) {
  const coordinates: [number, number][] = []
  const dLat = meters / 111_320
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180))
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * 2 * Math.PI
    coordinates.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)])
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
  }
}

function markerElement(point: MapPoint): HTMLElement {
  const root = document.createElement('div')
  root.setAttribute('role', 'img')
  root.setAttribute('aria-label', point.title)
  root.title = point.title
  root.dataset.kind = point.kind
  root.dataset.flagged = String(point.flagged === true)
  root.className = 'location-map-marker'
  if (point.label) root.textContent = point.label
  return root
}

/**
 * A small read-only map of saved locations: the clinic (with its geofence), numbered visit check-ins,
 * check-outs and the median of the visits. Used in the doctor and visit details on the dashboard.
 */
export default function LocationMap({
  points,
  radiusMeters,
  className,
}: {
  points: MapPoint[]
  /** Geofence radius around the clinic point. */
  radiusMeters?: number
  className?: string
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const [ready, setReady] = useState(false)
  const { theme } = useTheme()
  const themeRef = useRef(theme)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: BASE_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false,
      cooperativeGestures: true,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(
      new NavigationControl({ showCompass: false }),
      document.documentElement.dir === 'rtl' ? 'top-left' : 'top-right',
    )
    map.on('load', () => {
      map.addSource('geofence', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'geofence-fill',
        type: 'fill',
        source: 'geofence',
        paint: { 'fill-color': ROUTE_COLOR, 'fill-opacity': 0.08 },
      })
      map.addLayer({
        id: 'geofence-line',
        type: 'line',
        source: 'geofence',
        paint: { 'line-color': ROUTE_COLOR, 'line-width': 1.5, 'line-dasharray': [2, 2] },
      })
      applyMapTheme(map, themeRef.current)
      setReady(true)
    })
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(container)
    mapRef.current = map
    const markers = markersRef.current
    return () => {
      resize.disconnect()
      for (const marker of markers) marker.remove()
      markers.length = 0
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    themeRef.current = theme
    if (mapRef.current && ready) applyMapTheme(mapRef.current, theme)
  }, [theme, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    // Clinic last so it is drawn above the visits around it.
    const ordered = [...points].sort((a, b) => (a.kind === 'clinic' ? 1 : 0) - (b.kind === 'clinic' ? 1 : 0))
    for (const point of ordered) {
      markersRef.current.push(
        new Marker({ element: markerElement(point), anchor: 'center' })
          .setLngLat([point.lng, point.lat])
          .addTo(map),
      )
    }

    const clinic = points.find((p) => p.kind === 'clinic')
    void map
      .getSource<GeoJSONSource>('geofence')
      ?.setData(clinic && radiusMeters ? circle(clinic.lat, clinic.lng, radiusMeters) : EMPTY)

    if (points.length > 0) {
      const bounds = new LngLatBounds()
      for (const p of points) bounds.extend([p.lng, p.lat])
      if (clinic && radiusMeters) {
        const ring = circle(clinic.lat, clinic.lng, radiusMeters).geometry.coordinates[0]
        for (const [lng, lat] of ring) bounds.extend([lng, lat])
      }
      map.fitBounds(bounds, { padding: 36, maxZoom: 17, duration: 0 })
    }
  }, [points, radiusMeters, ready])

  return (
    // MapLibre makes its container `position: relative`, so the size comes from this wrapper.
    <div className={className ?? 'relative h-56 overflow-hidden rounded-xl border'} dir="ltr">
      <div
        ref={containerRef}
        className="size-full"
        role="region"
        aria-label={t('visits.location.mapLabel')}
      />
    </div>
  )
}
