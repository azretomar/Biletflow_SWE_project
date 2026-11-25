import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing } from '@/constants/theme';
import { LANGUAGES, setLanguage } from '@/i18n';

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {LANGUAGES.map((lang) => {
        const selected = i18n.language === lang.code;
        return (
          <Pressable
            key={lang.code}
            onPress={() => void setLanguage(lang.code)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={lang.label}
            style={[styles.item, compact ? styles.itemCompact : styles.itemFull, selected && styles.selected]}
          >
            <Text style={[styles.text, selected && styles.textSelected]}>
              {compact ? SHORT[lang.code] : lang.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const SHORT = { kk: 'ҚАЗ', ru: 'РУС', en: 'ENG' } as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  item: { alignItems: 'center', justifyContent: 'center' },
  itemFull: { flex: 1, paddingVertical: 10, paddingHorizontal: spacing.sm },
  itemCompact: { paddingVertical: 6, paddingHorizontal: 10 },
  selected: { backgroundColor: colors.blue },
  text: { fontSize: 14, color: colors.text, fontWeight: '600' },
  textSelected: { color: '#fff' },
});
