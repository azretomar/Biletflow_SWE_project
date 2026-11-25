import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/Badge';
import { colors, radius, spacing } from '@/constants/theme';
import type { Event } from '@/lib/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function MenuRow({ icon, label, hint, onPress }: { icon: IconName; label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={colors.blue} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export function EventStatusBadges({ event }: { event: Pick<Event, 'status' | 'suspended' | 'paid_sales'> }) {
  const { t } = useTranslation();
  const tone = event.status === 'published' ? 'good' : event.status === 'cancelled' ? 'bad' : 'neutral';
  return (
    <View style={styles.badges}>
      <Badge label={t(`manage.status.${event.status}`)} tone={tone} />
      {event.paid_sales !== 'none' ? (
        <Badge label={t(`manage.paidSales.${event.paid_sales}`)} tone={event.paid_sales === 'active' ? 'info' : 'warn'} />
      ) : null}
      {event.suspended ? <Badge label={t('manage.suspended')} tone="bad" /> : null}
    </View>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowHint: { fontSize: 13, color: colors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
});
