import { LanguagesIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAppDispatch } from '@/store'
import { languageChanged } from '@/store/slices/uiSlice'

/** Toggles Arabic (RTL) / English (LTR). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const dispatch = useAppDispatch()

  const toggle = () => {
    const next = i18n.resolvedLanguage === 'ar' ? 'en' : 'ar'
    void i18n.changeLanguage(next)
    dispatch(languageChanged(next))
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} className={className}>
      <LanguagesIcon />
      {t('common.switchLanguage')}
    </Button>
  )
}
