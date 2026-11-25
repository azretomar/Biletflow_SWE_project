import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthScreen } from '@/components/AuthScreen';
import { Button, ErrorText, Field, Muted, Title } from '@/components/ui';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim()) {
      setError(t('errors.required'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <Title>{t('account.forgotTitle')}</Title>
      {sent ? (
        <>
          <Muted>{t('account.sent')}</Muted>
          <Button title={t('account.haveLink')} onPress={() => router.replace('/reset-password')} />
        </>
      ) : (
        <>
          <Muted>{t('account.forgotText')}</Muted>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onSubmitEditing={() => void submit()}
          />
          <ErrorText>{error}</ErrorText>
          <Button title={t('account.sendLink')} onPress={() => void submit()} loading={busy} />
        </>
      )}
      <Button title={t('account.backToLogin')} variant="secondary" onPress={() => router.replace('/login')} />
    </AuthScreen>
  );
}
