import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, orderTone } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Notice } from '@/components/Notice';
import { Card, Heading } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime, formatKzt } from '@/lib/format';
import type { OrganizerOrder } from '@/lib/types';

type Action = { order: OrganizerOrder; kind: 'cancel' | 'refund' };

// Orders of one event with cancel / refund and the refund policy (package 2-4, SRS 4.9):
// GET /api/organizer/events/{id}/orders, POST /api/organizer/orders/{orderId}/cancel|refund,
// GET/PUT /api/organizer/events/{id}/refund-policy.
export default function OrdersScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [orders, setOrders] = useState<OrganizerOrder[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [policy, setPolicy] = useState('');
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyError, setPolicyError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [list, p] = await Promise.all([
        api<OrganizerOrder[]>(`/organizer/events/${id}/orders`),
        api<{ policy: string }>(`/organizer/events/${id}/refund-policy`),
      ]);
      setOrders(list);
      setPolicy(p.policy);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function savePolicy() {
    setPolicyBusy(true);
    setPolicyError('');
    setNotice('');
    try {
      await api(`/organizer/events/${id}/refund-policy`, { method: 'PUT', body: { policy: policy.trim() } });
      setNotice(t('orgOrders.policySaved'));
    } catch (err) {
      setPolicyError(errorText(err));
    }
    setPolicyBusy(false);
  }

  async function act(reason: string) {
    if (!action) return;
    await api(`/organizer/orders/${action.order.id}/${action.kind}`, { method: 'POST', body: { reason } });
    setAction(null);
    setNotice(t('orgOrders.done'));
    await load();
  }

  if (!orders && loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!orders) return <Loading />;

  return (
    <Screen>
      <Notice>{notice}</Notice>
      <Heading>{t('orgOrders.policy')}</Heading>
      <Field label={t('orgOrders.policy')} hint={t('orgOrders.policyHint')} value={policy} onChangeText={setPolicy} multiline />
      <ErrorText>{policyError}</ErrorText>
      <Button title={t('common.save')} variant="secondary" onPress={() => void savePolicy()} loading={policyBusy} />

      <Heading>{t('manage.sections.orders')}</Heading>
      <Muted>{t('orders.simulated')}</Muted>
      {orders.length === 0 ? <Muted>{t('orgOrders.empty')}</Muted> : null}
      {orders.map((o) => (
        <Card key={o.id}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('orders.order', { id: o.id.slice(0, 8) })}</Text>
            <Badge label={t(`orders.status.${o.status}`)} tone={orderTone(o.status)} />
          </View>
          {o.attendee ? <Text style={styles.meta}>{t('orgOrders.by', { name: o.attendee.full_name, email: o.attendee.email })}</Text> : null}
          <Text style={styles.meta}>{formatDateTime(o.created_at)}</Text>
          {o.items.map((it, i) => (
            <Text key={i} style={styles.line}>
              {t('checkout.line', { name: it.ticket_type, n: it.quantity })} · {formatKzt(it.price)}
            </Text>
          ))}
          {o.discount > 0 ? (
            <Text style={styles.meta}>
              {t('orders.discount', { code: o.promo_code })}: −{formatKzt(o.discount)}
            </Text>
          ) : null}
          <Text style={styles.total}>
            {t('orders.total')}: {formatKzt(o.total)}
          </Text>
          {o.status === 'free' ? (
            <Button title={t('orgOrders.cancel')} variant="secondary" onPress={() => setAction({ order: o, kind: 'cancel' })} />
          ) : null}
          {o.status === 'paid' ? (
            <Button title={t('orgOrders.refund')} variant="secondary" onPress={() => setAction({ order: o, kind: 'refund' })} />
          ) : null}
        </Card>
      ))}

      <ConfirmDialog
        visible={action !== null}
        title={action?.kind === 'refund' ? t('orgOrders.refundTitle') : t('orgOrders.cancelTitle')}
        text={t('orgOrders.actionText')}
        confirmLabel={action?.kind === 'refund' ? t('orgOrders.refund') : t('orgOrders.cancel')}
        withReason
        onCancel={() => setAction(null)}
        onConfirm={act}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  line: { fontSize: 15, color: colors.text },
  total: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
});
