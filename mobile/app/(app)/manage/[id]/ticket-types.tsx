import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Notice } from '@/components/Notice';
import { Card, Heading } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime, formatKzt, fromDateInput, toDateInput } from '@/lib/format';
import type { EventDetail, TicketType } from '@/lib/types';

type Draft = {
  name: string;
  description: string;
  price: string;
  quantity: string;
  salesStart: string;
  salesEnd: string;
  maxPerOrder: string;
  hidden: boolean;
};

const EMPTY: Draft = { name: '', description: '', price: '0', quantity: '', salesStart: '', salesEnd: '', maxPerOrder: '', hidden: false };

function toDraft(tt: TicketType): Draft {
  return {
    name: tt.name,
    description: tt.description,
    price: String(tt.price),
    quantity: String(tt.quantity),
    salesStart: toDateInput(tt.sales_starts_at),
    salesEnd: toDateInput(tt.sales_ends_at),
    maxPerOrder: tt.max_per_order ? String(tt.max_per_order) : '',
    hidden: tt.hidden,
  };
}

// Ticket types of one event (package 2-4, SRS 4.3):
// POST /api/events/{id}/ticket-types, PUT/DELETE /api/events/{id}/ticket-types/{typeId}.
export default function TicketTypesScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<TicketType | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setEvent(await api<EventDetail>(`/events/${id}`));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function open(target: TicketType | 'new') {
    setNotice('');
    setError('');
    setEditing(target === 'new' ? 'new' : target.id);
    setDraft(target === 'new' ? EMPTY : toDraft(target));
  }

  async function save() {
    const price = Number(draft.price || '0');
    const quantity = Number(draft.quantity);
    const max = draft.maxPerOrder.trim() ? Number(draft.maxPerOrder) : null;
    if (!draft.name.trim() || !draft.quantity.trim()) {
      setError(t('errors.required'));
      return;
    }
    if (![price, quantity].every(Number.isInteger) || (max !== null && !Number.isInteger(max))) {
      setError(t('ticketTypes.badNumber'));
      return;
    }
    const start = fromDateInput(draft.salesStart);
    const end = fromDateInput(draft.salesEnd);
    if (start === null || end === null) {
      setError(t('eventForm.badDate'));
      return;
    }
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      price,
      quantity,
      sales_starts_at: start || null,
      sales_ends_at: end || null,
      max_per_order: max,
      hidden: draft.hidden,
    };
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') await api(`/events/${id}/ticket-types`, { method: 'POST', body });
      else await api(`/events/${id}/ticket-types/${editing}`, { method: 'PUT', body });
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  async function remove() {
    if (!deleting) return;
    await api(`/events/${id}/ticket-types/${deleting.id}`, { method: 'DELETE' });
    setDeleting(null);
    await load();
  }

  if (!event && loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!event) return <Loading />;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const hasPaid = event.ticket_types.some((tt) => tt.price > 0);

  return (
    <Screen>
      <Notice>{notice}</Notice>
      {event.ticket_types.length === 0 && editing === null ? <Muted>{t('ticketTypes.empty')}</Muted> : null}
      {hasPaid && event.paid_sales !== 'active' ? <Muted>{t('ticketTypes.paidNeedsActivation')}</Muted> : null}

      {event.ticket_types.map((tt) =>
        editing === tt.id ? null : (
          <Card key={tt.id}>
            <View style={styles.headRow}>
              <Text style={styles.name}>{tt.name}</Text>
              {tt.hidden ? <Badge label={t('ticketTypes.hiddenBadge')} tone="neutral" /> : null}
            </View>
            {tt.description ? <Text style={styles.meta}>{tt.description}</Text> : null}
            <Text style={styles.price}>{formatKzt(tt.price)}</Text>
            <Text style={styles.meta}>{t('ticketTypes.left', { left: tt.quantity_left, quantity: tt.quantity })}</Text>
            {tt.sales_starts_at || tt.sales_ends_at ? (
              <Text style={styles.meta}>
                {t('checkout.sales', { from: formatDateTime(tt.sales_starts_at), to: formatDateTime(tt.sales_ends_at) })}
              </Text>
            ) : null}
            {tt.max_per_order ? <Text style={styles.meta}>{t('checkout.maxPerOrder', { n: tt.max_per_order })}</Text> : null}
            {editing === null && event.status !== 'cancelled' ? (
              <View style={styles.actions}>
                <Button title={t('manage.edit')} variant="secondary" onPress={() => open(tt)} />
                <Button title={t('ticketTypes.delete')} variant="secondary" onPress={() => setDeleting(tt)} />
              </View>
            ) : null}
          </Card>
        ),
      )}

      {editing !== null ? (
        <Card>
          <Heading>{editing === 'new' ? t('ticketTypes.newTitle') : t('ticketTypes.editTitle')}</Heading>
          <View style={styles.form}>
            <Field label={t('ticketTypes.name')} value={draft.name} onChangeText={(v) => set({ name: v })} maxLength={100} />
            <Field label={t('ticketTypes.description')} value={draft.description} onChangeText={(v) => set({ description: v })} />
            <Field label={t('ticketTypes.price')} value={draft.price} onChangeText={(v) => set({ price: v })} keyboardType="number-pad" />
            <Field label={t('ticketTypes.quantity')} value={draft.quantity} onChangeText={(v) => set({ quantity: v })} keyboardType="number-pad" />
            <Field
              label={t('ticketTypes.salesStart')}
              hint={t('eventForm.dateHint')}
              value={draft.salesStart}
              onChangeText={(v) => set({ salesStart: v })}
            />
            <Field
              label={t('ticketTypes.salesEnd')}
              hint={t('eventForm.dateHint')}
              value={draft.salesEnd}
              onChangeText={(v) => set({ salesEnd: v })}
            />
            <Field
              label={t('ticketTypes.maxPerOrder')}
              value={draft.maxPerOrder}
              onChangeText={(v) => set({ maxPerOrder: v })}
              keyboardType="number-pad"
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('ticketTypes.hidden')}</Text>
              <Switch value={draft.hidden} onValueChange={(v) => set({ hidden: v })} accessibilityLabel={t('ticketTypes.hidden')} />
            </View>
            <ErrorText>{error}</ErrorText>
            <Button title={t('ticketTypes.save')} onPress={() => void save()} loading={busy} />
            <Button title={t('common.cancel')} variant="secondary" onPress={() => setEditing(null)} disabled={busy} />
          </View>
        </Card>
      ) : event.status !== 'cancelled' ? (
        <Button title={t('ticketTypes.add')} onPress={() => open('new')} />
      ) : null}

      <ConfirmDialog
        visible={deleting !== null}
        title={t('ticketTypes.deleteTitle')}
        text={t('ticketTypes.deleteText')}
        confirmLabel={t('ticketTypes.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  price: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  form: { gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchLabel: { flex: 1, fontSize: 15, color: colors.text },
});
