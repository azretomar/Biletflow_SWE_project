import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EventForm, type EventBody } from '@/components/EventForm';
import { Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { Event } from '@/lib/types';

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
