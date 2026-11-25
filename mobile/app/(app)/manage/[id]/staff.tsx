import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Notice } from '@/components/Notice';
import { Card, Heading } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { StaffMember } from '@/lib/types';

export default function StaffScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setStaff(await api<StaffMember[]>(`/events/${id}/staff`));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function add() {
    if (!email.trim()) {
      setError(t('errors.required'));
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const m = await api<StaffMember>(`/events/${id}/staff`, { method: 'POST', body: { email: email.trim() } });
      setEmail('');
      setNotice(t('staff.added', { name: m.full_name }));
      await load();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  async function remove() {
    if (!removing) return;
    await api(`/events/${id}/staff/${removing.user_id}`, { method: 'DELETE' });
    setRemoving(null);
    setNotice('');
    await load();
  }

  if (!staff && loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!staff) return <Loading />;

  return (
    <Screen>
      <Muted>{t('staff.intro')}</Muted>
      <Field
        label={t('staff.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        onSubmitEditing={() => void add()}
      />
      <ErrorText>{error}</ErrorText>
      <Notice>{notice}</Notice>
      <Button title={t('staff.add')} onPress={() => void add()} loading={busy} />

      <Heading>{t('manage.sections.staff')}</Heading>
      {staff.length === 0 ? <Muted>{t('staff.empty')}</Muted> : null}
      {staff.map((m) => (
        <Card key={m.user_id}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name}>{m.full_name}</Text>
              <Text style={styles.meta}>{m.email}</Text>
              <Text style={styles.meta}>{t('staff.assignedAt', { date: formatDateTime(m.assigned_at) })}</Text>
            </View>
          </View>
          <Button title={t('staff.remove')} variant="secondary" onPress={() => setRemoving(m)} />
        </Card>
      ))}

      <ConfirmDialog
        visible={removing !== null}
        title={t('staff.removeTitle', { name: removing?.full_name ?? '' })}
        text={t('staff.removeText')}
        confirmLabel={t('staff.remove')}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
});
