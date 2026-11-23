import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LanguagePicker } from '@/components/LanguagePicker';
import { Button, Muted, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.name}>{user.full_name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <Text style={styles.label}>{t('profile.role')}</Text>
        <Text style={styles.value}>{t(`roles.${user.role}`)}</Text>
      </View>

      {user.role === 'platform_admin' ? <Muted>{t('profile.adminNote')}</Muted> : null}

      <Text style={styles.label}>{t('profile.language')}</Text>
      <LanguagePicker />

      <Button title={t('profile.logout')} variant="secondary" onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  email: { fontSize: 15, color: colors.muted, marginBottom: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  value: { fontSize: 15, color: colors.text },
});
