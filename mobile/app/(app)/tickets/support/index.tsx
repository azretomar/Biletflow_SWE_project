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
import type { SupportCase } from '@/lib/types';

// My support requests (package 2-3, SRS 4.13): GET /api/support/cases, most recently updated first.
export default function SupportListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [cases, setCases] = useState<SupportCase[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setCases(await api<SupportCase[]>('/support/cases'));
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

  if (cases === null && !error) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={cases ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button title={t('support.newRequest')} onPress={() => router.push('/tickets/support/new')} />
            {error ? (
              <>
                <ErrorText>{error}</ErrorText>
                <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={error ? undefined : <Muted>{t('support.empty')}</Muted>}
        renderItem={({ item }) => {
          const status = t(`support.status.${item.status}`);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/tickets/support/[id]', params: { id: String(item.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`${item.subject}, ${status}`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.row}>
                <Text style={styles.title}>{item.subject}</Text>
                <Badge label={status} tone={caseTone(item.status)} />
              </View>
              <Text style={styles.meta}>
                {t('support.request', { id: item.id })} · {t(`support.categories.${item.category}`)}
              </Text>
              <Text style={styles.meta}>{t('support.updated', { date: formatDateTime(item.updated_at) })}</Text>
            </Pressable>
          );
        }}
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, flexShrink: 1 },
  meta: { fontSize: 13, color: colors.muted },
});
