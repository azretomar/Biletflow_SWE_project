import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, ticketTone } from '@/components/Badge';
import { Notice } from '@/components/Notice';
import { Card } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import type { CheckinResult, StaffAttendees } from '@/lib/types';

type Person = StaffAttendees['attendees'][number];

export default function StaffSearchScreen() {
  const { t } = useTranslation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [data, setData] = useState<StaffAttendees | null>(null);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      setError('');
      try {
        setData(await api<StaffAttendees>(`/staff/events/${id}/attendees?q=${encodeURIComponent(q)}`));
        setSearched(q);
      } catch (err) {
        setError(errorText(err));
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      void load(searched);
    }, [load]),
  );

  async function checkIn(p: Person) {
    setBusy(p.ticket_id);
    setNotice('');
    setError('');
    try {
      const res = await api<CheckinResult>('/checkin', { method: 'POST', body: { event_id: id, qr_code: p.qr_code } });
      if (res.result === 'valid') setNotice(t('staffSearch.done', { name: p.full_name }));
      else setError(t(res.result === 'already_used' ? 'scanner.alreadyUsed' : 'scanner.invalid'));
      await load(searched);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
  }

  async function undo(p: Person) {
    setBusy(p.ticket_id);
    setNotice('');
    setError('');
    try {
      await api('/checkin/undo', { method: 'POST', body: { event_id: id, ticket_id: p.ticket_id } });
      setNotice(t('staffSearch.undone', { name: p.full_name }));
      await load(searched);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
  }

  if (!data && !error) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: title || t('staffSearch.title') }} />
      {data ? (
        <Text style={styles.counter} accessibilityRole="header">
          {t('staffSearch.counter', { checked: data.checked_in, registered: data.registered })}
        </Text>
      ) : null}
      <Field
        label={t('staffSearch.search')}
        hint={t('staffSearch.hint')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => void load(query.trim())}
      />
      <Button title={t('staffSearch.find')} variant="secondary" onPress={() => void load(query.trim())} disabled={!query.trim()} />
      <ErrorText>{error}</ErrorText>
      <Notice>{notice}</Notice>

      {data && searched && data.attendees.length === 0 ? <Muted>{t('staffSearch.empty')}</Muted> : null}
      {data?.attendees.map((p) => (
        <Card key={p.ticket_id}>
          <View style={styles.head}>
            <Text style={styles.name}>{p.full_name}</Text>
            <Badge label={t(`ticketStatus.${p.status}`)} tone={ticketTone(p.status)} />
          </View>
          <Text style={styles.meta}>{p.email}</Text>
          <Text style={styles.meta}>{p.ticket_type}</Text>
          {p.checked_in_at ? <Text style={styles.meta}>{t('staffSearch.checkedInAt', { time: formatTime(p.checked_in_at) })}</Text> : null}
          {p.status === 'valid' ? (
            <Button title={t('staffSearch.checkIn')} onPress={() => void checkIn(p)} loading={busy === p.ticket_id} />
          ) : null}
          {p.status === 'checked_in' ? (
            <Button title={t('staffSearch.undo')} variant="secondary" onPress={() => void undo(p)} loading={busy === p.ticket_id} />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  counter: { fontSize: 22, fontWeight: '800', color: colors.text },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
});
