import { MinusIcon, PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

const VIEWPORT = 280
const OUTPUT = 512

interface View {
  scale: number
  x: number
  y: number
}

/**
 * Drag-and-zoom square crop. `onReady` receives a function that renders the visible square
 * to a 512 px JPEG (the server re-encodes it to WebP anyway).
 */
export function SquareCropper({
  file,
  onReady,
}: {
  file: File
  onReady: (crop: (() => Promise<Blob>) | null) => void
}) {
  const { t } = useTranslation()
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight)
      setImage(img)
      setZoom(1)
      setView({
        scale,
        x: (VIEWPORT - img.naturalWidth * scale) / 2,
        y: (VIEWPORT - img.naturalHeight * scale) / 2,
      })
    }
    img.onerror = () => onReady(null)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, onReady])

  const clamp = useCallback(
    (next: View): View => {
      if (!image) return next
      const w = image.naturalWidth * next.scale
      const h = image.naturalHeight * next.scale
      return {
        scale: next.scale,
        x: Math.min(0, Math.max(VIEWPORT - w, next.x)),
        y: Math.min(0, Math.max(VIEWPORT - h, next.y)),
      }
    },
    [image],
  )

  const setZoomLevel = (value: number) => {
    if (!image) return
    const base = Math.max(VIEWPORT / image.naturalWidth, VIEWPORT / image.naturalHeight)
    const nextZoom = Math.min(4, Math.max(1, value))
    setZoom(nextZoom)
    setView((current) => {
      // Zoom around the centre of the viewport.
      const scale = base * nextZoom
      const cx = (VIEWPORT / 2 - current.x) / current.scale
      const cy = (VIEWPORT / 2 - current.y) / current.scale
      return clamp({ scale, x: VIEWPORT / 2 - cx * scale, y: VIEWPORT / 2 - cy * scale })
    })
  }

  useEffect(() => {
    if (!image) return
    onReady(
      () =>
        new Promise<Blob>((resolve, reject) => {
          const canvas = document.createElement('canvas')
          canvas.width = OUTPUT
          canvas.height = OUTPUT
          const context = canvas.getContext('2d')
          if (!context) return reject(new Error('canvas'))
          const size = VIEWPORT / view.scale
          context.imageSmoothingQuality = 'high'
          context.drawImage(
            image,
            -view.x / view.scale,
            -view.y / view.scale,
            size,
            size,
            0,
            0,
            OUTPUT,
            OUTPUT,
          )
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob'))), 'image/jpeg', 0.9)
        }),
    )
  }, [image, view, onReady])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, x: view.x, y: view.y }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    setView((current) =>
      clamp({ ...current, x: start.x + e.clientX - start.startX, y: start.y + e.clientY - start.startY }),
    )
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <div className="grid justify-items-center gap-3" dir="ltr">
      <div
        className="relative cursor-grab touch-none overflow-hidden rounded-xl bg-muted select-none active:cursor-grabbing"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={t('profile.cropHint')}
      >
        {image && (
          <img
            src={image.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none origin-top-left"
            style={{
              left: view.x,
              top: view.y,
              width: image.naturalWidth * view.scale,
              height: image.naturalHeight * view.scale,
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(0_0_0/45%)]" />
      </div>
      <div className="flex w-full max-w-[280px] items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setZoomLevel(zoom - 0.25)}
          aria-label={t('profile.zoomOut')}
        >
          <MinusIcon />
        </Button>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomLevel(Number(e.target.value))}
          className="flex-1 accent-primary"
          aria-label={t('profile.zoom')}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setZoomLevel(zoom + 0.25)}
          aria-label={t('profile.zoomIn')}
        >
          <PlusIcon />
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">{t('profile.cropHint')}</p>
    </div>
  )
}
