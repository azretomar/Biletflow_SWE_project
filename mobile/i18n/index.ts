import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { ApiError } from '@/lib/api';
import { getItem, setItem } from '@/lib/storage';
import en from './en';
import kk from './kk';
import ru from './ru';

// SRS 7: Kazakh and Russian, with English as an additional locale.
export const LANGUAGES = [
  { code: 'kk', label: 'Қазақша' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const LANG_KEY = 'bf_lang';

function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return isLanguage(code) ? code : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru }, kk: { translation: kk } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Applies the language the user picked earlier, if any.
export async function loadSavedLanguage() {
  const saved = await getItem(LANG_KEY);
  if (isLanguage(saved) && saved !== i18n.language) await i18n.changeLanguage(saved);
}

export async function setLanguage(code: Language) {
  await i18n.changeLanguage(code);
  await setItem(LANG_KEY, code);
}

// Network and unknown errors are translated; backend validation messages are shown as sent.
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === 'network') return i18n.t('errors.network');
    if (err.message !== 'unknown') return err.message;
  }
  return i18n.t('errors.unknown');
}

export default i18n;
