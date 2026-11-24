import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { StaffEvent } from '@/lib/types';

const HOUR = 60 * 60 * 1000;

// Step 1 of check-in (SRS 4.8): the events this person may check tickets in for,
// i.e. their own events (organizer) and the ones they are assigned to (staff).
// GET /api/staff/events. Events that ended more than a day ago are not shown.
export default function ScannerEventsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [events, setEvents] = useState<StaffEvent[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setEvents(await api<StaffEvent[]>('/staff/events'));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (events === null && !error) return <Loading />;

  const now = Date.now();
  const visible = (events ?? []).filter((ev) => new Date(ev.date).getTime() > now - 24 * HOUR);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={visible}
        keyExtractor={(ev) => ev.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? (
              <>
                <ErrorText>{error}</ErrorText>
                <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
              </>
            ) : (
              <Muted>{visible.length > 0 ? t('scanner.chooseEvent') : t('scanner.noEvents')}</Muted>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/scanner/[id]', params: { id: item.id, title: item.title } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${formatDateTime(item.date)}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {formatDateTime(item.date)} · {item.venue}
            </Text>
            <Text style={styles.access}>{item.access === 'organizer' ? t('scanner.own') : t('scanner.staff')}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  pressed: { opacity: 0.85 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  access: { fontSize: 13, fontWeight: '600', color: colors.blue },
});
