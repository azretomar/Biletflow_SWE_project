import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge, caseTone } from '@/components/Badge';
import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { OrganizerCase } from '@/lib/types';

// Attendee requests about the organizer's events (package 2-3, SRS 4.13):
// GET /api/organizer/support/cases.
export default function OrganizerInboxScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [cases, setCases] = useState<OrganizerCase[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setCases(await api<OrganizerCase[]>('/organizer/support/cases'));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!cases && !error) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={cases ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
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
            {cases && cases.length === 0 ? <Muted>{t('orgSupport.empty')}</Muted> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/manage/support/[id]', params: { id: String(item.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.subject}, ${t(`orgSupport.statuses.${item.status}`)}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.head}>
              <Text style={styles.subject}>{item.subject}</Text>
              <Badge label={t(`orgSupport.statuses.${item.status}`)} tone={caseTone(item.status)} />
            </View>
            {item.requester ? <Text style={styles.meta}>{t('orgSupport.from', { name: item.requester.full_name })}</Text> : null}
            {item.event ? <Text style={styles.meta}>{item.event.title}</Text> : null}
            <Text style={styles.meta}>{t('support.updated', { date: formatDateTime(item.updated_at) })}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  pressed: { backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  subject: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
});
