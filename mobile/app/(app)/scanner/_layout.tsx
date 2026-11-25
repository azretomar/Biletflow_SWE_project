import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ScannerLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('tabs.scanner') }} />
      <Stack.Screen name="[id]" options={{ title: t('tabs.scanner'), headerBackTitle: t('tabs.scanner') }} />
      <Stack.Screen name="search" options={{ title: t('staffSearch.title') }} />
    </Stack>
  );
}
