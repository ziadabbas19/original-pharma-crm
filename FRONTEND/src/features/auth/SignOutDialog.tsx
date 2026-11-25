import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/bulk/ConfirmDialog'
import { logout } from '@/lib/session'

/**
 * Asked before every sign-out: Cancel (focused first) or Sign out. Escape and a click outside cancel.
 * Mount it while it should be open.
 */
export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <ConfirmDialog
      title={t('signOut.title')}
      description={t('signOut.description')}
      confirmLabel={t('common.signOut')}
      onConfirm={async () => {
        await logout()
        await navigate({ to: '/login' })
      }}
      onClose={onClose}
    />
  )
}
