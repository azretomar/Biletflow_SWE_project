import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/components/Chips';
import { Notice } from '@/components/Notice';
import { Card, Heading } from '@/components/OrgUi';
import { Button, ErrorText, Field, Loading, Muted, Screen, Title } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { errorText } from '@/i18n';
import { api } from '@/lib/api';
import { formatKzt } from '@/lib/format';
import type { CheckoutResponse, EventDetail, PromoValidation } from '@/lib/types';

type Outcome = 'success' | 'failure';

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; items: string; promo?: string }>();
  const items = useMemo(() => {
    try {
      return JSON.parse(params.items ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  }, [params.items]);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState(params.promo ?? '');
  const [promo, setPromo] = useState<PromoValidation | null>(null);
  const [promoError, setPromoError] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [simulate, setSimulate] = useState<Outcome>('success');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckoutResponse | null>(null);

  const applyPromo = useCallback(
    async (value: string) => {
      const c = value.trim();
      if (!c) return;
      setPromoBusy(true);
      setPromoError('');
      try {
        setPromo(await api<PromoValidation>('/promo/validate', { method: 'POST', body: { event_id: params.id, code: c } }));
      } catch (err) {
        setPromo(null);
        setPromoError(errorText(err));
      }
      setPromoBusy(false);
    },
    [params.id],
  );

  useEffect(() => {
    (async () => {
      try {
        setEvent(await api<EventDetail>(`/events/${params.id}`));
      } catch (err) {
        setLoadError(errorText(err));
      }
    })();
    if (params.promo) void applyPromo(params.promo);
  }, [params.id, params.promo, applyPromo]);

  if (loadError) {
    return (
      <Screen>
        <ErrorText>{loadError}</ErrorText>
      </Screen>
    );
  }
  if (!event) return <Loading />;

  const lines = Object.entries(items)
    .map(([typeId, n]) => ({ tt: event.ticket_types.find((x) => x.id === typeId), n }))
    .filter((l): l is { tt: NonNullable<typeof l.tt>; n: number } => !!l.tt && l.n > 0);
  const subtotal = lines.reduce((sum, l) => sum + l.tt.price * l.n, 0);
  const discount = promo
    ? Math.min(subtotal, promo.discount_type === 'percent' ? Math.round((subtotal * promo.amount) / 100) : promo.amount)
    : 0;
  const total = subtotal - discount;

  async function pay() {
    setBusy(true);
    setError('');
    try {
      setResult(
        await api<CheckoutResponse>('/orders/checkout', {
          method: 'POST',
          body: {
            event_id: params.id,
            items: lines.map((l) => ({ ticket_type_id: l.tt.id, quantity: l.n })),
            promo_code: promo?.code ?? '',
            simulate,
          },
        }),
      );
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  if (result) {
    const failed = result.status === 'failed';
    return (
      <Screen>
        <Title>{failed ? t('checkout.failedTitle') : result.status === 'free' ? t('checkout.freeTitle') : t('checkout.paidTitle')}</Title>
        <Text style={styles.eventTitle}>{event.title}</Text>
        {failed ? <ErrorText>{t('checkout.failedText')}</ErrorText> : <Notice>{t('checkout.issued', { n: result.tickets.length })}</Notice>}
        <Card>
          <Row label={t('checkout.subtotal')} value={formatKzt(result.subtotal)} />
          {result.discount > 0 ? <Row label={t('checkout.discount')} value={`−${formatKzt(result.discount)}`} /> : null}
          <Row label={t('checkout.total')} value={formatKzt(result.total)} strong />
        </Card>
        <Muted>{t('checkout.simulated')}</Muted>
        {failed ? (
          <Button title={t('checkout.tryAgain')} onPress={() => setResult(null)} />
        ) : (
          <Button
            title={t('checkout.goTickets')}
            onPress={() => {
              router.dismissAll();
              router.navigate('/tickets');
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.eventTitle}>{event.title}</Text>
      <Heading>{t('checkout.summary')}</Heading>
      <Card>
        {lines.map((l) => (
          <Row key={l.tt.id} label={t('checkout.line', { name: l.tt.name, n: l.n })} value={formatKzt(l.tt.price * l.n)} />
        ))}
      </Card>

      <Heading>{t('checkout.promo')}</Heading>
      {promo ? (
        <View style={styles.promoRow}>
          <Notice>{t('checkout.promoApplied', { code: promo.code })}</Notice>
          <Button
            title={t('checkout.remove')}
            variant="secondary"
            onPress={() => {
              setPromo(null);
              setCode('');
            }}
          />
        </View>
      ) : (
        <>
          <Field label={t('checkout.promo')} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} />
          <ErrorText>{promoError}</ErrorText>
          <Button title={t('checkout.apply')} variant="secondary" onPress={() => void applyPromo(code)} loading={promoBusy} disabled={!code.trim()} />
        </>
      )}

      <Card>
        <Row label={t('checkout.subtotal')} value={formatKzt(subtotal)} />
        {discount > 0 ? <Row label={t('checkout.discount')} value={`−${formatKzt(discount)}`} /> : null}
        <Row label={t('checkout.total')} value={formatKzt(total)} strong />
      </Card>

      {total > 0 ? (
        <>
          <Text style={styles.label}>{t('checkout.outcome')}</Text>
          <Chips
            label={t('checkout.outcome')}
            value={simulate}
            onChange={setSimulate}
            options={[
              { value: 'success', label: t('checkout.success') },
              { value: 'failure', label: t('checkout.failure') },
            ]}
          />
          <Muted>{t('checkout.simulated')}</Muted>
        </>
      ) : null}

      <ErrorText>{error}</ErrorText>
      <Button
        title={total > 0 ? t('checkout.pay', { amount: formatKzt(total) }) : t('checkout.getTickets')}
        onPress={() => void pay()}
        loading={busy}
        disabled={lines.length === 0}
      />
    </Screen>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eventTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  promoRow: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { flex: 1, fontSize: 15, color: colors.text },
  rowValue: { fontSize: 15, color: colors.text },
  strong: { fontWeight: '700' },
});
