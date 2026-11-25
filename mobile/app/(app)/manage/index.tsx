import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { EventStatusBadges, MenuRow } from '@/components/OrgUi';
import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { OrganizerEvent } from '@/lib/types';

export default function ManageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [events, setEvents] = useState<OrganizerEvent[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setEvents(await api<OrganizerEvent[]>('/organizer/events'));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

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

  if (events === null && !error) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={events ?? []}
        keyExtractor={(ev) => ev.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button title={t('manage.create')} onPress={() => router.push('/manage/new')} />
            <MenuRow icon="pricetags-outline" label={t('manage.campaigns')} onPress={() => router.push('/manage/campaigns')} />
            <MenuRow icon="chatbubbles-outline" label={t('manage.support')} onPress={() => router.push('/manage/support')} />
            <MenuRow icon="person-circle-outline" label={t('manage.profile')} onPress={() => router.push('/manage/profile')} />
            {error ? (
              <>
                <ErrorText>{error}</ErrorText>
                <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
              </>
            ) : null}
            {events && events.length === 0 ? <Muted>{t('manage.empty')}</Muted> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/manage/[id]', params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${formatDateTime(item.date)}, ${t(`manage.status.${item.status}`)}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {formatDateTime(item.date)} · {item.venue}
            </Text>
            <EventStatusBadges event={item} />
            <Text style={styles.meta}>
              {item.ticket_type_count > 0
                ? t('manage.sold', { sold: item.sold, total: item.total_quantity })
                : t('manage.noTypes')}
            </Text>
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
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  pressed: { backgroundColor: colors.surface },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
});
