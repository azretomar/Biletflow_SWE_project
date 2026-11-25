import i18n from '@/i18n';
import { kkDay } from '@/lib/format';

const LOCALES: Record<string, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

export function dayLabel(value: string): string {
  const d = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  if (Number.isNaN(d.getTime())) return value;
  if (i18n.language === 'kk') return kkDay(d);
  try {
    return d.toLocaleDateString(LOCALES[i18n.language] ?? 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value.slice(0, 10);
  }
}

export function dayKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
