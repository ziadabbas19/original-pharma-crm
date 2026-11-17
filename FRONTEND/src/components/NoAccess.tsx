import { LockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function NoAccess() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
      <LockIcon className="size-8" />
      <p>{t('common.noAccess')}</p>
    </div>
  )
}
