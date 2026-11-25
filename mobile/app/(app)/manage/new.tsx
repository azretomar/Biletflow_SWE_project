import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EventForm, type EventBody } from '@/components/EventForm';
import { Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { Event } from '@/lib/types';

// Create an event (package 1-4, UC1): POST /api/events, then open its dashboard.
export default function NewEventScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  async function create(body: EventBody) {
    const ev = await api<Event>('/events', { method: 'POST', body });
    router.replace({ pathname: '/manage/[id]', params: { id: ev.id } });
  }

  return (
    <Screen>
      <EventForm submitLabel={t('eventForm.create')} showPublish onSubmit={create} />
    </Screen>
  );
}
