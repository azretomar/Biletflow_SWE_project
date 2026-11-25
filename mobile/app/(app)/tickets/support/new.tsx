import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/components/Chips';
import { Button, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import type { CaseContext, SupportCategory } from '@/lib/types';

const CATEGORIES: SupportCategory[] = ['tickets', 'payment', 'event', 'account', 'organizer', 'other'];

export default function NewSupportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ ticket?: string; order?: string; event?: string }>();
  const context: CaseContext | null = params.ticket
    ? { type: 'ticket', id: params.ticket }
    : params.order
      ? { type: 'order', id: params.order }
      : params.event
        ? { type: 'event', id: params.event }
        : null;
  const firstCategory: SupportCategory =
    context?.type === 'ticket' ? 'tickets' : context?.type === 'order' ? 'payment' : context?.type === 'event' ? 'event' : 'other';

  const [category, setCategory] = useState<SupportCategory>(firstCategory);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!subject.trim()) {
      setError(t('errors.required'));
      return;
    }
    if (message.trim().length < 10) {
      setError(t('support.tooShort'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await api<{ id: number }>('/support/cases', {
        method: 'POST',
        body: { category, subject: subject.trim(), message: message.trim(), context },
      });
      router.replace({ pathname: '/tickets/support/[id]', params: { id: String(res.id) } });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const aboutWhat =
    context?.type === 'ticket'
      ? t('support.aboutTicket')
      : context?.type === 'order'
        ? t('support.aboutOrder')
        : t('support.aboutEvent');

  return (
    <Screen>
      {context ? <Muted>{t('support.about', { what: aboutWhat })}</Muted> : null}
      <Text style={styles.label}>{t('support.topic')}</Text>
      <Chips<SupportCategory>
        label={t('support.topic')}
        value={category}
        onChange={setCategory}
        options={CATEGORIES.map((c) => ({ value: c, label: t(`support.categories.${c}`) }))}
      />
      <Field label={t('support.subject')} value={subject} onChangeText={setSubject} maxLength={200} />
      <Field
        label={t('support.message')}
        hint={t('support.messageHint')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={5000}
        style={styles.message}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={t('support.send')} onPress={() => void submit()} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: -spacing.sm },
  message: {
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: colors.fieldBg,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
});
