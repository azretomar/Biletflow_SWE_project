import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function TicketsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackTitle: t('tabs.tickets') }}>
      <Stack.Screen name="index" options={{ title: t('tabs.tickets') }} />
      <Stack.Screen name="[id]" options={{ title: t('tickets.details') }} />
      <Stack.Screen name="orders" options={{ title: t('tickets.myOrders') }} />
      <Stack.Screen name="support/index" options={{ title: t('support.title') }} />
      <Stack.Screen name="support/new" options={{ title: t('support.newRequest') }} />
      <Stack.Screen name="support/[id]" options={{ title: t('support.title') }} />
    </Stack>
  );
}
