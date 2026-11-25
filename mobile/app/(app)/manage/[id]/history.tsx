import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/components/Chips';
import { dayKey, dayLabel } from '@/components/dayLabel';
import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { HistoryEntry, HistoryResponse, HistoryType } from '@/lib/types';

type TypeFilter = 'all' | HistoryType;
type Period = 'all' | 'week' | 'month';

const TYPES: TypeFilter[] = ['all', 'event', 'tickets', 'orders', 'checkin', 'payments', 'support'];
const KNOWN = new Set<string>(TYPES);
const PERIOD_DAYS: Record<Period, number> = { all: 0, week: 7, month: 30 };

// Event history for the organizer (package 2-3, SRS 4.5):
// GET /api/organizer/events/{id}/history, newest first, grouped by day, with filters.
export default function HistoryScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [type, setType] = useState<TypeFilter>('all');
  const [period, setPeriod] = useState<Period>('all');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api<HistoryResponse>(`/organizer/events/${id}/history`));
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

  const sections = useMemo(() => {
    const list = data?.activity ?? [];
    const since = PERIOD_DAYS[period] ? Date.now() - PERIOD_DAYS[period] * 86_400_000 : 0;
    const shown = list.filter(
      (a) => (type === 'all' || kindOf(a) === type) && (!since || new Date(a.at).getTime() >= since),
    );
    const groups: { title: string; data: HistoryEntry[] }[] = [];
    let last = '';
    for (const a of shown) {
      const key = dayKey(a.at);
      if (key !== last) {
        groups.push({ title: dayLabel(a.at), data: [] });
        last = key;
      }
      groups[groups.length - 1].data.push(a);
    }
    return groups;
  }, [data, type, period]);

  const header = <Stack.Screen options={{ title: t('history.title') }} />;

  if (missing) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        {header}
        <View style={styles.list}>
          <Muted>{t('analytics.notFound')}</Muted>
        </View>
      </SafeAreaView>
    );
  }
  if (!data && !error) return <>{header}<Loading /></>;

  const total = data?.activity.length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {header}
      <SectionList
        sections={sections}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={styles.filters}>
            {data ? <Text style={styles.eventTitle}>{data.event.title}</Text> : null}
            {error ? (
              <>
                <ErrorText>{error}</ErrorText>
                <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
              </>
            ) : null}
            <Text style={styles.filterLabel}>{t('history.typeLabel')}</Text>
            <Chips
              label={t('history.typeLabel')}
              value={type}
              onChange={setType}
              options={TYPES.map((v) => ({ value: v, label: t(`history.types.${v}`) }))}
            />
            <Text style={styles.filterLabel}>{t('history.periodLabel')}</Text>
            <Chips
              label={t('history.periodLabel')}
              value={period}
              onChange={setPeriod}
              options={(['all', 'week', 'month'] as const).map((v) => ({
                value: v,
                label: t(`history.periods.${v}`),
              }))}
            />
          </View>
        }
        ListEmptyComponent={
          error ? undefined : <Muted>{total === 0 ? t('history.empty') : t('history.noMatch')}</Muted>
        }
        renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
        renderItem={({ item }) => (
          <View style={styles.entry}>
            <View style={styles.entryTop}>
              <Text style={styles.kind}>{t(`history.types.${kindOf(item)}`)}</Text>
              <Text style={styles.time}>{formatTime(item.at)}</Text>
            </View>
            <Text style={styles.message}>{item.message}</Text>
            {item.actor ? <Text style={styles.actor}>{item.actor}</Text> : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function kindOf(a: HistoryEntry): HistoryType {
  return KNOWN.has(a.type) && a.type !== 'all' ? (a.type as HistoryType) : 'event';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm },
  filters: { gap: spacing.sm, marginBottom: spacing.sm },
  eventTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  filterLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  day: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.sm,
  },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between' },
  kind: { fontSize: 13, fontWeight: '600', color: colors.blue },
  time: { fontSize: 13, color: colors.muted },
  message: { fontSize: 15, color: colors.text },
  actor: { fontSize: 13, color: colors.muted },
});
