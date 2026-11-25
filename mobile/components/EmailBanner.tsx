import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';

// "Your email is not confirmed" note for the profile screen (package 1-3).
// Asks /api/me each time the screen opens, so it hides right after the email is confirmed.
export function EmailBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [verified, setVerified] = useState(user?.email_verified ?? true);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      api<User>('/me')
        .then((me) => {
          if (live) setVerified(me.email_verified);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );

  if (verified) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{t('account.notVerified')}</Text>
      <Button title={t('account.confirmNow')} variant="secondary" onPress={() => router.push('/verify-email')} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  text: { fontSize: 15, color: colors.text },
});
