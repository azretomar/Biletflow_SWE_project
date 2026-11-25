import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge, ticketTone } from '@/components/Badge';
import { Chips } from '@/components/Chips';
import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Ticket } from '@/lib/types';

type Filter = 'upcoming' | 'past' | 'all';

const STILL_ON_MS = 12 * 60 * 60 * 1000;

function isUpcoming(t: Ticket, now: number): boolean {
  return new Date(t.event.date).getTime() + STILL_ON_MS >= now;
}

export default function TicketsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('upcoming');

  const load = useCallback(async () => {
    setError('');
    try {
      setTickets(await api<Ticket[]>('/my-tickets'));
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

  const visible = useMemo(() => {
    const now = Date.now();
    const list = (tickets ?? []).filter((tk) =>
      filter === 'all' ? true : filter === 'upcoming' ? isUpcoming(tk, now) : !isUpcoming(tk, now),
    );
    const time = (tk: Ticket) => new Date(tk.event.date).getTime();
    return list.sort((a, b) => (filter === 'upcoming' ? time(a) - time(b) : time(b) - time(a)));
  }, [tickets, filter]);

  if (tickets === null && !error) return <Loading />;

  const header = (
    <View style={styles.header}>
      <View style={styles.links}>
        <View style={styles.linkButton}>
          <Button title={t('tickets.myOrders')} variant="secondary" onPress={() => router.push('/tickets/orders')} />
        </View>
        <View style={styles.linkButton}>
          <Button title={t('tickets.help')} variant="secondary" onPress={() => router.push('/tickets/support')} />
        </View>
      </View>
      <Chips<Filter>
        label={t('tickets.filterLabel')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'upcoming', label: t('tickets.upcoming') },
          { value: 'past', label: t('tickets.past') },
          { value: 'all', label: t('tickets.all') },
        ]}
      />
      {error ? (
        <View style={styles.errorBox}>
          <ErrorText>{error}</ErrorText>
          <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
        </View>
      ) : null}
    </View>
  );

  const empty =
    error ? undefined : (tickets ?? []).length === 0 ? (
      <View style={styles.empty}>
        <Muted>{t('tickets.empty')}</Muted>
        <Button title={t('tickets.findEvents')} onPress={() => router.navigate('/events')} />
      </View>
    ) : (
      <Muted>{t('tickets.emptyFilter')}</Muted>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={visible}
        keyExtractor={(tk) => tk.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        renderItem={({ item }) => {
          const status = t(`ticketStatus.${item.status}`);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/tickets/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${item.event.title}, ${formatDateTime(item.event.date)}, ${item.ticket_type.name}, ${status}`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Text style={styles.title}>{item.event.title}</Text>
              <Text style={styles.meta}>
                {formatDateTime(item.event.date)} · {item.event.venue}
              </Text>
              <View style={styles.row}>
                <Text style={styles.type}>{item.ticket_type.name}</Text>
                <Badge label={status} tone={ticketTone(item.status)} />
              </View>
              {item.event.status === 'cancelled' ? (
                <Text style={styles.cancelled}>{t('tickets.eventCancelled')}</Text>
              ) : null}
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
  links: { flexDirection: 'row', gap: spacing.sm },
  linkButton: { flex: 1 },
  errorBox: { gap: spacing.sm },
  empty: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  pressed: { opacity: 0.85 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: 4 },
  type: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  cancelled: { fontSize: 14, color: colors.danger, fontWeight: '600' },
});
