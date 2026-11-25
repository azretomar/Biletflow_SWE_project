import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge, orderTone } from '@/components/Badge';
import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime, formatKzt } from '@/lib/format';
import type { Order } from '@/lib/types';

// My orders (package 1-3): GET /api/my-orders, newest first. Shows what was bought, the
// promo discount and the order status; payments are simulated (SRS 3.2).
export default function OrdersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setOrders(await api<Order[]>('/my-orders'));
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

  if (orders === null && !error) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={orders ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Muted>{t('orders.simulated')}</Muted>
            {error ? (
              <>
                <ErrorText>{error}</ErrorText>
                <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={error ? undefined : <Muted>{t('orders.empty')}</Muted>}
        renderItem={({ item }) => <OrderCard order={item} onHelp={() =>
          router.push({ pathname: '/tickets/support/new', params: { order: item.id } })} />}
      />
    </SafeAreaView>
  );
}

function OrderCard({ order, onHelp }: { order: Order; onHelp: () => void }) {
  const { t } = useTranslation();
  const status = t(`orders.status.${order.status}`);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{order.event.title}</Text>
        <Badge label={status} tone={orderTone(order.status)} />
      </View>
      <Text style={styles.meta}>
        {t('orders.order', { id: order.id.slice(0, 8) })} · {formatDateTime(order.created_at)}
      </Text>

      {order.items.map((it) => (
        <View key={`${it.ticket_type}-${it.price}`} style={styles.row}>
          <Text style={styles.item}>
            {it.quantity} × {it.ticket_type}
          </Text>
          <Text style={styles.item}>{formatKzt(it.price * it.quantity)}</Text>
        </View>
      ))}

      {order.discount > 0 ? (
        <>
          <View style={styles.row}>
            <Text style={styles.small}>{t('orders.subtotal')}</Text>
            <Text style={styles.small}>{formatKzt(order.subtotal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.small}>{t('orders.discount', { code: order.promo_code })}</Text>
            <Text style={styles.small}>−{formatKzt(order.discount)}</Text>
          </View>
        </>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.total}>{t('orders.total')}</Text>
        <Text style={styles.total}>{formatKzt(order.total)}</Text>
      </View>
      {order.tickets.length > 0 ? (
        <Text style={styles.small}>{t('orders.ticketCount', { n: order.tickets.length })}</Text>
      ) : null}

      <Pressable onPress={onHelp} accessibilityRole="link" hitSlop={8}>
        <Text style={styles.link}>{t('orders.help')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, flexShrink: 1 },
  meta: { fontSize: 13, color: colors.muted },
  item: { fontSize: 15, color: colors.text },
  small: { fontSize: 14, color: colors.muted },
  total: { fontSize: 16, fontWeight: '700', color: colors.text },
  link: { fontSize: 15, color: colors.blue, fontWeight: '600', marginTop: 4 },
});
