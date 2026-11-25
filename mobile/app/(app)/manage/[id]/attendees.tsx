import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge, ticketTone } from '@/components/Badge';
import { Button, ErrorText, Field, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { Attendee } from '@/lib/types';

// Attendee list of one event with a search (package 2-4, SRS 4.4 / 4.8):
// GET /api/organizer/events/{id}/attendees.
export default function AttendeesScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [list, setList] = useState<Attendee[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setList(await api<Attendee[]>(`/organizer/events/${id}/attendees`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!list || !q) return list ?? [];
    return list.filter((a) => a.full_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [list, query]);

  if (!list && !error) return <Loading />;

  const active = (list ?? []).filter((a) => a.status === 'valid' || a.status === 'checked_in');
  const checked = active.filter((a) => a.status === 'checked_in').length;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={shown}
        keyExtractor={(a) => a.ticket_id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? (
              <>
                <ErrorText>{error}</ErrorText>
                <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
              </>
            ) : null}
            {list && list.length > 0 ? (
              <>
                <Text style={styles.count}>{t('attendees.count', { checked, total: active.length })}</Text>
                <Field label={t('attendees.search')} value={query} onChangeText={setQuery} autoCapitalize="none" />
              </>
            ) : null}
            {list && list.length === 0 ? <Muted>{t('attendees.empty')}</Muted> : null}
            {list && list.length > 0 && shown.length === 0 ? <Muted>{t('attendees.noMatch')}</Muted> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.info}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>{item.email}</Text>
              <Text style={styles.meta}>{item.ticket_type}</Text>
              {item.checked_in_at ? (
                <Text style={styles.meta}>{t('attendees.checkedInAt', { time: formatTime(item.checked_in_at) })}</Text>
              ) : null}
            </View>
            <Badge label={t(`ticketStatus.${item.status}`)} tone={ticketTone(item.status)} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  count: { fontSize: 16, fontWeight: '700', color: colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
});
