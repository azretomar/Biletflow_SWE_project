import i18n from '@/i18n';

const LOCALES: Record<string, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

function locale(): string {
  return LOCALES[i18n.language] ?? 'en-GB';
}

const KK_MONTHS = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'];

export function kkDay(d: Date): string {
  return `${d.getDate()} ${KK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

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

export function formatKzt(amount: number): string {
  const n = Number(amount) || 0;
  if (n === 0) return i18n.t('common.free');
  try {
    return n.toLocaleString(locale()) + ' ₸';
  } catch {
    return String(n) + ' ₸';
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

export function formatMoney(amount: number): string {
  const n = Number(amount) || 0;
  try {
    return n.toLocaleString(LOCALES[i18n.language] ?? 'en-GB') + ' ₸';
  } catch {
    return String(n) + ' ₸';
  }
}
