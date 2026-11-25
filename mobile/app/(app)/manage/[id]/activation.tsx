import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Notice } from '@/components/Notice';
import { Card } from '@/components/OrgUi';
import { Button, ErrorText, Loading, Muted, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatKzt } from '@/lib/format';
import type { Activation } from '@/lib/types';

type Step = 'identity' | 'payout' | 'fee' | 'terms';

export default function ActivationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<Activation | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Step | 'activate' | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setState(await api<Activation>(`/organizer/events/${id}/activation`));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(step: Step | 'activate') {
    setBusy(step);
    setError('');
    try {
      await api(`/organizer/events/${id}/activation/${step}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
  }

  if (!state && loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
        <Button title={t('common.retry')} variant="secondary" onPress={() => void load()} />
      </Screen>
    );
  }
  if (!state) return <Loading />;

  const steps: { key: Step; label: string; done: boolean; hint?: string }[] = [
    { key: 'identity', label: t('activation.stepIdentity'), done: state.identity_verified },
    { key: 'payout', label: t('activation.stepPayout'), done: state.payout_connected, hint: t('activation.stepPayoutHint') },
    { key: 'fee', label: t('activation.stepFee', { fee: formatKzt(state.fee_kzt) }), done: state.fee_paid },
    { key: 'terms', label: t('activation.stepTerms'), done: state.terms_accepted },
  ];
  const ready = state.has_paid_ticket_type && steps.every((s) => s.done);

  return (
    <Screen>
      <Muted>{t('activation.intro')}</Muted>
      {state.paid_sales === 'active' ? <Notice>{t('activation.active')}</Notice> : null}
      {state.paid_sales === 'stopped' ? <ErrorText>{t('activation.stopped')}</ErrorText> : null}

      <Card>
        <StepLine label={t('activation.stepPaidType')} done={state.has_paid_ticket_type} />
        {!state.has_paid_ticket_type ? (
          <Button
            title={t('activation.openTicketTypes')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/manage/[id]/ticket-types', params: { id } })}
          />
        ) : null}
      </Card>

      {steps.map((s) => (
        <Card key={s.key}>
          <StepLine label={s.label} done={s.done} />
          {!s.done && s.hint ? <Text style={styles.hint}>{s.hint}</Text> : null}
          {!s.done && s.key === 'payout' ? (
            <Button title={t('activation.openProfile')} variant="secondary" onPress={() => router.push('/manage/profile')} />
          ) : null}
          {!s.done && state.paid_sales !== 'active' ? (
            <Button title={t('activation.doStep')} onPress={() => void run(s.key)} loading={busy === s.key} />
          ) : null}
        </Card>
      ))}

      <ErrorText>{error}</ErrorText>
      {state.paid_sales === 'none' ? (
        <Button title={t('activation.activate')} onPress={() => void run('activate')} loading={busy === 'activate'} disabled={!ready} />
      ) : null}
    </Screen>
  );
}

function StepLine({ label, done }: { label: string; done: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.step} accessibilityLabel={`${label}: ${done ? t('activation.done') : ''}`}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={done ? colors.success : colors.muted} />
      <Text style={styles.stepLabel}>{label}</Text>
      {done ? <Text style={styles.done}>{t('activation.done')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  done: { fontSize: 14, fontWeight: '600', color: colors.success },
  hint: { fontSize: 14, color: colors.muted },
});
