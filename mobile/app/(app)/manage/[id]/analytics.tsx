import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { dayLabel } from '@/components/dayLabel';
import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatMoney as formatKzt } from '@/lib/format';
import type { Analytics } from '@/lib/types';

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api<Analytics>(`/organizer/events/${id}/analytics`));
      setMissing(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setMissing(true);
      else setError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const header = <Stack.Screen options={{ title: data?.event.title ?? t('analytics.title') }} />;

  if (missing) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        {header}
        <View style={styles.content}>
          <Muted>{t('analytics.notFound')}</Muted>
        </View>
      </SafeAreaView>
    );
  }
  if (!data && !error) return <>{header}<Loading /></>;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        {error ? (
          <>
            <ErrorText>{error}</ErrorText>
            <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
          </>
        ) : null}
        {data ? <Report data={data} /> : null}
        <Button
          title={t('analytics.history')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/manage/[id]/history', params: { id } })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Report({ data }: { data: Analytics }) {
  const { t } = useTranslation();
  const soldShare = percent(data.sold, data.capacity);
  const cameShare = percent(data.checked_in, data.sold);
  const maxDay = Math.max(1, ...data.sales_by_day.map((d) => d.tickets));

  return (
    <>
      <Muted>
        {formatDateTime(data.event.starts_at)} · {data.event.venue}
      </Muted>

      <Section title={t('analytics.tickets')}>
        <View style={styles.tiles}>
          <Tile label={t('analytics.sold')} value={String(data.sold)} />
          <Tile label={t('analytics.capacity')} value={String(data.capacity)} />
          <Tile label={t('analytics.remaining')} value={String(Math.max(0, data.capacity - data.sold))} />
        </View>
        <Bar share={soldShare} label={t('analytics.soldShare', { p: soldShare })} />
      </Section>

      <Section title={t('analytics.attendance')}>
        <View style={styles.tiles}>
          <Tile label={t('analytics.checkedIn')} value={String(data.checked_in)} />
          <Tile label={t('analytics.notYet')} value={String(Math.max(0, data.sold - data.checked_in))} />
        </View>
        <Bar share={cameShare} label={t('analytics.attendanceShare', { p: cameShare })} />
      </Section>

      <Section title={t('analytics.revenue')}>
        <Line label={t('analytics.gross')} value={formatKzt(data.revenue.gross)} />
        <Line label={t('analytics.discounts')} value={minus(data.revenue.discounts)} />
        <Line label={t('analytics.refunds')} value={minus(data.revenue.refunds)} />
        <Line label={t('analytics.net')} value={formatKzt(data.revenue.net)} strong />
        <Muted>{t('analytics.simulated')}</Muted>
      </Section>

      <Section title={t('analytics.byDay')}>
        {data.sales_by_day.length === 0 ? <Muted>{t('analytics.noSales')}</Muted> : null}
        {data.sales_by_day.map((d) => (
          <Bar
            key={d.date}
            share={Math.round((d.tickets / maxDay) * 100)}
            label={t('analytics.dayRow', { date: dayLabel(d.date), n: d.tickets, amount: formatKzt(d.revenue) })}
          />
        ))}
      </Section>

      <Section title={t('analytics.byType')}>
        {data.by_ticket_type.map((tt) => {
          const share = percent(tt.sold, tt.quantity);
          return (
            <View key={tt.name} style={styles.typeRow}>
              <View style={styles.lineRow}>
                <Text style={styles.typeName}>{tt.name}</Text>
                <Text style={styles.value}>{formatKzt(tt.revenue)}</Text>
              </View>
              <Bar share={share} label={t('analytics.typeRow', { sold: tt.sold, quantity: tt.quantity })} />
            </View>
          );
        })}
      </Section>

      <Section title={t('analytics.promo')}>
        {data.promo.length === 0 ? <Muted>{t('analytics.noPromo')}</Muted> : null}
        {data.promo.map((p) => (
          <Line
            key={p.code}
            label={p.code}
            value={t('analytics.promoRow', { n: p.redemptions, amount: formatKzt(p.discount_total) })}
          />
        ))}
      </Section>
    </>
  );
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

function minus(amount: number): string {
  return amount > 0 ? '−' + formatKzt(amount) : formatKzt(0);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.lineRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function Bar({ share, label }: { share: number; label: string }) {
  return (
    <View style={styles.bar} accessible accessibilityLabel={label}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, share))}%` }]} />
      </View>
      <Text style={styles.barLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  tileValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  tileLabel: { fontSize: 13, color: colors.muted },
  bar: { gap: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.fieldBg, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.blue },
  barLabel: { fontSize: 13, color: colors.muted },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  lineLabel: { fontSize: 15, color: colors.text, flexShrink: 1 },
  value: { fontSize: 15, color: colors.text, textAlign: 'right', flexShrink: 1 },
  strong: { fontWeight: '700' },
  typeRow: { gap: 4 },
  typeName: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
});
