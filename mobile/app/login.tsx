import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Muted, Title } from '@/components/ui';
import { AuthScreen } from '@/components/AuthScreen';
import { colors } from '@/constants/theme';
import { errorText } from '@/i18n';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError(t('errors.required'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <Title>{t('auth.loginTitle')}</Title>
      <Muted>{t('auth.loginSubtitle')}</Muted>
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={t('auth.login')} onPress={submit} loading={busy} />
      <View style={styles.switch}>
        <Text style={styles.switchText}>{t('auth.noAccount')} </Text>
        <Link href="/signup" replace style={styles.link}>
          {t('auth.goSignup')}
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  switchText: { color: colors.muted, fontSize: 15 },
  link: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});
