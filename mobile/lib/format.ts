import i18n from '@/i18n';

// Dates and prices in the app's language, like frontend/src/lib/format.js on the website.
const LOCALES: Record<string, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

function locale(): string {
  return LOCALES[i18n.language] ?? 'en-GB';
}

// Many Intl builds (Chrome, Hermes on iOS) have no Kazakh month names and print "2026 M12 31",
// so Kazakh dates are put together by hand: "31 жел. 2026".
const KK_MONTHS = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'];

export function kkDay(d: Date): string {
  return `${d.getDate()} ${KK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// "20 Dec 2026, 19:00" (shown in the phone's time zone; in Kazakhstan that is UTC+5).
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  if (i18n.language === 'kk') return `${kkDay(d)}, ${hhmm(d)}`;
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

// Date fields in forms use "YYYY-MM-DD HH:MM" in the phone's time zone.
const pad = (n: number) => String(n).padStart(2, '0');

// ISO from the backend -> "2026-12-20 19:00" for a form field ('' when empty).
export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "2026-12-20 19:00" (time optional) -> ISO for the backend; '' stays ''; null means "not a date".
export function fromDateInput(text: string): string | null {
  const s = text.trim();
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null;
  return date.toISOString();
}

// Money totals (revenue, discounts): 0 is "0 ₸", not "Free" like a ticket price.
export function formatMoney(amount: number): string {
  const n = Number(amount) || 0;
  try {
    return n.toLocaleString(LOCALES[i18n.language] ?? 'en-GB') + ' ₸';
  } catch {
    return String(n) + ' ₸';
  }
}
