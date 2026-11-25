import { StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

// A short success message after an action ("Saved.", "Done.").
export function Notice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <Text style={styles.notice} accessibilityLiveRegion="polite" accessibilityRole="text">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  notice: {
    color: colors.success,
    backgroundColor: '#e6f4ea',
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
    overflow: 'hidden',
  },
});
