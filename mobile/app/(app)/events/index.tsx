import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime, formatKzt } from '@/lib/format';
import type { EventListItem } from '@/lib/types';

const CATEGORIES = ['', 'music', 'education', 'sports', 'other'] as const;

// Public event list (SRS 2.3 Attendee, plan step 2): GET /api/events, filtered on the phone.
// Past events are hidden, like the default filter on the website.
export default function EventsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('');

  const load = useCallback(async () => {
    setError('');
    try {
      setEvents(await api<EventListItem[]>('/events'));
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

  const visible = useMemo(() => {
    const now = Date.now();
    const q = search.trim().toLowerCase();
    return (events ?? [])
      .filter((ev) => new Date(ev.date).getTime() >= now)
      .filter((ev) => !category || ev.category === category)
      .filter((ev) => !q || `${ev.title} ${ev.venue} ${ev.organizer_name}`.toLowerCase().includes(q))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, search, category]);

  if (events === null && !error) return <Loading />;

  const header = (
    <View style={styles.header}>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder={t('events.searchPlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('events.searchLabel')}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <View style={styles.chips} accessibilityRole="radiogroup">
        {CATEGORIES.map((c) => {
          const selected = category === c;
          return (
            <Pressable
              key={c || 'all'}
              onPress={() => setCategory(c)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {t(`categories.${c || 'all'}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <ErrorText>{error}</ErrorText>
          <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={visible}
        keyExtractor={(ev) => ev.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListEmptyComponent={
          error ? undefined : <Muted>{(events ?? []).length === 0 ? t('events.empty') : t('events.noMatch')}</Muted>
        }        
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${formatDateTime(item.date)}, ${item.venue}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.category}>{t(`categories.${categoryKey(item.category)}`)}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {formatDateTime(item.date)} · {item.venue}
            </Text>
            <Text style={styles.price}>
              {item.min_price === 0 ? t('common.free') : t('events.from', { price: formatKzt(item.min_price) })}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

// Unknown categories from the backend are shown as "Other".
function categoryKey(c: string): 'music' | 'education' | 'sports' | 'other' {
  return c === 'music' || c === 'education' || c === 'sports' ? c : 'other';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  search: {
    backgroundColor: colors.fieldBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  errorBox: { gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  pressed: { opacity: 0.85 },
  category: { fontSize: 12, fontWeight: '600', color: colors.blue, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  price: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
});
