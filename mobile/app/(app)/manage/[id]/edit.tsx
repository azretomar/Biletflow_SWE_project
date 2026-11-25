import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EventForm, type EventBody } from '@/components/EventForm';
import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import type { EventDetail } from '@/lib/types';

export default function EditEventScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setEvent(await api<EventDetail>(`/events/${id}`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(body: EventBody) {
    await api(`/events/${id}`, { method: 'PUT', body: { ...body, status: event?.status === 'cancelled' ? undefined : event?.status } });
    router.back();
  }

  if (error) {
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!event) return <Loading />;

  return (
    <Screen>
      <EventForm initial={event} submitLabel={t('eventForm.save')} showPublish={false} onSubmit={save} />
    </Screen>
  );
}
