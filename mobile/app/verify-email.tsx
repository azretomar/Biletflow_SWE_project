import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthScreen } from '@/components/AuthScreen';
import { tokenFromLink } from '@/components/emailLink';
import { Button, ErrorText, Field, Muted, Title } from '@/components/ui';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Confirm the account email (package 1-3, SRS 4.1): POST /api/auth/verify-email { token };
// "Send again" is POST /api/auth/resend-verification (needs the login).
export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const [link, setLink] = useState(params.token ?? '');
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function submit() {
    const token = tokenFromLink(link);
    if (!token) return setError(t('account.badLink'));
    setError('');
    setNote('');
    setBusy(true);
    try {
      await api('/auth/verify-email', { method: 'POST', body: { token } });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setNote('');
    setResending(true);
    try {
      await api('/auth/resend-verification', { method: 'POST', body: {} });
      setNote(t('account.resent'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setResending(false);
    }
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace(user ? '/profile' : '/login');
  }

  return (
    <AuthScreen>
      <Title>{t('account.verifyTitle')}</Title>
      {done ? (
        <Muted>{t('account.verified')}</Muted>
      ) : (
        <>
          {user ? <Muted>{t('account.verifyText', { email: user.email })}</Muted> : null}
          <Field
            label={t('account.linkLabel')}
            hint={t('account.linkHint')}
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ErrorText>{error}</ErrorText>
          {note ? <Muted>{note}</Muted> : null}
          <Button title={t('account.verifyButton')} onPress={() => void submit()} loading={busy} />
          {user ? (
            <Button
              title={t('account.resend')}
              variant="secondary"
              onPress={() => void resend()}
              loading={resending}
            />
          ) : null}
        </>
      )}
      <Button title={t('common.cancel')} variant="secondary" onPress={close} />
    </AuthScreen>
  );
}
