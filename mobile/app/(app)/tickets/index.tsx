import { useTranslation } from 'react-i18next';

import { Muted, Screen } from '@/components/ui';

// Placeholder until this screen is built.
export default function Placeholder() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Muted>{t('placeholder.soon')}</Muted>
    </Screen>
  );
}
