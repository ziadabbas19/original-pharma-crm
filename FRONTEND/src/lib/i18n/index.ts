import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'

export const LANGUAGES = ['ar', 'en'] as const
export type AppLanguage = (typeof LANGUAGES)[number]

/** Arabic is the default; English is the fallback for missing keys. */
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    supportedLngs: LANGUAGES,
    fallbackLng: 'en',
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'htmlTag'],
      lookupLocalStorage: 'op.language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })

/** Keeps <html lang/dir> in sync so RTL layout (logical CSS properties) follows the language. */
export function applyDocumentLanguage(language: string): void {
  const lang: AppLanguage = language.startsWith('en') ? 'en' : 'ar'
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

applyDocumentLanguage(i18n.resolvedLanguage ?? 'ar')
i18n.on('languageChanged', applyDocumentLanguage)

export default i18n
