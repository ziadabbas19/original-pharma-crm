import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-4xl font-semibold">404</p>
      <Button asChild variant="outline">
        <Link to="/">{t('common.back')}</Link>
      </Button>
    </div>
  )
}
