import { lazy, Suspense, type ComponentProps } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const LocationMapImpl = lazy(() => import('./LocationMap'))

/** The location map, loaded on first use: MapLibre only comes with the screens that show a map. */
export function LocationMap(props: ComponentProps<typeof LocationMapImpl>) {
  return (
    <Suspense fallback={<Skeleton className={props.className ?? 'h-56 w-full rounded-xl'} />}>
      <LocationMapImpl {...props} />
    </Suspense>
  )
}

export type { MapPoint } from './LocationMap'
