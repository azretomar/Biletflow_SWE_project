import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, caseTone } from '@/components/Badge';
import { Chips } from '@/components/Chips';
import { Notice } from '@/components/Notice';
import { Heading } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { CaseStatus, OrganizerCase, SupportMessage } from '@/lib/types';

const STATUSES: CaseStatus[] = ['open', 'in_progress', 'waiting', 'resolved'];
const POLL_MS = 15000;

export default function OrganizerCaseScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<OrganizerCase | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setItem(await api<OrganizerCase>(`/organizer/support/cases/${id}`));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api<SupportMessage>(`/organizer/support/cases/${id}/messages`, { method: 'POST', body: { body: reply.trim() } });
      setReply('');
      await load();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  async function setStatus(status: CaseStatus) {
    setError('');
    setNotice('');
    try {
      await api(`/organizer/support/cases/${id}`, { method: 'PATCH', body: { status } });
      setNotice(t('orgSupport.statusSaved'));
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!item && loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!item) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('support.request', { id: item.id }) }} />
      <Text style={styles.subject}>{item.subject}</Text>
      <Badge label={t(`orgSupport.statuses.${item.status}`)} tone={caseTone(item.status)} />
      {item.requester ? <Muted>{t('orgSupport.from', { name: `${item.requester.full_name}${item.requester.email ? ` · ${item.requester.email}` : ''}` })}</Muted> : null}
      {item.event ? <Muted>{item.event.title}</Muted> : null}

      <Heading>{t('orgSupport.statusLabel')}</Heading>
      <Chips
        label={t('orgSupport.statusLabel')}
        value={item.status}
        onChange={(s) => void setStatus(s)}
        options={STATUSES.map((s) => ({ value: s, label: t(`orgSupport.statuses.${s}`) }))}
      />
      <Notice>{notice}</Notice>

      <Heading>{t('support.message')}</Heading>
      {(item.messages ?? []).map((m) => {
        const mine = m.author_role === 'organizer';
        return (
          <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            <Text style={styles.author}>{mine ? t('support.you') : m.author_name}</Text>
            <Text style={styles.body}>{m.body}</Text>
            <Text style={styles.time}>{formatDateTime(m.created_at)}</Text>
          </View>
        );
      })}

      <Field label={t('orgSupport.reply')} value={reply} onChangeText={setReply} multiline placeholder={t('support.replyPlaceholder')} />
      <ErrorText>{error}</ErrorText>
      <Button title={t('orgSupport.send')} onPress={() => void send()} loading={busy} disabled={!reply.trim()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subject: { fontSize: 20, fontWeight: '700', color: colors.text },
  bubble: { borderRadius: radius.md, padding: spacing.md, gap: 4, maxWidth: '90%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#e8f0fe' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  author: { fontSize: 13, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  time: { fontSize: 12, color: colors.muted },
});
