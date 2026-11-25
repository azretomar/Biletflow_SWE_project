import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge, caseTone } from '@/components/Badge';
import { Button, ErrorText, Loading, Muted } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { SupportCase, SupportMessage } from '@/lib/types';

const REFRESH_MS = 15000; // new replies appear while the chat is open

// One support request as a chat (package 2-3, SRS 4.13):
// GET /api/support/cases/{id}, POST /api/support/cases/{id}/messages { body }.
// Replies from BiletFlow support or the event's organizer show on the left.
export default function SupportCaseScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setCase] = useState<SupportCase | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [reply, setReply] = useState('');
  const [sendError, setSendError] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(async () => {
    try {
      setCase(await api<SupportCase>(`/support/cases/${id}`));
      setError('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(errorText(err));
    }
  }, [id]);

  // Load when opened and keep checking for replies while the screen is visible.
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function send() {
    const body = reply.trim();
    if (!body) return;
    setSendError('');
    setBusy(true);
    try {
      await api<SupportMessage>(`/support/cases/${id}/messages`, { method: 'POST', body: { body } });
      setReply('');
      await load(); // the status may change too (a resolved request opens again)
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const header = <Stack.Screen options={{ title: t('support.request', { id }) }} />;

  if (notFound) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        {header}
        <View style={styles.pad}>
          <Muted>{t('support.notFound')}</Muted>
        </View>
      </SafeAreaView>
    );
  }
  if (!c && error) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        {header}
        <View style={styles.pad}>
          <ErrorText>{error}</ErrorText>
          <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
        </View>
      </SafeAreaView>
    );
  }
  if (!c) return <Loading />;

  // The backend sends the author's name and role; the requester's own messages go on the right.
  const isMine = (m: SupportMessage) => !!user && m.author_role === user.role && m.author_name === user.full_name;
  const authorLabel = (m: SupportMessage) => {
    if (isMine(m)) return t('support.you');
    if (m.author_role === 'organizer') return `${t('support.organizer')} · ${m.author_name}`;
    return t('support.staff');
  };
  const status = t(`support.status.${c.status}`);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {header}
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subject}>{c.subject}</Text>
          <View style={styles.metaRow}>
            <Badge label={status} tone={caseTone(c.status)} />
            <Text style={styles.meta}>{t(`support.categories.${c.category}`)}</Text>
          </View>
          {error ? <ErrorText>{error}</ErrorText> : null}

          {(c.messages ?? []).map((m) => {
            const mine = isMine(m);
            return (
              <View
                key={m.id}
                style={[styles.bubble, mine ? styles.mine : styles.theirs]}
                accessible
                accessibilityLabel={`${authorLabel(m)}, ${formatDateTime(m.created_at)}: ${m.body}`}
              >
                <Text style={[styles.author, mine && styles.mineText]}>{authorLabel(m)}</Text>
                <Text style={[styles.body, mine && styles.mineText]} selectable>
                  {m.body}
                </Text>
                <Text style={[styles.time, mine && styles.mineTime]}>{formatDateTime(m.created_at)}</Text>
              </View>
            );
          })}
          {c.status === 'resolved' ? <Muted>{t('support.reopenHint')}</Muted> : null}
        </ScrollView>

        <View style={styles.replyBar}>
          <TextInput
            style={styles.input}
            value={reply}
            onChangeText={setReply}
            placeholder={t('support.replyPlaceholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('support.reply')}
            multiline
            maxLength={5000}
          />
          <View style={styles.sendButton}>
            <Button title={t('support.sendReply')} onPress={() => void send()} loading={busy} disabled={!reply.trim()} />
          </View>
        </View>
        {sendError ? (
          <View style={styles.sendError}>
            <ErrorText>{sendError}</ErrorText>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: spacing.md, gap: spacing.md },
  content: { padding: spacing.md, gap: spacing.sm },
  subject: { fontSize: 20, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { fontSize: 14, color: colors.muted },
  bubble: { maxWidth: '85%', borderRadius: radius.md, padding: spacing.sm + 2, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.blue },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  author: { fontSize: 13, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  time: { fontSize: 12, color: colors.muted },
  mineText: { color: '#ffffff' },
  mineTime: { color: '#dbe6ff' },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.fieldBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  sendButton: { width: 110 },
  sendError: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
});
