import { ImageOffIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductImageDto } from '@/api/generated/model'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useBrochurePage } from './use-brochure-page'

function Page({ image, label }: { image: ProductImageDto; label: string }) {
  const { t } = useTranslation()
  const { src, failed } = useBrochurePage(image.url)
  return (
    <div className="grid aspect-[3/4] w-full shrink-0 snap-center place-items-center overflow-hidden rounded-card border bg-muted">
      {failed ? (
        <span className="grid place-items-center gap-1 text-sm text-muted-foreground">
          <ImageOffIcon className="size-6" aria-hidden />
          {t('catalog.brochure.failed')}
        </span>
      ) : src ? (
        <img src={src} alt={label} className="size-full object-contain" draggable={false} />
      ) : (
        <Skeleton className="size-full" />
      )}
    </div>
  )
}

/** The brochure pages side by side: swipe (or scroll) from one to the next, with a dot per page. */
export function BrochureGallery({ images, name }: { images: ProductImageDto[]; name: string }) {
  const { t } = useTranslation()
  const track = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  if (images.length === 0) return null

  const go = (index: number) => {
    const node = track.current?.children[index] as HTMLElement | undefined
    node?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  return (
    <section className="grid gap-2" aria-label={t('catalog.brochure.title')} data-testid="brochure-gallery">
      <div
        ref={track}
        className="flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget
          const width = el.firstElementChild?.clientWidth ?? el.clientWidth
          setCurrent(
            Math.min(images.length - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / (width + 12)))),
          )
        }}
      >
        {images.map((image, index) => (
          <Page
            key={image.id}
            image={image}
            label={t('catalog.brochure.page', { name, page: index + 1, total: images.length })}
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className="grid size-6 place-items-center"
              aria-label={t('catalog.brochure.goTo', { page: index + 1 })}
              aria-current={index === current}
              onClick={() => go(index)}
            >
              <span className={cn('size-2 rounded-full bg-border', index === current && 'bg-primary')} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
