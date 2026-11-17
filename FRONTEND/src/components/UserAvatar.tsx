import { useState } from 'react'
import { apiAssetUrl } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/** Profile picture (thumbnail, lazy) with the person's initials as fallback. */
export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string
  /** URL from the API (avatarUrl / avatarThumbnailUrl). */
  src?: string | null
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const url = apiAssetUrl(src)
  const initials = name
    .split(/\s+/)
    .filter((part) => part && !/^(dr\.?|د\.?)$/i.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join('')

  return (
    <span
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary uppercase',
        className,
      )}
      aria-hidden
    >
      {url && failed !== url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(url)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
