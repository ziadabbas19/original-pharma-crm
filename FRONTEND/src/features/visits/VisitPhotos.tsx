import { ImageOffIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VisitPhotoDto } from '@/api/generated/model'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetchBlob } from '@/lib/api-client'

function usePhotoUrl(path: string): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false })
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    apiFetchBlob(path)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, failed: false })
      })
      .catch(() => active && setState({ url: null, failed: true }))
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])
  return state
}

function VisitPhoto({ photo }: { photo: VisitPhotoDto }) {
  const { t } = useTranslation()
  const { url, failed } = usePhotoUrl(photo.url)
  const [open, setOpen] = useState(false)

  if (failed) {
    return (
      <span
        className="flex size-20 items-center justify-center rounded-md bg-muted"
        role="img"
        aria-label={t('visits.verification.photoFailed')}
      >
        <ImageOffIcon className="size-5 text-muted-foreground" aria-hidden />
      </span>
    )
  }
  if (!url) return <Skeleton className="size-20 rounded-md" />
  return (
    <>
      <button
        type="button"
        className="overflow-hidden rounded-md"
        aria-label={t('visits.verification.openPhoto')}
        onClick={() => setOpen(true)}
        data-testid="visit-photo"
      >
        <img src={url} alt="" className="size-20 object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('visits.verification.photo')}</DialogTitle>
            <DialogDescription className="sr-only">{t('visits.verification.photo')}</DialogDescription>
          </DialogHeader>
          <img
            src={url}
            alt={t('visits.verification.photo')}
            className="max-h-[70dvh] w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Proof photos of a visit, loaded with the viewer's session. */
export function VisitPhotos({ photos }: { photos: VisitPhotoDto[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((photo) => (
        <VisitPhoto key={photo.id} photo={photo} />
      ))}
    </div>
  )
}
