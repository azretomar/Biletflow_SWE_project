import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { eventToBody } from '@/components/EventForm';
import { Notice } from '@/components/Notice';
import { EventStatusBadges, Heading, MenuRow } from '@/components/OrgUi';
import { Button, ErrorText, Loading, Muted, Screen, Title } from '@/components/ui';
import { colors } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { EventDetail } from '@/lib/types';

// One event for its organizer (package 1-4): details, publish / unpublish, cancel,
// and links to everything else about the event.
export default function EventDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setEvent(await api<EventDetail>(`/events/${id}`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!event && error) {
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!event) return <Loading />;

  async function setStatus(status: 'draft' | 'published') {
    if (!event) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/events/${id}`, { method: 'PUT', body: { ...eventToBody(event), status } });
      setNotice(status === 'published' ? t('manage.published') : t('manage.unpublished'));
      await load();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  async function cancelEvent(reason: string) {
    await api(`/organizer/events/${id}/cancel`, { method: 'POST', body: { reason } });
    setConfirmCancel(false);
    setNotice(t('manage.cancelled'));
    await load();
  }

  const go = (path: string) => router.push(`/manage/${id}/${path}` as never);
  const cancelled = event.status === 'cancelled';

  return (
    <Screen>
      <Stack.Screen options={{ title: event.title }} />
      <Title>{event.title}</Title>
      <EventStatusBadges event={event} />
      <Text style={styles.meta}>
        {formatDateTime(event.date)} · {event.venue}
      </Text>
      <Notice>{notice}</Notice>
      <ErrorText>{error}</ErrorText>

      {!cancelled ? (
        <>
          <Button title={t('manage.edit')} variant="secondary" onPress={() => go('edit')} />
          {event.status === 'draft' ? (
            <Button title={t('manage.publish')} onPress={() => void setStatus('published')} loading={busy} />
          ) : (
            <Button title={t('manage.unpublish')} variant="secondary" onPress={() => void setStatus('draft')} loading={busy} />
          )}
        </>
      ) : (
        <Muted>{t('manage.cancelled')}</Muted>
      )}

      <Heading>{t('manage.dashboard')}</Heading>
      <MenuRow icon="ticket-outline" label={t('manage.sections.ticketTypes')} hint={String(event.ticket_types.length)} onPress={() => go('ticket-types')} />
      <MenuRow icon="people-outline" label={t('manage.sections.staff')} onPress={() => go('staff')} />
      <MenuRow icon="receipt-outline" label={t('manage.sections.orders')} onPress={() => go('orders')} />
      <MenuRow icon="list-outline" label={t('manage.sections.attendees')} onPress={() => go('attendees')} />
      <MenuRow
        icon="card-outline"
        label={t('manage.sections.activation')}
        hint={t(`manage.paidSales.${event.paid_sales}`)}
        onPress={() => go('activation')}
      />
      <MenuRow icon="bar-chart-outline" label={t('manage.sections.analytics')} onPress={() => go('analytics')} />
      <MenuRow icon="time-outline" label={t('manage.sections.history')} onPress={() => go('history')} />
      {!cancelled ? (
        <MenuRow
          icon="qr-code-outline"
          label={t('manage.sections.scanner')}
          onPress={() => router.push({ pathname: '/scanner/[id]', params: { id: event.id, title: event.title } })}
        />
      ) : null}
      <MenuRow
        icon="eye-outline"
        label={t('manage.sections.preview')}
        onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })}
      />

      {!cancelled ? (
        <Button title={t('manage.cancelEvent')} variant="danger" onPress={() => setConfirmCancel(true)} />
      ) : null}

      <ConfirmDialog
        visible={confirmCancel}
        title={t('manage.cancelTitle')}
        text={t('manage.cancelText')}
        confirmLabel={t('manage.cancelEvent')}
        withReason
        onCancel={() => setConfirmCancel(false)}
        onConfirm={cancelEvent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 15, color: colors.muted },
});
