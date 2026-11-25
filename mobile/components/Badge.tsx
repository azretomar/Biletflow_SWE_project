import { StyleSheet, Text } from 'react-native';

import { colors } from '@/constants/theme';

type Tone = 'good' | 'info' | 'warn' | 'bad' | 'neutral';

const TONES: Record<Tone, { fg: string; bg: string }> = {
  good: { fg: colors.success, bg: '#e6f4ea' },
  info: { fg: colors.blue, bg: '#e8f0fe' },
  warn: { fg: colors.warning, bg: '#fff4e0' },
  bad: { fg: colors.danger, bg: '#fdecea' },
  neutral: { fg: colors.muted, bg: colors.surface },
};

export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const c = TONES[tone];
  return <Text style={[styles.badge, { color: c.fg, backgroundColor: c.bg }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});

export function ticketTone(status: string): Tone {
  if (status === 'valid') return 'good';
  if (status === 'checked_in') return 'info';
  return 'bad';
}

export function orderTone(status: string): Tone {
  if (status === 'paid' || status === 'free') return 'good';
  if (status === 'failed') return 'bad';
  return 'neutral';
}

export function caseTone(status: string): Tone {
  if (status === 'resolved') return 'good';
  if (status === 'waiting') return 'warn';
  if (status === 'in_progress') return 'info';
  return 'neutral';
}
