import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthScreen } from '@/components/AuthScreen';
import { tokenFromLink } from '@/components/emailLink';
import { Button, ErrorText, Field, Muted, Title } from '@/components/ui';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [link, setLink] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const token = tokenFromLink(link);
    if (!token) return setError(t('account.badLink'));
    if (password.length < 8 || password.length > 72) return setError(t('errors.passwordLength'));
    if (password !== repeat) return setError(t('account.mismatch'));
    setError('');
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <Title>{t('account.resetTitle')}</Title>
      {done ? (
        <>
          <Muted>{t('account.resetDone')}</Muted>
          <Button title={t('account.backToLogin')} onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <Field
            label={t('account.linkLabel')}
            hint={t('account.linkHint')}
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label={t('account.newPassword')}
            hint={t('auth.passwordHint')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Field
            label={t('account.repeatPassword')}
            value={repeat}
            onChangeText={setRepeat}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => void submit()}
          />
          <ErrorText>{error}</ErrorText>
          <Button title={t('account.savePassword')} onPress={() => void submit()} loading={busy} />
          <Button title={t('account.backToLogin')} variant="secondary" onPress={() => router.replace('/login')} />
        </>
      )}
    </AuthScreen>
  );
}
