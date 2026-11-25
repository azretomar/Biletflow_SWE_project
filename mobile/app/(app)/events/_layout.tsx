import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function EventsLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('tabs.events') }} />
      <Stack.Screen name="[id]" options={{ title: t('events.details'), headerBackTitle: t('tabs.events') }} />
      <Stack.Screen name="checkout" options={{ title: t('checkout.title') }} />
    </Stack>
  );
}
