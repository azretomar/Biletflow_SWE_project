import i18n from '@/i18n';

// Dates and prices in the app's language, like frontend/src/lib/format.js on the website.
const LOCALES: Record<string, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

function locale(): string {
  return LOCALES[i18n.language] ?? 'en-GB';
}

// "20 Dec 2026, 19:00" (shown in the phone's time zone; in Kazakhstan that is UTC+5).
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return d.toLocaleString(locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

// "14:05"
export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

// 12500 -> "12 500 ₸"; 0 -> "Free"
export function formatKzt(amount: number): string {
  const n = Number(amount) || 0;
  if (n === 0) return i18n.t('common.free');
  try {
    return n.toLocaleString(locale()) + ' ₸';
  } catch {
    return String(n) + ' ₸';
  }
}
