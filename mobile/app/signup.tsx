import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AuthScreen } from '@/components/AuthScreen';
import { Button, ErrorText, Field, Muted, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { useAuth } from '@/lib/auth';

type SignupRole = 'attendee' | 'organizer';

export default function SignupScreen() {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SignupRole>('attendee');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fullName.trim() || !email.trim() || !password) {
      setError(t('errors.required'));
      return;
    }
    // Same limits as the backend (bcrypt accepts at most 72 bytes).
    if (password.length < 8 || password.length > 72) {
      setError(t('errors.passwordLength'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await signup(fullName.trim(), email.trim(), password, role);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <Title>{t('auth.signupTitle')}</Title>
      <Muted>{t('auth.signupSubtitle')}</Muted>
      <Field label={t('auth.fullName')} value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
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
        hint={t('auth.passwordHint')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <Text style={styles.label}>{t('auth.iWantTo')}</Text>
      <View style={styles.roles} accessibilityRole="radiogroup">
        <RoleOption
          selected={role === 'attendee'}
          title={t('auth.attend')}
          hint={t('auth.attendHint')}
          onPress={() => setRole('attendee')}
        />
        <RoleOption
          selected={role === 'organizer'}
          title={t('auth.organize')}
          hint={t('auth.organizeHint')}
          onPress={() => setRole('organizer')}
        />
      </View>

      <ErrorText>{error}</ErrorText>
      <Button title={t('auth.signup')} onPress={submit} loading={busy} />
      <View style={styles.switch}>
        <Text style={styles.switchText}>{t('auth.haveAccount')} </Text>
        <Link href="/login" replace style={styles.link}>
          {t('auth.goLogin')}
        </Link>
      </View>
    </AuthScreen>
  );
}

function RoleOption(props: { selected: boolean; title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${props.title}. ${props.hint}`}
      accessibilityState={{ checked: props.selected }}
      style={[styles.role, props.selected && styles.roleSelected]}
    >
      <Text style={[styles.roleTitle, props.selected && styles.roleTitleSelected]}>{props.title}</Text>
      <Text style={styles.roleHint}>{props.hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  roles: { gap: spacing.sm },
  role: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  roleSelected: { borderColor: colors.blue, borderWidth: 2, backgroundColor: '#eef3fe' },
  roleTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  roleTitleSelected: { color: colors.blue },
  roleHint: { fontSize: 13, color: colors.muted },
  switch: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  switchText: { color: colors.muted, fontSize: 15 },
  link: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});
