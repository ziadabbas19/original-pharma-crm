import { CameraIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountRemoveAvatar, useAccountSetAvatar } from '@/api/generated/endpoints'
import { ConfirmDialog } from '@/components/bulk/ConfirmDialog'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserAvatar } from '@/components/UserAvatar'
import { UserFacingError } from '@/lib/errors'
import { loadMe } from '@/lib/session'
import { useAppSelector } from '@/store'
import { SquareCropper } from './SquareCropper'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Your own profile picture: pick, crop to a square, upload; or remove. */
export function AvatarEditor() {
  const { t } = useTranslation()
  const user = useAppSelector((s) => s.auth.user)
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [crop, setCrop] = useState<(() => Promise<Blob>) | null>(null)
  const [error, setError] = useState<unknown>(null)
  const upload = useAccountSetAvatar()
  const remove = useAccountRemoveAvatar()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const onReady = useCallback((fn: (() => Promise<Blob>) | null) => setCrop(() => fn), [])

  if (!user) return null

  const pick = (selected: File | undefined) => {
    setError(null)
    if (!selected) return
    if (selected.size > MAX_IMAGE_BYTES) {
      setError(new UserFacingError(t('images.tooLarge')))
      return
    }
    setFile(selected)
  }

  const save = async () => {
    if (!crop) return
    try {
      const blob = await crop()
      await upload.mutateAsync({ data: { file: new File([blob], 'avatar.jpg', { type: 'image/jpeg' }) } })
      await loadMe()
      setFile(null)
    } catch (e) {
      setError(e)
    }
  }

  const clear = async () => {
    setError(null)
    try {
      await remove.mutateAsync()
      await loadMe()
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4">
        <UserAvatar name={user.fullName} src={user.avatarUrl} className="size-20 text-xl" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <CameraIcon />
            {user.avatarUrl ? t('profile.changePicture') : t('profile.addPicture')}
          </Button>
          {user.avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(true)}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              {t('profile.removePicture')}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {!file && <FormError error={error} />}
      {confirmRemove && (
        <ConfirmDialog
          title={t('profile.removePictureTitle')}
          description={t('profile.removePictureHint')}
          confirmLabel={t('profile.removePicture')}
          onClose={() => setConfirmRemove(false)}
          onConfirm={clear}
        />
      )}

      <Dialog open={file !== null} onOpenChange={(open) => !open && setFile(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('profile.cropTitle')}</DialogTitle>
            <DialogDescription>{t('profile.pictureHint')}</DialogDescription>
          </DialogHeader>
          {file && <SquareCropper file={file} onReady={onReady} />}
          <FormError error={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFile(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={!crop || upload.isPending}>
              {upload.isPending && <Loader2Icon className="animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
