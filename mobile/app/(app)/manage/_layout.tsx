import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

// Organizer area (packages 1-4, 2-2, 2-3, 2-4): own events and everything inside one event.
export default function ManageLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackTitle: t('tabs.manage') }}>
      <Stack.Screen name="index" options={{ title: t('tabs.manage') }} />
      <Stack.Screen name="new" options={{ title: t('eventForm.newTitle') }} />
      <Stack.Screen name="campaigns" options={{ title: t('manage.campaigns') }} />
      <Stack.Screen name="profile" options={{ title: t('manage.profile') }} />
      <Stack.Screen name="support/index" options={{ title: t('manage.support') }} />
      <Stack.Screen name="support/[id]" options={{ title: t('manage.support') }} />
      <Stack.Screen name="[id]/index" options={{ title: t('manage.dashboard') }} />
      <Stack.Screen name="[id]/edit" options={{ title: t('eventForm.editTitle') }} />
      <Stack.Screen name="[id]/ticket-types" options={{ title: t('manage.sections.ticketTypes') }} />
      <Stack.Screen name="[id]/staff" options={{ title: t('manage.sections.staff') }} />
      <Stack.Screen name="[id]/orders" options={{ title: t('manage.sections.orders') }} />
      <Stack.Screen name="[id]/attendees" options={{ title: t('manage.sections.attendees') }} />
      <Stack.Screen name="[id]/activation" options={{ title: t('manage.sections.activation') }} />
      <Stack.Screen name="[id]/analytics" options={{ title: t('manage.sections.analytics') }} />
      <Stack.Screen name="[id]/history" options={{ title: t('manage.sections.history') }} />
    </Stack>
  );
}
